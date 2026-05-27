import { cn } from "@redux/ui/lib/utils";

export function InfoField({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1", className)}>
      <p className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">
        {label}
      </p>
      <div className="text-foreground text-sm">{children}</div>
    </div>
  );
}
