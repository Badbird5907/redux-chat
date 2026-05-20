import { createFileRoute } from "@tanstack/react-router";
import { ConvexHttpClient } from "convex/browser";
import z from "zod";

import { api } from "@redux/backend/convex/_generated/api";

import { SignedCidProvider } from "@/components/chat/client-id";
import { SharedChat } from "@/components/share/shared-chat";
import { env } from "@/env";

async function loadShare(shareId: string) {
  const client = new ConvexHttpClient(env.VITE_CONVEX_URL);
  return await client
    .query(api.functions.threadShares.getPublicShare, { shareId })
    .catch(() => null);
}

export const Route = createFileRoute("/_app/share/$shareId")({
  ssr: "data-only",
  params: z.object({ shareId: z.string() }),
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

function SharePage() {
  const { shareId } = Route.useParams();
  const preload = Route.useLoaderData();

  return (
    <SignedCidProvider>
      <SharedChat shareId={shareId} preload={preload} />
    </SignedCidProvider>
  );
}
