export function getByokOAuthChannelName(
  connector: string,
  flowId: string,
): string {
  return `redux-chat:byok-oauth:${connector}:${flowId}`;
}

export function getByokOAuthResultStorageKey(
  connector: string,
  flowId: string,
): string {
  return `redux-chat:byok-oauth-result:${connector}:${flowId}`;
}

export function getByokOAuthPendingStorageKey(connector: string): string {
  return `redux-chat:byok-oauth-pending:${connector}`;
}
