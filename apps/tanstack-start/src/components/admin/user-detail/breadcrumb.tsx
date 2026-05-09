import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";

export function AdminUserDetailBreadcrumb({ name }: { name: string }) {
  return (
    <nav className="text-muted-foreground flex flex-wrap items-center gap-1 text-sm">
      <Link
        to="/admin/users"
        className="hover:text-foreground font-medium transition-colors"
      >
        Users
      </Link>
      <ChevronRight className="size-4 opacity-60" />
      <span className="text-foreground truncate">{name}</span>
    </nav>
  );
}
