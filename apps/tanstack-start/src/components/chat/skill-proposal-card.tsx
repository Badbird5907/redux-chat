"use client";

import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery } from "convex/react";
import {
  Check,
  ChevronDown,
  FileCode2,
  Loader2,
  Sparkles,
  X,
} from "lucide-react";
import { usePostHog } from "posthog-js/react";
import { toast } from "sonner";

import { api } from "@redux/backend/convex/_generated/api";
import { Badge } from "@redux/ui/components/badge";
import { Button } from "@redux/ui/components/button";
import { Card, CardContent, CardHeader } from "@redux/ui/components/card";

import { ShikiCodeBlock } from "@/components/markdown/shiki-code-block";
import { approveSkillProposal } from "@/server/skills/actions";

export interface SkillProposalOutput {
  proposalId: string;
  name: string;
  description: string;
  status: string;
  files: { path: string; size: number; lineCount: number }[];
}

export function normalizeSkillProposalOutput(
  value: unknown,
): SkillProposalOutput | null {
  if (!value || typeof value !== "object") return null;
  const output = value as Partial<SkillProposalOutput>;
  if (
    typeof output.proposalId !== "string" ||
    typeof output.name !== "string" ||
    typeof output.description !== "string" ||
    !Array.isArray(output.files)
  ) {
    return null;
  }
  return {
    proposalId: output.proposalId,
    name: output.name,
    description: output.description,
    status: typeof output.status === "string" ? output.status : "pending",
    files: output.files.flatMap((file: unknown) => {
      if (!file || typeof file !== "object") return [];
      const candidate = file as Partial<SkillProposalOutput["files"][number]>;
      return typeof candidate.path === "string" &&
        typeof candidate.size === "number" &&
        typeof candidate.lineCount === "number"
        ? [candidate as SkillProposalOutput["files"][number]]
        : [];
    }),
  };
}

export function SkillProposalCard({
  proposal,
}: {
  proposal: SkillProposalOutput;
}) {
  const stored = useQuery(api.functions.skills.getProposal, {
    proposalId: proposal.proposalId,
  });
  const reject = useMutation(api.functions.skills.rejectProposal);
  const approve = useServerFn(approveSkillProposal);
  const posthog = usePostHog();
  const [busy, setBusy] = useState<"approve" | "reject">();
  const status = stored?.status ?? proposal.status;

  const handleApprove = async () => {
    setBusy("approve");
    try {
      await approve({ data: { proposalId: proposal.proposalId } });
      posthog.capture("skill_proposal_approved", {
        file_count: proposal.files.length,
      });
      toast.success("Skill created");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to create skill",
      );
    } finally {
      setBusy(undefined);
    }
  };

  const handleReject = async () => {
    setBusy("reject");
    try {
      await reject({ proposalId: proposal.proposalId });
      posthog.capture("skill_proposal_rejected", {
        file_count: proposal.files.length,
      });
      toast.success("Skill proposal rejected");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to reject proposal",
      );
    } finally {
      setBusy(undefined);
    }
  };

  return (
    <Card className="border-primary/25 bg-primary/3">
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 font-medium">
            <Sparkles className="text-primary size-4" />
            {proposal.name}
            <Badge
              variant={status === "approved" ? "default" : "secondary"}
              className="capitalize"
            >
              {status}
            </Badge>
          </div>
          <p className="text-muted-foreground mt-1 text-sm">
            {proposal.description}
          </p>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <details className="group rounded-lg border">
          <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2 text-sm font-medium">
            <span>
              {proposal.files.length} proposed file
              {proposal.files.length === 1 ? "" : "s"}
            </span>
            <ChevronDown className="size-4 transition-transform group-open:rotate-180" />
          </summary>
          <div className="border-t p-3">
            <div className="space-y-2">
              {(stored?.files ?? proposal.files).map((file) => (
                <details key={file.path} className="rounded-md border">
                  <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-sm">
                    <FileCode2 className="text-muted-foreground size-4" />
                    <span className="min-w-0 flex-1 truncate">{file.path}</span>
                    <span className="text-muted-foreground text-xs">
                      {file.lineCount} lines
                    </span>
                  </summary>
                  {"content" in file && typeof file.content === "string" ? (
                    <div className="max-h-72 overflow-auto border-t p-3">
                      <ShikiCodeBlock
                        code={file.content}
                        info={file.path.split(".").pop()}
                      />
                    </div>
                  ) : null}
                </details>
              ))}
            </div>
          </div>
        </details>

        {status === "pending" ? (
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              variant="outline"
              disabled={busy !== undefined}
              onClick={() => void handleReject()}
            >
              {busy === "reject" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <X className="size-4" />
              )}
              Reject
            </Button>
            <Button
              disabled={busy !== undefined}
              onClick={() => void handleApprove()}
            >
              {busy === "approve" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Check className="size-4" />
              )}
              Approve and create
            </Button>
          </div>
        ) : status === "approved" ? (
          <div className="flex justify-end">
            <Button
              variant="outline"
              size="sm"
              render={<Link to="/settings/skills" />}
            >
              View in Settings
            </Button>
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">
            This proposal will not create a skill.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
