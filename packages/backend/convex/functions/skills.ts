import type { GenericMutationCtx, GenericQueryCtx } from "convex/server";
import { ConvexError, v } from "convex/values";

import { SKILL_LIMITS } from "@redux/types";

import type { DataModel, Doc } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import { updateUserUsageStats } from "../usageStats";
import { backendMutation, backendQuery, mutation, query } from "./index";
import { internalMutation } from "./internal";

type AuthenticatedMutationCtx = GenericMutationCtx<DataModel> & {
  userId: string;
};

type AuthenticatedQueryCtx = GenericQueryCtx<DataModel> & {
  userId: string;
};

type SkillCtx = AuthenticatedMutationCtx | AuthenticatedQueryCtx;

const skillActivationScopeValidator = v.union(
  v.literal("thread"),
  v.literal("message"),
);

const skillUsageTriggerValidator = v.union(
  v.literal("slash-message"),
  v.literal("slash-thread"),
  v.literal("auto"),
);

const APPROVAL_CLAIM_TIMEOUT_MS = 5 * 60 * 1000;

const storedSkillFileValidator = v.object({
  skillFileId: v.string(),
  path: v.string(),
  mimeType: v.string(),
  size: v.number(),
  sha256: v.string(),
  isText: v.boolean(),
  lineCount: v.optional(v.number()),
  isSymlink: v.optional(v.boolean()),
  lfsPointer: v.optional(v.boolean()),
  projectId: v.string(),
  environmentId: v.string(),
  accessKey: v.string(),
  fileKeyId: v.string(),
  chunkCount: v.number(),
});

const skillChunkRouteValidator = v.object({
  chunkIndex: v.number(),
  startLine: v.number(),
  endLine: v.number(),
  startByteInLine: v.number(),
  endByteInLine: v.number(),
  uncompressedBytes: v.number(),
  storedBytes: v.number(),
});

const storedSkillChunkValidator = v.object({
  skillFileId: v.string(),
  chunkIndex: v.number(),
  startLine: v.number(),
  endLine: v.number(),
  startByteInLine: v.number(),
  endByteInLine: v.number(),
  uncompressedBytes: v.number(),
  storedBytes: v.number(),
  encoding: v.union(v.literal("identity"), v.literal("gzip")),
  projectId: v.string(),
  environmentId: v.string(),
  accessKey: v.string(),
  fileKeyId: v.string(),
});

const storedChunkManifestValidator = v.object({
  skillFileId: v.string(),
  totalLines: v.number(),
  chunks: v.array(skillChunkRouteValidator),
});

const skillSourceValidator = v.object({
  sourceType: v.union(
    v.literal("upload"),
    v.literal("github"),
    v.literal("model"),
  ),
  originalFileName: v.optional(v.string()),
  githubOriginalUrl: v.optional(v.string()),
  githubOwner: v.optional(v.string()),
  githubRepository: v.optional(v.string()),
  githubRequestedRef: v.optional(v.string()),
  githubSelectedPath: v.optional(v.string()),
  githubCommitSha: v.optional(v.string()),
  proposalId: v.optional(v.string()),
  sourceThreadId: v.optional(v.string()),
  sourceMessageId: v.optional(v.string()),
});

function generateId() {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 22);
}

function normalizeName(name: string) {
  const normalized = name.trim().replace(/\s+/g, " ");
  if (!normalized) {
    throw new ConvexError("Skill name is required");
  }
  return normalized.slice(0, SKILL_LIMITS.maxNameLength);
}

function normalizeDescription(description: string) {
  const normalized = description.trim().replace(/\s+/g, " ");
  if (!normalized) {
    throw new ConvexError("Skill description is required");
  }
  return normalized.slice(0, SKILL_LIMITS.maxDescriptionLength);
}

function slugify(value: string) {
  const slug = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, SKILL_LIMITS.maxSlugLength)
    .replace(/-+$/g, "");
  return slug || "skill";
}

function normalizeRequestedSlug(value: string) {
  const normalized = value.trim().toLowerCase();
  if (
    !normalized ||
    normalized.length > SKILL_LIMITS.maxSlugLength ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(normalized)
  ) {
    throw new ConvexError(
      "Slash command must use lowercase letters, numbers, and single hyphens",
    );
  }
  return normalized;
}

function hasControlCharacters(value: string) {
  return [...value].some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 0x1f || codePoint === 0x7f;
  });
}

