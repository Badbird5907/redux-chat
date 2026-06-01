import { createFileRoute, useParams } from "@tanstack/react-router";
import z from "zod";

import { AdminUserDetailPage } from "@/components/admin/user-detail/admin-user-detail-page";

function AdminUserDetailRoute() {
  const { userId } = useParams({ from: "/admin/users/$userId" });
  return <AdminUserDetailPage userId={userId} />;
}

export const Route = createFileRoute("/admin/users/$userId")({
  params: z.object({ userId: z.string() }),
  head: ({ params }) => ({
    meta: [
      { title: `User ${params.userId.slice(0, 8)}… | Admin | Redux Chat` },
    ],
  }),
  component: AdminUserDetailRoute,
});
