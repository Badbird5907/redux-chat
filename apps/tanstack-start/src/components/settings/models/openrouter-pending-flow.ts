export interface PendingOpenRouterFlow {
  flowId: string;
  authorizationUrl: string;
  expiresAt: number;
  previousCredentialUpdatedAt?: number | null;
}

export interface OpenRouterCredentialCompletion {
  type: "byok-oauth-complete";
  connector: "openrouter";
  flowId: string;
  success: true;
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

export function getOpenRouterCredentialCompletion(
  flow: PendingOpenRouterFlow,
  credential: { updatedAt: number } | null | undefined,
): OpenRouterCredentialCompletion | undefined {
  if (!isPendingOpenRouterFlowSuperseded(flow, credential)) return undefined;

  return {
    type: "byok-oauth-complete",
    connector: "openrouter",
    flowId: flow.flowId,
    success: true,
  };
}