function normalizePath(path: string) {
  const normalized = path.replace(/\\/g, "/").replace(/^\.\//, "");
  const segments = normalized.split("/");
  if (
    !normalized ||
    normalized.length > SKILL_LIMITS.maxPathLength ||
    normalized.startsWith("/") ||
    segments.some(
      (segment) =>
        !segment ||
        segment === "." ||
        segment === ".." ||
        hasControlCharacters(segment),
    )
  ) {
    throw new ConvexError(`Invalid skill path: ${path}`);
  }
  return normalized;
}

async function allocateUniqueSlug(
  ctx: GenericMutationCtx<DataModel>,
  userId: string,
  requested: string,
  excludingSkillId?: string,
) {
  const base = slugify(requested);
  for (let suffix = 1; suffix <= 999; suffix += 1) {
    const suffixText = suffix === 1 ? "" : `-${suffix}`;
    const candidate = `${base.slice(0, SKILL_LIMITS.maxSlugLength - suffixText.length)}${suffixText}`;
    const existing = await ctx.db
      .query("skills")
      .withIndex("by_userId_slug", (q) =>
        q.eq("userId", userId).eq("slug", candidate),
      )
      .first();
    if (!existing || existing.skillId === excludingSkillId) {
      return candidate;
    }
  }
  throw new ConvexError("Unable to allocate a unique slash command");
}

async function requireSkill(ctx: SkillCtx, userId: string, skillId: string) {
  const skill = await ctx.db
    .query("skills")
    .withIndex("by_skillId", (q) => q.eq("skillId", skillId))
    .first();
  if (skill?.userId !== userId) {
    throw new ConvexError("Skill not found");
  }
  return skill;
}

async function requireSkillEntrypoint(ctx: SkillCtx, skillId: string) {
  const entrypoint = await ctx.db
    .query("skillEntrypoints")
    .withIndex("by_skillId", (q) => q.eq("skillId", skillId))
    .first();
  if (!entrypoint) throw new ConvexError("Skill entrypoint is unavailable");
  return entrypoint;
}

async function requireSkillManifest(ctx: SkillCtx, skillId: string) {
  const manifest = await ctx.db
    .query("skillManifests")
    .withIndex("by_skillId", (q) => q.eq("skillId", skillId))
    .first();
  if (!manifest) throw new ConvexError("Skill manifest is unavailable");
  return manifest;
}

function toSummary(skill: Doc<"skills">) {
  return {
    skillId: skill.skillId,
    name: skill.name,
    description: skill.description,
    slug: skill.slug,
    enabled: skill.enabled,
    allowAutoLoad: skill.allowAutoLoad,
    sourceType: skill.sourceType,
    fileCount: skill.fileCount,
    totalBytes: skill.totalBytes,
    metadataWasInferred: skill.metadataWasInferred,
    originalFileName: skill.originalFileName,
    github:
      skill.sourceType === "github" &&
      skill.githubOriginalUrl &&
      skill.githubOwner &&
      skill.githubRepository &&
      skill.githubRequestedRef !== undefined &&
      skill.githubSelectedPath !== undefined &&
      skill.githubCommitSha
        ? {
            originalUrl: skill.githubOriginalUrl,
            owner: skill.githubOwner,
            repository: skill.githubRepository,
            requestedRef: skill.githubRequestedRef,
            selectedPath: skill.githubSelectedPath,
            commitSha: skill.githubCommitSha,
          }
        : undefined,
    createdAt: skill.createdAt,
    updatedAt: skill.updatedAt,
  };
}

function toFileSummary(file: {
  skillFileId: string;
  path: string;
  mimeType: string;
  size: number;
  sha256: string;
  isText: boolean;
  lineCount?: number;
  isSymlink?: boolean;
  lfsPointer?: boolean;
}) {
  return {
    skillFileId: file.skillFileId,
    path: file.path,
    mimeType: file.mimeType,
    size: file.size,
    sha256: file.sha256,
    isText: file.isText,
    lineCount: file.lineCount,
    isSymlink: file.isSymlink,
    lfsPointer: file.lfsPointer,
  };
}

export const list = query({
  args: {},
  handler: async (ctx) => {
    const skills = await ctx.db
      .query("skills")
      .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
      .order("desc")
      .collect();
    return skills.map(toSummary);
  },
});

export const get = query({
  args: { skillId: v.string() },
  handler: async (ctx, args) =>
    toSummary(await requireSkill(ctx, ctx.userId, args.skillId)),
});

export const listFiles = query({
  args: { skillId: v.string() },
  handler: async (ctx, args) => {
    await requireSkill(ctx, ctx.userId, args.skillId);
    const manifest = await requireSkillManifest(ctx, args.skillId);
    if (manifest.userId !== ctx.userId)
      throw new ConvexError("Skill not found");
    return manifest.files.map(toFileSummary);
  },
});

export const getActivationScope = query({
  args: {},
  handler: async (ctx) => {
    const settings = await ctx.db
      .query("userSettings")
      .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
      .first();
    return settings?.skillActivationScope ?? "thread";
  },
});

export const updateActivationScope = mutation({
  args: { scope: skillActivationScopeValidator },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("userSettings")
      .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
      .first();
    const updatedAt = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, {
        skillActivationScope: args.scope,
        updatedAt,
      });
    } else {
      await ctx.db.insert("userSettings", {
        userId: ctx.userId,
        skillActivationScope: args.scope,
        updatedAt,
      });
    }
    return args.scope;
  },
});

export const updateMetadata = mutation({
  args: {
    skillId: v.string(),
    name: v.string(),
    description: v.string(),
    slug: v.string(),
  },
  handler: async (ctx, args) => {
    const skill = await requireSkill(ctx, ctx.userId, args.skillId);
    const requestedSlug = normalizeRequestedSlug(args.slug);
    const existing = await ctx.db
      .query("skills")
      .withIndex("by_userId_slug", (q) =>
        q.eq("userId", ctx.userId).eq("slug", requestedSlug),
      )
      .first();
    if (existing && existing.skillId !== args.skillId) {
      throw new ConvexError("That slash command is already in use");
    }
    await ctx.db.patch(skill._id, {
      name: normalizeName(args.name),
      description: normalizeDescription(args.description),
      slug: requestedSlug,
      updatedAt: Date.now(),
    });
    return { success: true as const };
  },
});

export const setEnabled = mutation({
  args: { skillId: v.string(), enabled: v.boolean() },
  handler: async (ctx, args) => {
    const skill = await requireSkill(ctx, ctx.userId, args.skillId);
    await ctx.db.patch(skill._id, {
      enabled: args.enabled,
      updatedAt: Date.now(),
    });
    return { success: true as const };
  },
});

export const setAutoLoad = mutation({
  args: { skillId: v.string(), allowAutoLoad: v.boolean() },
  handler: async (ctx, args) => {
    const skill = await requireSkill(ctx, ctx.userId, args.skillId);
    await ctx.db.patch(skill._id, {
      allowAutoLoad: args.allowAutoLoad,
      updatedAt: Date.now(),
    });
    return { success: true as const };
  },
});

export const listThreadActive = query({
  args: { threadId: v.string() },
  handler: async (ctx, args) => {
    const thread = await ctx.db
      .query("threads")
      .withIndex("by_threadId", (q) => q.eq("threadId", args.threadId))
      .first();
    if (thread?.userId !== ctx.userId) return [];
    const active = await ctx.db
      .query("threadSkills")
      .withIndex("by_userId_threadId", (q) =>
        q.eq("userId", ctx.userId).eq("threadId", args.threadId),
      )
      .collect();
    const skills = await Promise.all(
      active.map((entry) =>
        ctx.db
          .query("skills")
          .withIndex("by_skillId", (q) => q.eq("skillId", entry.skillId))
          .first(),
      ),
    );
    return skills
      .filter(
        (skill): skill is Doc<"skills"> =>
          skill !== null && skill.userId === ctx.userId && skill.enabled,
      )
      .map(toSummary);
  },
});

export const deactivateForThread = mutation({
  args: { threadId: v.string(), skillId: v.string() },
  handler: async (ctx, args) => {
    const thread = await ctx.db
      .query("threads")
      .withIndex("by_threadId", (q) => q.eq("threadId", args.threadId))
      .first();
    if (thread?.userId !== ctx.userId) {
      throw new ConvexError("Thread not found");
    }
    const active = await ctx.db
      .query("threadSkills")
      .withIndex("by_userId_threadId_skillId", (q) =>
        q
          .eq("userId", ctx.userId)
          .eq("threadId", args.threadId)
          .eq("skillId", args.skillId),
      )
      .first();
    if (active) await ctx.db.delete(active._id);
    return { success: true as const };
  },
});

