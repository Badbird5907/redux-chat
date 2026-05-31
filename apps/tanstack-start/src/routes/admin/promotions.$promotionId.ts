import { createFileRoute } from "@tanstack/react-router";

import { AdminPromotionDetailPage } from "./promotions.$promotionId.route-component";

export const Route = createFileRoute("/admin/promotions/$promotionId")({
  head: ({ params }) => ({
    meta: [
      {
        title: `Promotion ${params.promotionId.slice(0, 8)} | Admin | Redux Chat`,
      },
    ],
  }),
  component: AdminPromotionDetailPage,
});
