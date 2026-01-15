import { Loader2Icon } from "lucide-react";
import { cn } from "../lib/utils";

export default function Spinner({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center justify-center", className)}>
      <Loader2Icon className="size-4 animate-spin" />
    </div>
  );
}
