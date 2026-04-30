export const NEW_MODEL_RECENCY_DAYS = 14;

export function parseModelReleasedAtMs(
  releasedAt: string | undefined,
): number | undefined {
  if (!releasedAt?.trim()) return undefined;
  const t = Date.parse(releasedAt);
  if (Number.isNaN(t)) return undefined;
  return t;
}

export function compareChatModelsByReleaseDateNewestFirst(
  a: { releasedAt?: string; id: string },
  b: { releasedAt?: string; id: string },
): number {
  const ta = parseModelReleasedAtMs(a.releasedAt);
  const tb = parseModelReleasedAtMs(b.releasedAt);
  if (ta === undefined && tb === undefined) return a.id.localeCompare(b.id);
  if (ta === undefined) return 1;
  if (tb === undefined) return -1;
  if (tb !== ta) return tb - ta;
  return a.id.localeCompare(b.id);
}

export function isModelNewlyReleased(
  releasedAt: string | undefined,
  options?: { withinDays?: number; now?: Date },
): boolean {
  const t = parseModelReleasedAtMs(releasedAt);
  if (t === undefined) return false;
  const now = options?.now ?? new Date();
  const withinDays = options?.withinDays ?? NEW_MODEL_RECENCY_DAYS;
  const windowMs = withinDays * 24 * 60 * 60 * 1000;
  const age = now.getTime() - t;
  return age >= 0 && age <= windowMs;
}
