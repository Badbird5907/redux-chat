export function formatDate(
  value: Date | string | number | null | undefined,
): string {
  if (value == null) {
    return "—";
  }
  const d =
    typeof value === "number"
      ? new Date(value)
      : value instanceof Date
        ? value
        : new Date(value);
  if (Number.isNaN(d.getTime())) {
    return "—";
  }
  return d.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export type UsageStats = {
  totalMessages: number;
  threadsCreated: number;
  attachmentsUploaded: number;
  storageBytes: number;
  chatApiCalls30d: number;
  lastActiveAt: number | null;
};
