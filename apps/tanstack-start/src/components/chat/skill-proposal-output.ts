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