export async function applySelectedSkillsToMessage(
  ctx: AuthenticatedMutationCtx,
  args: {
    threadId: string;
    userMessageId: string;
    assistantMessageId: string;
    selectedSkillIds: string[] | undefined;
  },
) {
  const selectedSkillIds = [...new Set(args.selectedSkillIds ?? [])];
  if (selectedSkillIds.length === 0) return [];
  if (selectedSkillIds.length > SKILL_LIMITS.maxExplicitSkills) {
    throw new ConvexError(
      `You can use at most ${SKILL_LIMITS.maxExplicitSkills} skills at once`,
    );
  }
  const settings = await ctx.db
    .query("userSettings")
    .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
    .first();
  const scope = settings?.skillActivationScope ?? "thread";
  const skills: Doc<"skills">[] = [];
  let entrypointBytes = 0;
  for (const skillId of selectedSkillIds) {
    const skill = await requireSkill(ctx, ctx.userId, skillId);
    if (!skill.enabled) throw new ConvexError(`${skill.name} is disabled`);
    entrypointBytes += skill.entrypointBytes;
    skills.push(skill);
  }
  if (entrypointBytes > SKILL_LIMITS.maxCombinedEntrypointBytes) {
    throw new ConvexError("The selected skills are too large to load together");
  }

  if (scope === "thread") {
    const activeRows = await ctx.db
      .query("threadSkills")
      .withIndex("by_userId_threadId", (q) =>
        q.eq("userId", ctx.userId).eq("threadId", args.threadId),
      )
      .collect();
    const activeIds = new Set(activeRows.map((row) => row.skillId));
    const hasNewActivations = skills.some(
      (skill) => !activeIds.has(skill.skillId),
    );
    if (hasNewActivations) {
      const activeSkills = await Promise.all(
        activeRows.map((row) =>
          ctx.db
            .query("skills")
            .withIndex("by_skillId", (q) => q.eq("skillId", row.skillId))
            .first(),
        ),
      );
      const resultingSkills = new Map<string, Doc<"skills">>();
      for (const activeSkill of activeSkills) {
        if (activeSkill?.userId === ctx.userId && activeSkill.enabled) {
          resultingSkills.set(activeSkill.skillId, activeSkill);
        }
      }
      for (const skill of skills) resultingSkills.set(skill.skillId, skill);
      if (resultingSkills.size > SKILL_LIMITS.maxExplicitSkills) {
        throw new ConvexError(
          `A thread can have at most ${SKILL_LIMITS.maxExplicitSkills} active skills`,
        );
      }
      const combinedBytes = [...resultingSkills.values()].reduce(
        (total, skill) => total + skill.entrypointBytes,
        0,
      );
      if (combinedBytes > SKILL_LIMITS.maxCombinedEntrypointBytes) {
        throw new ConvexError(
          "The active thread skills are too large to load together",
        );
      }
    }
  }

  const now = Date.now();
  for (const skill of skills) {
    const trigger = scope === "thread" ? "slash-thread" : "slash-message";
    if (scope === "thread") {
      const existing = await ctx.db
        .query("threadSkills")
        .withIndex("by_userId_threadId_skillId", (q) =>
          q
            .eq("userId", ctx.userId)
            .eq("threadId", args.threadId)
            .eq("skillId", skill.skillId),
        )
        .first();
      if (!existing) {
        await ctx.db.insert("threadSkills", {
          userId: ctx.userId,
          threadId: args.threadId,
          skillId: skill.skillId,
          activatedAt: now,
        });
      }
    }
    const usage = await ctx.db
      .query("skillUsages")
      .withIndex("by_assistantMessageId_skillId", (q) =>
        q
          .eq("assistantMessageId", args.assistantMessageId)
          .eq("skillId", skill.skillId),
      )
      .first();
    if (!usage) {
      await ctx.db.insert("skillUsages", {
        userId: ctx.userId,
        threadId: args.threadId,
        userMessageId: args.userMessageId,
        assistantMessageId: args.assistantMessageId,
        skillId: skill.skillId,
        skillName: skill.name,
        skillSlug: skill.slug,
        trigger,
        createdAt: now,
      });
    }
  }
  return skills.map(toSummary);
}

export async function copyMessageSkillUsages(
  ctx: AuthenticatedMutationCtx,
  args: {
    sourceAssistantMessageId: string;
    targetAssistantMessageId: string;
    userMessageId: string;
    threadId: string;
  },
) {
  const usages = await ctx.db
    .query("skillUsages")
    .withIndex("by_assistantMessageId", (q) =>
      q.eq("assistantMessageId", args.sourceAssistantMessageId),
    )
    .collect();
  for (const usage of usages) {
    if (usage.userId !== ctx.userId || usage.trigger === "auto") continue;
    await ctx.db.insert("skillUsages", {
      userId: ctx.userId,
      threadId: args.threadId,
      userMessageId: args.userMessageId,
      assistantMessageId: args.targetAssistantMessageId,
      skillId: usage.skillId,
      skillName: usage.skillName,
      skillSlug: usage.skillSlug,
      trigger: usage.trigger,
      createdAt: Date.now(),
    });
  }
}

export async function copyUserMessageSkillUsages(
  ctx: AuthenticatedMutationCtx,
  args: {
    sourceUserMessageId: string;
    targetUserMessageId: string;
    targetAssistantMessageId: string;
    threadId: string;
  },
) {
  const usages = await ctx.db
    .query("skillUsages")
    .withIndex("by_userMessageId", (q) =>
      q.eq("userMessageId", args.sourceUserMessageId),
    )
    .collect();
  const seen = new Set<string>();
  for (const usage of usages) {
    if (
      usage.userId !== ctx.userId ||
      usage.trigger === "auto" ||
      seen.has(usage.skillId)
    ) {
      continue;
    }
    seen.add(usage.skillId);
    await ctx.db.insert("skillUsages", {
      userId: ctx.userId,
      threadId: args.threadId,
      userMessageId: args.targetUserMessageId,
      assistantMessageId: args.targetAssistantMessageId,
      skillId: usage.skillId,
      skillName: usage.skillName,
      skillSlug: usage.skillSlug,
      trigger: usage.trigger,
      createdAt: Date.now(),
    });
  }
}

