export function getByokOAuthChannelName(
  connector: string,
  flowId: string,
): string {
  return `redux-chat:byok-oauth:${connector}:${flowId}`;
}
