import { createFileRoute } from "@tanstack/react-router";
import z from "zod";

import { AdminUserDetailPage } from "@/components/admin/user-detail/admin-user-detail-page";

function AdminUserDetailRoute() {
  const { userId } = Route.useParams();
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
