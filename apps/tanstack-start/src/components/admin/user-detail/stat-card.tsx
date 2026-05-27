export function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="border-border/60 bg-card/40 rounded-xl border px-4 py-3">
      <p className="text-muted-foreground text-xs font-medium">{label}</p>
      <p className="text-foreground mt-1 text-xl font-semibold tabular-nums">
        {value}
      </p>
      {hint ? (
        <p className="text-muted-foreground/80 mt-0.5 text-[11px]">{hint}</p>
      ) : null}
    </div>
  );
}