async function deleteSkillForUser(
  ctx: GenericMutationCtx<DataModel>,
  userId: string,
  skillId: string,
) {
  const skill = await requireSkill(ctx as SkillCtx, userId, skillId);
  const files = await ctx.db
    .query("skillFiles")
    .withIndex("by_skillId", (q) => q.eq("skillId", skillId))
    .collect();
  const chunks = await ctx.db
    .query("skillFileChunks")
    .withIndex("by_skillId", (q) => q.eq("skillId", skillId))
    .collect();
  const chunkManifests = await ctx.db
    .query("skillFileChunkManifests")
    .withIndex("by_skillId", (q) => q.eq("skillId", skillId))
    .collect();
  for (const file of files) {
    if (file.userId !== userId) continue;
    await ctx.scheduler.runAfter(
      0,
      internal.functions.attachments.internal_deleteFileFromSilo,
      {
        projectId: file.projectId,
        environmentId: file.environmentId,
        fileKeyId: file.fileKeyId,
        accessKey: file.accessKey,
      },
    );
    await ctx.db.delete(file._id);
  }
  for (const chunk of chunks) {
    if (chunk.userId !== userId) continue;
    await ctx.scheduler.runAfter(
      0,
      internal.functions.attachments.internal_deleteFileFromSilo,
      {
        projectId: chunk.projectId,
        environmentId: chunk.environmentId,
        fileKeyId: chunk.fileKeyId,
        accessKey: chunk.accessKey,
      },
    );
    await ctx.db.delete(chunk._id);
  }
  for (const manifest of chunkManifests) await ctx.db.delete(manifest._id);
  const entrypoint = await ctx.db
    .query("skillEntrypoints")
    .withIndex("by_skillId", (q) => q.eq("skillId", skillId))
    .first();
  if (entrypoint) await ctx.db.delete(entrypoint._id);
  const manifest = await ctx.db
    .query("skillManifests")
    .withIndex("by_skillId", (q) => q.eq("skillId", skillId))
    .first();
  if (manifest) await ctx.db.delete(manifest._id);
  const activeRows = await ctx.db
    .query("threadSkills")
    .withIndex("by_skillId", (q) => q.eq("skillId", skillId))
    .collect();
  for (const active of activeRows) {
    if (active.userId === userId) await ctx.db.delete(active._id);
  }
  await ctx.db.delete(skill._id);
  await updateUserUsageStats(ctx, userId, {
    skillsDelta: -1,
    skillFilesDelta: -files.length,
    skillStorageBytesDelta: -skill.storageBytes,
    lastActiveAt: Date.now(),
  });
  return { success: true as const };
}

export const deleteSkill = mutation({
  args: { skillId: v.string() },
  handler: async (ctx, args) => {
    return await deleteSkillForUser(ctx, ctx.userId, args.skillId);
  },
});

export const getProposal = query({
  args: { proposalId: v.string() },
  handler: async (ctx, args) => {
    const proposal = await ctx.db
      .query("skillProposals")
      .withIndex("by_proposalId", (q) => q.eq("proposalId", args.proposalId))
      .first();
    if (proposal?.userId !== ctx.userId) return null;
    return {
      proposalId: proposal.proposalId,
      name: proposal.name,
      description: proposal.description,
      files: proposal.files,
      status: proposal.status,
      approvedSkillId: proposal.approvedSkillId,
      expiresAt: proposal.expiresAt,
    };
  },
});

export const getProposalPayload = query({
  args: { proposalId: v.string() },
  handler: async (ctx, args) => {
    const payload = await ctx.db
      .query("skillProposalPayloads")
      .withIndex("by_proposalId", (q) => q.eq("proposalId", args.proposalId))
      .first();
    if (payload?.userId !== ctx.userId) return null;
    return { files: payload.files };
  },
});

export const internal_cleanupExpiredProposals = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const payloads = await ctx.db
      .query("skillProposalPayloads")
      .withIndex("by_expiresAt", (q) => q.lt("expiresAt", now))
      .take(500);
    let cleaned = 0;
    for (const payload of payloads) {
      const proposal = await ctx.db
        .query("skillProposals")
        .withIndex("by_proposalId", (q) =>
          q.eq("proposalId", payload.proposalId),
        )
        .first();
      if (!proposal) {
        await ctx.db.delete(payload._id);
        cleaned += 1;
        continue;
      }
      if (
        proposal.status === "approving" &&
        (proposal.approvalClaimedAt ?? 0) > now - APPROVAL_CLAIM_TIMEOUT_MS
      ) {
        continue;
      }
      await ctx.db.patch(proposal._id, {
        status:
          proposal.status === "pending" || proposal.status === "approving"
            ? "expired"
            : proposal.status,
        approvalClaimId: undefined,
        approvalClaimedAt: undefined,
        updatedAt: now,
      });
      await ctx.db.delete(payload._id);
      cleaned += 1;
    }
    return { cleaned };
  },
});

export const rejectProposal = mutation({
  args: { proposalId: v.string() },
  handler: async (ctx, args) => {
    const proposal = await ctx.db
      .query("skillProposals")
      .withIndex("by_proposalId", (q) => q.eq("proposalId", args.proposalId))
      .first();
    if (proposal?.userId !== ctx.userId) {
      throw new ConvexError("Skill proposal not found");
    }
    if (proposal.status === "approved" || proposal.status === "approving") {
      throw new ConvexError(
        "Skill proposals being approved cannot be rejected",
      );
    }
    await ctx.db.patch(proposal._id, {
      status: "rejected",
      updatedAt: Date.now(),
    });
    const payload = await ctx.db
      .query("skillProposalPayloads")
      .withIndex("by_proposalId", (q) => q.eq("proposalId", args.proposalId))
      .first();
    if (payload) await ctx.db.delete(payload._id);
    return { success: true as const };
  },
});

