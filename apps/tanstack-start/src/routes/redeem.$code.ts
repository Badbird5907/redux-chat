import { createFileRoute } from "@tanstack/react-router";

import { loadPublicPromotion } from "./redeem.$code-loader";
import { RedeemPromotionPage } from "./redeem.$code.route-component";

export const Route = createFileRoute("/redeem/$code")({
  ssr: "data-only",
  loader: ({ params }) => loadPublicPromotion(params.code),
  head: ({ params }) => ({
    meta: [{ title: `Redeem ${params.code} | Redux Chat` }],
  }),
  component: RedeemPromotionPage,
});
