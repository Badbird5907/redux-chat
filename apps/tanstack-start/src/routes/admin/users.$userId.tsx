import { createFileRoute } from "@tanstack/react-router";
import z from "zod";

import { AdminUserDetailRoute } from "./users.$userId.route-component";

export const Route = createFileRoute("/admin/users/$userId")({
  params: z.object({ userId: z.string() }),
  head: ({ params }) => ({
    meta: [
      { title: `User ${params.userId.slice(0, 8)}… | Admin | Redux Chat` },
    ],
  }),
  component: AdminUserDetailRoute,
});
