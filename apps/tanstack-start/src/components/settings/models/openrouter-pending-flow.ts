export interface PendingOpenRouterFlow {
  flowId: string;
  expiresAt: number;
  previousCredentialUpdatedAt?: number | null;
}

export function isPendingOpenRouterFlowSuperseded(
  flow: PendingOpenRouterFlow,
  credential: { updatedAt: number } | null | undefined,
): boolean {
  if (!credential) return false;

  const previousUpdatedAt = flow.previousCredentialUpdatedAt;
  return (
    previousUpdatedAt === undefined ||
    previousUpdatedAt === null ||
    credential.updatedAt > previousUpdatedAt
  );
}
