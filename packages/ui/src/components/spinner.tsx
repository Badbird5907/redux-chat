import { Loader2Icon } from "lucide-react";

export default function Spinner() {
  return (
    <div className="flex items-center justify-center">
      <Loader2Icon className="size-4 animate-spin" />
    </div>
  );
}
