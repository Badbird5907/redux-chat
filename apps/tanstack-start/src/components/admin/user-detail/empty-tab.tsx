export function EmptyTab({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="border-border/60 bg-card/30 flex min-h-40 flex-col items-start justify-center rounded-2xl border border-dashed px-6 py-8">
      <h3 className="text-foreground text-sm font-semibold">{title}</h3>
      <p className="text-muted-foreground mt-1 text-sm">{description}</p>
    </div>
  );
}