export const backend_commitSkillImport = backendMutation({
  args: {
    userId: v.string(),
    replacingSkillId: v.optional(v.string()),
    name: v.string(),
    description: v.string(),
    requestedSlug: v.string(),
    entrypointText: v.string(),
    metadataWasInferred: v.boolean(),
    enabled: v.boolean(),
    allowAutoLoad: v.boolean(),
    source: skillSourceValidator,
    files: v.array(storedSkillFileValidator),
    chunks: v.array(storedSkillChunkValidator),
    chunkManifests: v.array(storedChunkManifestValidator),
    storageBytes: v.number(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const totalBytes = args.files.reduce((sum, file) => sum + file.size, 0);
    const computedStorageBytes =
      totalBytes +
      args.chunks.reduce((sum, chunk) => sum + chunk.storedBytes, 0);
    if (
      args.files.length === 0 ||
      args.files.length > SKILL_LIMITS.maxFilesPerSkill ||
      totalBytes > SKILL_LIMITS.maxTotalBytes
    ) {
      throw new ConvexError("Skill package exceeds storage limits");
    }
    const entrypointBytes = new TextEncoder().encode(
      args.entrypointText,
    ).byteLength;
    if (entrypointBytes > SKILL_LIMITS.maxEntrypointBytes) {
      throw new ConvexError("SKILL.md is too large");
    }
    if (args.storageBytes !== computedStorageBytes) {
      throw new ConvexError(
        "Skill storage size does not match uploaded objects",
      );
    }
    const seenPaths = new Set<string>();
    const filesById = new Map(
      args.files.map((file) => [file.skillFileId, file]),
    );
    for (const file of args.files) {
      const path = normalizePath(file.path);
      const key = path.toLowerCase();
      if (seenPaths.has(key))
        throw new ConvexError(`Duplicate skill path: ${path}`);
      seenPaths.add(key);
      if (file.size > SKILL_LIMITS.maxFileBytes) {
        throw new ConvexError(`${path} is too large`);
      }
    }
    if (!seenPaths.has("skill.md")) {
      throw new ConvexError("Skill package must contain a root SKILL.md");
    }
    const entrypointFile = args.files.find((file) => file.path === "SKILL.md");
    if (!entrypointFile?.isText || entrypointFile.size !== entrypointBytes) {
      throw new ConvexError("SKILL.md metadata does not match its content");
    }
    const manifestsByFileId = new Map(
      args.chunkManifests.map((manifest) => [manifest.skillFileId, manifest]),
    );
    if (manifestsByFileId.size !== args.chunkManifests.length) {
      throw new ConvexError("Duplicate skill chunk manifest");
    }
    const chunksByFileId = new Map<string, typeof args.chunks>();
    for (const chunk of args.chunks) {
      if (!filesById.has(chunk.skillFileId)) {
        throw new ConvexError("Skill chunk references an unknown file");
      }
      const list = chunksByFileId.get(chunk.skillFileId) ?? [];
      list.push(chunk);
      chunksByFileId.set(chunk.skillFileId, list);
    }
    for (const file of args.files) {
      const chunks = (chunksByFileId.get(file.skillFileId) ?? []).sort(
        (a, b) => a.chunkIndex - b.chunkIndex,
      );
      const manifest = manifestsByFileId.get(file.skillFileId);
      if (!file.isText && (chunks.length > 0 || manifest)) {
        throw new ConvexError(`${file.path} is binary but has text chunks`);
      }
      if (file.isText && !manifest) {
        throw new ConvexError(`${file.path} is missing its chunk manifest`);
      }
      const manifestChunkCount = manifest ? manifest.chunks.length : 0;
      if (
        chunks.length !== file.chunkCount ||
        manifestChunkCount !== chunks.length
      ) {
        throw new ConvexError(`${file.path} has incomplete chunk metadata`);
      }
      chunks.forEach((chunk, index) => {
        if (
          chunk.chunkIndex !== index ||
          manifest?.chunks[index]?.chunkIndex !== index
        ) {
          throw new ConvexError(`${file.path} has non-contiguous chunks`);
        }
      });
    }

    let skill: Doc<"skills"> | null = null;
    let oldFiles: Doc<"skillFiles">[] = [];
    let oldChunks: Doc<"skillFileChunks">[] = [];
    let oldChunkManifests: Doc<"skillFileChunkManifests">[] = [];
    let oldEntrypoint: Doc<"skillEntrypoints"> | null = null;
    let oldManifest: Doc<"skillManifests"> | null = null;
    if (!args.replacingSkillId && args.source.proposalId) {
      const existingSkills = await ctx.db
        .query("skills")
        .withIndex("by_proposalId", (q) =>
          q.eq("proposalId", args.source.proposalId),
        )
        .first();
      const existingProposalSkill =
        existingSkills?.userId === args.userId ? existingSkills : null;
      if (existingProposalSkill) {
        for (const file of [...args.files, ...args.chunks]) {
          await ctx.scheduler.runAfter(
            0,
            internal.functions.attachments.internal_deleteFileFromSilo,
            {
              projectId: file.projectId,
              environmentId: file.environmentId,
              fileKeyId: file.fileKeyId,
              accessKey: file.accessKey,
            },
          );
        }
        return {
          skillId: existingProposalSkill.skillId,
          slug: existingProposalSkill.slug,
        };
      }
    }
    if (args.replacingSkillId) {
      skill = await requireSkill(
        ctx as AuthenticatedMutationCtx,
        args.userId,
        args.replacingSkillId,
      );
      oldFiles = await ctx.db
        .query("skillFiles")
        .withIndex("by_skillId", (q) =>
          q.eq("skillId", args.replacingSkillId ?? ""),
        )
        .collect();
      oldChunks = await ctx.db
        .query("skillFileChunks")
        .withIndex("by_skillId", (q) =>
          q.eq("skillId", args.replacingSkillId ?? ""),
        )
        .collect();
      oldChunkManifests = await ctx.db
        .query("skillFileChunkManifests")
        .withIndex("by_skillId", (q) =>
          q.eq("skillId", args.replacingSkillId ?? ""),
        )
        .collect();
      oldEntrypoint = await ctx.db
        .query("skillEntrypoints")
        .withIndex("by_skillId", (q) =>
          q.eq("skillId", args.replacingSkillId ?? ""),
        )
        .first();
      oldManifest = await ctx.db
        .query("skillManifests")
        .withIndex("by_skillId", (q) =>
          q.eq("skillId", args.replacingSkillId ?? ""),
        )
        .first();
    } else {
      const existingSkills = await ctx.db
        .query("skills")
        .withIndex("by_userId", (q) => q.eq("userId", args.userId))
        .collect();
      if (existingSkills.length >= SKILL_LIMITS.maxSkillsPerUser) {
        throw new ConvexError("Skill limit reached");
      }
    }

    const skillId = skill?.skillId ?? generateId();
    const slug =
      skill?.slug ??
      (await allocateUniqueSlug(ctx, args.userId, args.requestedSlug));
    const name = skill?.name ?? normalizeName(args.name);
    const description =
      skill?.description ?? normalizeDescription(args.description);
    if (skill) {
      await ctx.db.patch(skill._id, {
        entrypointBytes,
        metadataWasInferred: args.metadataWasInferred,
        sourceType: args.source.sourceType,
        originalFileName: args.source.originalFileName,
        githubOriginalUrl: args.source.githubOriginalUrl,
        githubOwner: args.source.githubOwner,
        githubRepository: args.source.githubRepository,
        githubRequestedRef: args.source.githubRequestedRef,
        githubSelectedPath: args.source.githubSelectedPath,
        githubCommitSha: args.source.githubCommitSha,
        proposalId: args.source.proposalId,
        sourceThreadId: args.source.sourceThreadId,
        sourceMessageId: args.source.sourceMessageId,
        fileCount: args.files.length,
        totalBytes,
        storageBytes: args.storageBytes,
        updatedAt: now,
      });
      for (const oldFile of oldFiles) await ctx.db.delete(oldFile._id);
      for (const oldChunk of oldChunks) await ctx.db.delete(oldChunk._id);
      for (const oldChunkManifest of oldChunkManifests) {
        await ctx.db.delete(oldChunkManifest._id);
      }
      if (oldEntrypoint) await ctx.db.delete(oldEntrypoint._id);
      if (oldManifest) await ctx.db.delete(oldManifest._id);
    } else {
      await ctx.db.insert("skills", {
        skillId,
        userId: args.userId,
        name,
        description,
        slug,
        enabled: args.enabled,
        allowAutoLoad: args.allowAutoLoad,
        ...args.source,
        entrypointBytes,
        metadataWasInferred: args.metadataWasInferred,
        fileCount: args.files.length,
        totalBytes,
        storageBytes: args.storageBytes,
        createdAt: now,
        updatedAt: now,
      });
    }
    await ctx.db.insert("skillEntrypoints", {
      skillId,
      userId: args.userId,
      text: args.entrypointText,
      size: entrypointBytes,
      sha256: entrypointFile.sha256,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("skillManifests", {
      skillId,
      userId: args.userId,
      files: args.files.map(toFileSummary),
      createdAt: now,
      updatedAt: now,
    });
    for (const file of args.files) {
      await ctx.db.insert("skillFiles", {
        ...file,
        path: normalizePath(file.path),
        skillId,
        userId: args.userId,
        createdAt: now,
      });
    }
    for (const manifest of args.chunkManifests) {
      await ctx.db.insert("skillFileChunkManifests", {
        ...manifest,
        skillId,
        userId: args.userId,
        createdAt: now,
      });
    }
    for (const chunk of args.chunks) {
      await ctx.db.insert("skillFileChunks", {
        ...chunk,
        skillId,
        userId: args.userId,
        createdAt: now,
      });
    }
    for (const oldFile of [...oldFiles, ...oldChunks]) {
      await ctx.scheduler.runAfter(
        0,
        internal.functions.attachments.internal_deleteFileFromSilo,
        {
          projectId: oldFile.projectId,
          environmentId: oldFile.environmentId,
          fileKeyId: oldFile.fileKeyId,
          accessKey: oldFile.accessKey,
        },
      );
    }
    await updateUserUsageStats(ctx, args.userId, {
      skillsDelta: skill ? 0 : 1,
      skillFilesDelta: args.files.length - oldFiles.length,
      skillStorageBytesDelta: args.storageBytes - (skill?.storageBytes ?? 0),
      lastActiveAt: now,
    });
    return { skillId, slug };
  },
});

export const backend_getSkillSource = backendQuery({
  args: { userId: v.string(), skillId: v.string() },
  handler: async (ctx, args) => {
    const skill = await requireSkill(
      ctx as AuthenticatedQueryCtx,
      args.userId,
      args.skillId,
    );
    return {
      ...toSummary(skill),
      githubOriginalUrl: skill.githubOriginalUrl,
    };
  },
});

export const backend_getSkillFile = backendQuery({
  args: { userId: v.string(), skillFileId: v.string() },
  handler: async (ctx, args) => {
    const file = await ctx.db
      .query("skillFiles")
      .withIndex("by_skillFileId", (q) => q.eq("skillFileId", args.skillFileId))
      .first();
    if (file?.userId !== args.userId) return null;
    return file;
  },
});

export const backend_getSelectedSkillRefs = backendQuery({
  args: {
    userId: v.string(),
    threadId: v.string(),
    assistantMessageId: v.string(),
  },
  handler: async (ctx, args) => {
    const thread = await ctx.db
      .query("threads")
      .withIndex("by_threadId", (q) => q.eq("threadId", args.threadId))
      .first();
    if (thread?.userId !== args.userId)
      throw new ConvexError("Thread not found");
    const selectedUsages = await ctx.db
      .query("skillUsages")
      .withIndex("by_assistantMessageId", (q) =>
        q.eq("assistantMessageId", args.assistantMessageId),
      )
      .order("desc")
      .collect();
    const threadRows = await ctx.db
      .query("threadSkills")
      .withIndex("by_userId_threadId", (q) =>
        q.eq("userId", args.userId).eq("threadId", args.threadId),
      )
      .order("desc")
      .collect();
    const triggerBySkillId = new Map(
      selectedUsages
        .filter((usage) => usage.userId === args.userId)
        .map((usage) => [usage.skillId, usage.trigger] as const),
    );
    const refs = new Map<string, "slash-message" | "slash-thread" | "auto">();
    for (const [skillId, trigger] of triggerBySkillId)
      refs.set(skillId, trigger);
    for (const row of threadRows) {
      if (!refs.has(row.skillId)) refs.set(row.skillId, "slash-thread");
    }
    return [...refs].map(([skillId, trigger]) => ({ skillId, trigger }));
  },
});

export const backend_getAutoSkillCatalog = backendQuery({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    const skills = await ctx.db
      .query("skills")
      .withIndex("by_userId_enabled_autoLoad", (q) =>
        q
          .eq("userId", args.userId)
          .eq("enabled", true)
          .eq("allowAutoLoad", true),
      )
      .collect();
    return skills.map((skill) => ({
      skillId: skill.skillId,
      name: skill.name,
      description: skill.description,
      slug: skill.slug,
    }));
  },
});

export const backend_getSkillForRuntime = backendQuery({
  args: { userId: v.string(), skillId: v.string() },
  handler: async (ctx, args) => {
    const skill = await requireSkill(
      ctx as AuthenticatedQueryCtx,
      args.userId,
      args.skillId,
    );
    if (!skill.enabled) throw new ConvexError("Skill is disabled");
    const [entrypoint, manifest] = await Promise.all([
      requireSkillEntrypoint(ctx as AuthenticatedQueryCtx, args.skillId),
      requireSkillManifest(ctx as AuthenticatedQueryCtx, args.skillId),
    ]);
    if (entrypoint.userId !== args.userId || manifest.userId !== args.userId) {
      throw new ConvexError("Skill not found");
    }
    return {
      skillId: skill.skillId,
      name: skill.name,
      description: skill.description,
      slug: skill.slug,
      entrypointText: entrypoint.text,
      entrypointBytes: entrypoint.size,
      allowAutoLoad: skill.allowAutoLoad,
      files: manifest.files.map(toFileSummary),
    };
  },
});

export const backend_getSkillFileReadPlan = backendQuery({
  args: {
    userId: v.string(),
    skillId: v.string(),
    path: v.string(),
    startLine: v.optional(v.number()),
    cursor: v.optional(v.string()),
    maxLines: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const skill = await requireSkill(
      ctx as AuthenticatedQueryCtx,
      args.userId,
      args.skillId,
    );
    if (!skill.enabled) throw new ConvexError("Skill is disabled");
    const path = normalizePath(args.path);
    const file = await ctx.db
      .query("skillFiles")
      .withIndex("by_skillId_path", (q) =>
        q.eq("skillId", args.skillId).eq("path", path),
      )
      .first();
    if (file?.userId !== args.userId)
      throw new ConvexError("Skill file not found");
    if (!file.isText)
      throw new ConvexError("Only text skill files can be loaded");
    const manifest = await ctx.db
      .query("skillFileChunkManifests")
      .withIndex("by_skillFileId", (q) => q.eq("skillFileId", file.skillFileId))
      .first();
    if (manifest?.userId !== args.userId) {
      throw new ConvexError("Skill file chunk manifest not found");
    }
    if (manifest.chunks.length === 0) {
      return {
        skillFileId: file.skillFileId,
        path: file.path,
        totalLines: manifest.totalLines,
        requestedLine: 1,
        initialByteOffset: 0,
        chunks: [],
      };
    }

    let chunkIndex: number;
    let initialByteOffset = 0;
    let requestedLine = Math.max(
      1,
      Math.min(Math.floor(args.startLine ?? 1), manifest.totalLines),
    );
    if (args.cursor) {
      const match = /^v1:([^:]+):(\d+):(\d+)$/.exec(args.cursor);
      if (match?.[1] !== file.skillFileId) {
        throw new ConvexError("Invalid skill file cursor");
      }
      chunkIndex = Number(match[2]);
      initialByteOffset = Number(match[3]);
      const route = manifest.chunks[chunkIndex];
      if (!route || initialByteOffset > route.uncompressedBytes) {
        throw new ConvexError("Invalid skill file cursor");
      }
      requestedLine = route.startLine;
    } else {
      chunkIndex = manifest.chunks.findIndex(
        (route) =>
          route.startLine <= requestedLine &&
          (route.endLine > requestedLine ||
            (route.endLine === requestedLine && route.endByteInLine > 0)),
      );
      if (chunkIndex < 0) chunkIndex = manifest.chunks.length - 1;
    }
    const routes = manifest.chunks.slice(
      chunkIndex,
      chunkIndex + SKILL_LIMITS.maxReadPlanChunks,
    );
    const chunks = await Promise.all(
      routes.map((route) =>
        ctx.db
          .query("skillFileChunks")
          .withIndex("by_skillFileId_chunkIndex", (q) =>
            q
              .eq("skillFileId", file.skillFileId)
              .eq("chunkIndex", route.chunkIndex),
          )
          .first(),
      ),
    );
    const availableChunks: Doc<"skillFileChunks">[] = [];
    for (const chunk of chunks) {
      if (chunk?.userId !== args.userId) {
        throw new ConvexError("Skill file chunk not found");
      }
      availableChunks.push(chunk);
    }
    return {
      skillFileId: file.skillFileId,
      path: file.path,
      totalLines: manifest.totalLines,
      requestedLine,
      initialByteOffset,
      chunks: availableChunks.map((chunk) => ({
        chunkIndex: chunk.chunkIndex,
        startLine: chunk.startLine,
        endLine: chunk.endLine,
        uncompressedBytes: chunk.uncompressedBytes,
        encoding: chunk.encoding,
        projectId: chunk.projectId,
        environmentId: chunk.environmentId,
        accessKey: chunk.accessKey,
        fileKeyId: chunk.fileKeyId,
      })),
    };
  },
});

export const backend_recordUsage = backendMutation({
  args: {
    userId: v.string(),
    threadId: v.string(),
    userMessageId: v.string(),
    assistantMessageId: v.string(),
    skillId: v.string(),
    trigger: skillUsageTriggerValidator,
  },
  handler: async (ctx, args) => {
    const skill = await requireSkill(
      ctx as AuthenticatedMutationCtx,
      args.userId,
      args.skillId,
    );
    const existing = await ctx.db
      .query("skillUsages")
      .withIndex("by_assistantMessageId_skillId", (q) =>
        q
          .eq("assistantMessageId", args.assistantMessageId)
          .eq("skillId", args.skillId),
      )
      .first();
    if (!existing) {
      await ctx.db.insert("skillUsages", {
        userId: args.userId,
        threadId: args.threadId,
        userMessageId: args.userMessageId,
        assistantMessageId: args.assistantMessageId,
        skillId: skill.skillId,
        skillName: skill.name,
        skillSlug: skill.slug,
        trigger: args.trigger,
        createdAt: Date.now(),
      });
    }
    return { success: true as const };
  },
});

export const backend_createProposal = backendMutation({
  args: {
    userId: v.string(),
    threadId: v.string(),
    messageId: v.string(),
    toolCallId: v.string(),
    name: v.string(),
    description: v.string(),
    files: v.array(v.object({ path: v.string(), content: v.string() })),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("skillProposals")
      .withIndex("by_userId_toolCallId", (q) =>
        q.eq("userId", args.userId).eq("toolCallId", args.toolCallId),
      )
      .first();
    if (existing) {
      return { proposalId: existing.proposalId, status: existing.status };
    }
    const thread = await ctx.db
      .query("threads")
      .withIndex("by_threadId", (q) => q.eq("threadId", args.threadId))
      .first();
    if (thread?.userId !== args.userId)
      throw new ConvexError("Thread not found");
    if (
      args.files.length === 0 ||
      args.files.length > SKILL_LIMITS.maxProposalFiles
    ) {
      throw new ConvexError("Skill proposal has too many files");
    }
    let totalBytes = 0;
    const seen = new Set<string>();
    const payloadFiles = args.files.map((file) => {
      const path = normalizePath(file.path);
      const key = path.toLowerCase();
      if (seen.has(key)) throw new ConvexError(`Duplicate skill path: ${path}`);
      seen.add(key);
      const size = new TextEncoder().encode(file.content).byteLength;
      if (size > SKILL_LIMITS.maxProposalFileBytes) {
        throw new ConvexError(`${path} is too large`);
      }
      totalBytes += size;
      return {
        path,
        content: file.content,
        size,
        lineCount: file.content.split(/\r?\n/).length,
      };
    });
    if (!seen.has("skill.md")) {
      throw new ConvexError("Skill proposals require a root SKILL.md");
    }
    if (totalBytes > SKILL_LIMITS.maxProposalBytes) {
      throw new ConvexError("Skill proposal is too large");
    }
    const now = Date.now();
    const proposalId = generateId();
    const expiresAt = now + 7 * 24 * 60 * 60 * 1000;
    await ctx.db.insert("skillProposals", {
      proposalId,
      userId: args.userId,
      threadId: args.threadId,
      messageId: args.messageId,
      toolCallId: args.toolCallId,
      name: normalizeName(args.name),
      description: normalizeDescription(args.description),
      files: payloadFiles.map(({ path, size, lineCount }) => ({
        path,
        size,
        lineCount,
      })),
      status: "pending",
      expiresAt,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("skillProposalPayloads", {
      proposalId,
      userId: args.userId,
      threadId: args.threadId,
      files: payloadFiles,
      expiresAt,
      createdAt: now,
    });
    return { proposalId, status: "pending" as const };
  },
});

export const backend_claimProposalApproval = backendMutation({
  args: { userId: v.string(), proposalId: v.string(), claimId: v.string() },
  handler: async (ctx, args) => {
    const proposal = await ctx.db
      .query("skillProposals")
      .withIndex("by_proposalId", (q) => q.eq("proposalId", args.proposalId))
      .first();
    if (proposal?.userId !== args.userId)
      throw new ConvexError("Skill proposal not found");
    if (proposal.status === "approved") {
      return {
        state: "approved" as const,
        skillId: proposal.approvedSkillId,
      };
    }
    const now = Date.now();
    if (
      proposal.status === "approving" &&
      (proposal.approvalClaimedAt ?? 0) > now - APPROVAL_CLAIM_TIMEOUT_MS
    ) {
      return { state: "in_progress" as const };
    }
    if (
      (proposal.status !== "pending" && proposal.status !== "approving") ||
      proposal.expiresAt <= now
    ) {
      throw new ConvexError("Skill proposal is no longer available");
    }
    const payload = await ctx.db
      .query("skillProposalPayloads")
      .withIndex("by_proposalId", (q) => q.eq("proposalId", args.proposalId))
      .first();
    if (payload?.userId !== args.userId) {
      throw new ConvexError("Skill proposal payload is unavailable");
    }
    await ctx.db.patch(proposal._id, {
      status: "approving",
      approvalClaimId: args.claimId,
      approvalClaimedAt: now,
      updatedAt: now,
    });
    return {
      state: "claimed" as const,
      proposal: {
        proposalId: proposal.proposalId,
        threadId: proposal.threadId,
        messageId: proposal.messageId,
        name: proposal.name,
        description: proposal.description,
        files: payload.files,
      },
    };
  },
});

export const backend_finalizeProposalApproval = backendMutation({
  args: {
    userId: v.string(),
    proposalId: v.string(),
    claimId: v.string(),
    skillId: v.string(),
  },
  handler: async (ctx, args) => {
    const proposal = await ctx.db
      .query("skillProposals")
      .withIndex("by_proposalId", (q) => q.eq("proposalId", args.proposalId))
      .first();
    if (proposal?.userId !== args.userId)
      throw new ConvexError("Skill proposal not found");
    if (proposal.status === "approved") {
      return { skillId: proposal.approvedSkillId ?? args.skillId };
    }
    if (
      proposal.status !== "approving" ||
      proposal.approvalClaimId !== args.claimId
    ) {
      throw new ConvexError("Skill proposal approval claim was lost");
    }
    await ctx.db.patch(proposal._id, {
      status: "approved",
      approvedSkillId: args.skillId,
      approvalClaimId: undefined,
      approvalClaimedAt: undefined,
      updatedAt: Date.now(),
    });
    const payload = await ctx.db
      .query("skillProposalPayloads")
      .withIndex("by_proposalId", (q) => q.eq("proposalId", args.proposalId))
      .first();
    if (payload) await ctx.db.delete(payload._id);
    return { skillId: args.skillId };
  },
});

export const backend_releaseProposalApproval = backendMutation({
  args: { userId: v.string(), proposalId: v.string(), claimId: v.string() },
  handler: async (ctx, args) => {
    const proposal = await ctx.db
      .query("skillProposals")
      .withIndex("by_proposalId", (q) => q.eq("proposalId", args.proposalId))
      .first();
    if (proposal?.userId !== args.userId) return { released: false as const };
    if (
      proposal.status !== "approving" ||
      proposal.approvalClaimId !== args.claimId
    ) {
      return { released: false as const };
    }
    await ctx.db.patch(proposal._id, {
      status: "pending",
      approvalClaimId: undefined,
      approvalClaimedAt: undefined,
      updatedAt: Date.now(),
    });
    return { released: true as const };
  },
});

// Atomically undo a failed approval attempt that already created a skill
// package. Deleting the package outside of this transaction is unsafe: if this
// claim's timeout elapsed and a newer claim reclaimed the proposal, that claim
// can adopt this same skill via the idempotent import in
// `backend_commitSkillImport`, and a blind rollback would delete a package the
// newer claim depends on. Because a claim is always acquired before its import
// runs, holding the claim here proves no other flow has imported against this
// skill yet, so deleting it and resetting the proposal is safe.
export const backend_rollbackProposalApproval = backendMutation({
  args: {
    userId: v.string(),
    proposalId: v.string(),
    claimId: v.string(),
    skillId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const proposal = await ctx.db
      .query("skillProposals")
      .withIndex("by_proposalId", (q) => q.eq("proposalId", args.proposalId))
      .first();
    if (proposal?.userId !== args.userId) {
      return { rolledBack: false as const, skillId: undefined };
    }
    // Another claim finalized the approval; the skill is now the canonical
    // package for this proposal and must not be deleted.
    if (proposal.status === "approved") {
      return {
        rolledBack: false as const,
        skillId: proposal.approvedSkillId,
      };
    }
    // A newer claim superseded this one, so it may have adopted this skill
    // package. Leave both the skill and the newer claim untouched.
    if (
      proposal.status !== "approving" ||
      proposal.approvalClaimId !== args.claimId
    ) {
      return { rolledBack: false as const, skillId: undefined };
    }
    if (args.skillId) {
      const skill = await ctx.db
        .query("skills")
        .withIndex("by_skillId", (q) => q.eq("skillId", args.skillId ?? ""))
        .first();
      if (
        skill?.userId === args.userId &&
        skill.proposalId === args.proposalId
      ) {
        await deleteSkillForUser(ctx, args.userId, args.skillId);
      }
    }
    await ctx.db.patch(proposal._id, {
      status: "pending",
      approvalClaimId: undefined,
      approvalClaimedAt: undefined,
      updatedAt: Date.now(),
    });
    return { rolledBack: true as const, skillId: undefined };
  },
});
