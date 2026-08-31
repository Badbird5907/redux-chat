import { Link } from "@tanstack/react-router";
import { LockKeyhole } from "lucide-react";

import { Badge } from "@redux/ui/components/badge";

/**
 * Marks a section that is visible but inert while the user is on the Free plan,
 * so the options they can unlock stay discoverable.
 */
export function UpgradeLockBadge({ className }: { className?: string }) {
  return (
    <Badge
      variant="outline"
      color="muted"
      className={className}
      render={<Link to="/settings" />}
      title="Included with any paid plan"
    >
      <LockKeyhole aria-hidden />
      Paid plan
    </Badge>
  );
}
