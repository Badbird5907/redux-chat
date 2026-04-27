export function isAttachmentExpired(
  expiresAt: number | undefined,
  now = Date.now(),
) {
  return expiresAt !== undefined && expiresAt <= now;
}
