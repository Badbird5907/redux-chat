import { createFileRoute } from "@tanstack/react-router";
import { ConvexHttpClient } from "convex/browser";
import z from "zod";

import { api } from "@redux/backend/convex/_generated/api";

import { env } from "@/env";
import { SharePage } from "./share.$shareId.route-component";

async function loadShare(shareId: string) {
  const client = new ConvexHttpClient(env.VITE_CONVEX_URL);
  return await client
    .query(api.functions.threadShares.getPublicShare, { shareId })
    .catch(() => null);
}

export const Route = createFileRoute("/_app/share/$shareId")({
  params: z.object({ shareId: z.string() }),
  ssr: "data-only",
  loader: ({ params }) => loadShare(params.shareId),
  head: ({ loaderData }) => {
    const name = loaderData?.thread.name.trim();
    return {
      meta: [
        {
          title: name ? `${name} | Redux Chat` : "Shared Chat | Redux Chat",
        },
      ],
    };
  },
  component: SharePage,
});
