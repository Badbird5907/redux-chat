import { useParams } from "@tanstack/react-router";

import { AdminUserDetailPage } from "@/components/admin/user-detail/admin-user-detail-page";

export function AdminUserDetailRoute() {
  const { userId } = useParams({ from: "/admin/users/$userId" });
  return <AdminUserDetailPage userId={userId} />;
}
