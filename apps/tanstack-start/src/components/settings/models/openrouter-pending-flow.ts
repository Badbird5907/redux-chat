export interface PendingOpenRouterFlow {
  flowId: string;
  expiresAt: number;
  previousCredentialUpdatedAt?: number | null;
}

export function isPendingOpenRouterFlowSuperseded(
  flow: PendingOpenRouterFlow,
  credential: { connectionType: string; updatedAt: number } | null | undefined,
): boolean {
  if (credential?.connectionType !== "openrouter_oauth") {
    return false;
  }

  const previousUpdatedAt = flow.previousCredentialUpdatedAt;
  return (
    previousUpdatedAt === undefined ||
    previousUpdatedAt === null ||
    credential.updatedAt > previousUpdatedAt
  );
}
