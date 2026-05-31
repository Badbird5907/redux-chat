import type { ReactNode } from "react";

export function StatusPanel({
  icon,
  tone,
  title,
  description,
  className,
}: {
  icon: ReactNode;
  tone: "success" | "destructive" | "muted";
  title: string;
  description: string;
  className?: string;
}) {
  const toneClass =
    tone === "success"
      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
      : tone === "destructive"
        ? "border-destructive/30 bg-destructive/10 text-destructive"
        : "border-border bg-muted/35 text-foreground";

  return (
    <div
      className={`rounded-lg border p-4 text-sm ${toneClass} ${className ?? ""}`}
    >
      <div className="flex items-center gap-2 font-medium">
        {icon}
        {title}
      </div>
      <p className="text-muted-foreground mt-2 leading-6">{description}</p>
    </div>
  );
}
