import { useLoaderData, useParams } from "@tanstack/react-router";

import { SignedCidProvider } from "@/components/chat/client-id";
import { SharedChat } from "@/components/share/shared-chat";

export function SharePage() {
  const { shareId } = useParams({ from: "/_app/share/$shareId" });
  const preload = useLoaderData({ from: "/_app/share/$shareId" });

  return (
    <SignedCidProvider>
      <SharedChat shareId={shareId} preload={preload} />
    </SignedCidProvider>
  );
}
