import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { api } from "@redux/backend/convex/_generated/api";
import { SKILL_LIMITS } from "@redux/types";

import { env } from "@/env";
import { fetchAuthMutation, fetchAuthQuery } from "@/lib/auth/server";
import { resolveGitHubSkill } from "@/server/skills/github";
import { storeSkillPackage } from "@/server/skills/storage";
import {
  buildSkillPackageFile,
  normalizeSkillMarkdown,
  validateSkillPackage,
} from "@/server/skills/validation";

async function getCurrentUserId() {
  const { userId } = await fetchAuthQuery(
    api.functions.user.getCurrentUserId,
    {},
  );
  return userId;
}

export const importMarkdownSkill = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      fileName: z.string().min(1).max(255),
      content: z.string().min(1).max(SKILL_LIMITS.maxEntrypointBytes),
    }),
  )
  .handler(async ({ data }) => {
    if (!data.fileName.toLowerCase().endsWith(".md")) {
      throw new Error("Upload a Markdown (.md) file");
    }
    const normalized = normalizeSkillMarkdown({
      content: data.content,
      fileName: data.fileName,
      rewriteFrontmatter: true,
    });
    const bytes = new TextEncoder().encode(normalized.content);
    if (bytes.byteLength > SKILL_LIMITS.maxEntrypointBytes) {
      throw new Error("Markdown skill is too large");
    }
    const file = await buildSkillPackageFile({
      path: "SKILL.md",
      bytes,
      mimeType: "text/markdown",
    });
    validateSkillPackage([file]);
    return storeSkillPackage({
      name: normalized.name,
      description: normalized.description,
      requestedSlug: normalized.name,
      entrypointText: normalized.content,
      metadataWasInferred: normalized.metadataWasInferred,
      enabled: true,
      allowAutoLoad: false,
      source: {
        sourceType: "upload",
        originalFileName: data.fileName,
      },
      files: [file],
    });
  });

export const importGitHubSkill = createServerFn({ method: "POST" })
  .inputValidator(z.object({ url: z.url().max(2048) }))
  .handler(async ({ data }) => {
    const resolved = await resolveGitHubSkill(data.url);
    return storeSkillPackage({
      name: resolved.name,
      description: resolved.description,
      requestedSlug: resolved.name,
      entrypointText: resolved.entrypointText,
      metadataWasInferred: resolved.metadataWasInferred,
      enabled: true,
      allowAutoLoad: false,
      source: resolved.source,
      files: resolved.files,
    });
  });

export const refreshGitHubSkill = createServerFn({ method: "POST" })
  .inputValidator(z.object({ skillId: z.string().min(1) }))
  .handler(async ({ data }) => {
    const userId = await getCurrentUserId();
    const current = await fetchAuthQuery(
      api.functions.skills.backend_getSkillSource,
      {
        secret: env.INTERNAL_CONVEX_SECRET,
        userId,
        skillId: data.skillId,
      },
    );
    if (current.sourceType !== "github" || !current.githubOriginalUrl) {
      throw new Error("Only GitHub skills can be refreshed");
    }
    const resolved = await resolveGitHubSkill(current.githubOriginalUrl);
    if (resolved.source.githubCommitSha === current.github?.commitSha) {
      return {
        skillId: current.skillId,
        changed: false,
        commitSha: resolved.source.githubCommitSha,
      };
    }
    const stored = await storeSkillPackage({
      replacingSkillId: current.skillId,
      name: resolved.name,
      description: resolved.description,
      requestedSlug: current.slug,
      entrypointText: resolved.entrypointText,
      metadataWasInferred: resolved.metadataWasInferred,
      enabled: current.enabled,
      allowAutoLoad: current.allowAutoLoad,
      source: resolved.source,
      files: resolved.files,
    });
    return {
      skillId: stored.skillId,
      changed: true,
      commitSha: resolved.source.githubCommitSha,
    };
  });

export const approveSkillProposal = createServerFn({ method: "POST" })
  .inputValidator(z.object({ proposalId: z.string().min(1) }))
  .handler(async ({ data }) => {
    const userId = await getCurrentUserId();
    const claimId = crypto.randomUUID();
    const claim = await fetchAuthMutation(
      api.functions.skills.backend_claimProposalApproval,
      {
        secret: env.INTERNAL_CONVEX_SECRET,
        userId,
        proposalId: data.proposalId,
        claimId,
      },
    );
    if (claim.state === "approved") {
      if (!claim.skillId) throw new Error("Approved skill was not found");
      return { skillId: claim.skillId };
    }
    if (claim.state === "in_progress") {
      throw new Error("This skill proposal is already being approved");
    }
    const proposal = claim.proposal;
    let storedSkillId: string | undefined;
    try {
      const files = await Promise.all(
        proposal.files.map((file) =>
          buildSkillPackageFile({
            path: file.path,
            bytes: new TextEncoder().encode(file.content),
          }),
        ),
      );
      const { entrypoint } = validateSkillPackage(files);
      const stored = await storeSkillPackage({
        name: proposal.name,
        description: proposal.description,
        requestedSlug: proposal.name,
        entrypointText: entrypoint.text ?? "",
        metadataWasInferred: false,
        enabled: true,
        allowAutoLoad: true,
        source: {
          sourceType: "model",
          proposalId: proposal.proposalId,
          sourceThreadId: proposal.threadId,
          sourceMessageId: proposal.messageId,
        },
        files,
      });
      storedSkillId = stored.skillId;
      const finalized = await fetchAuthMutation(
        api.functions.skills.backend_finalizeProposalApproval,
        {
          secret: env.INTERNAL_CONVEX_SECRET,
          userId,
          proposalId: proposal.proposalId,
          claimId,
          skillId: stored.skillId,
        },
      );
      return { skillId: finalized.skillId };
    } catch (error) {
      if (storedSkillId) {
        const currentProposal = await fetchAuthQuery(
          api.functions.skills.getProposal,
          { proposalId: proposal.proposalId },
        ).catch(() => null);
        if (
          currentProposal?.status === "approved" &&
          currentProposal.approvedSkillId === storedSkillId
        ) {
          return { skillId: storedSkillId };
        }
        await fetchAuthMutation(api.functions.skills.deleteSkill, {
          skillId: storedSkillId,
        }).catch((cleanupError) => {
          console.error(
            "Failed to roll back approved skill package",
            cleanupError,
          );
        });
      }
      await fetchAuthMutation(
        api.functions.skills.backend_releaseProposalApproval,
        {
          secret: env.INTERNAL_CONVEX_SECRET,
          userId,
          proposalId: proposal.proposalId,
          claimId,
        },
      ).catch((releaseError) => {
        console.error(
          "Failed to release skill proposal approval",
          releaseError,
        );
      });
      throw error;
    }
  });
