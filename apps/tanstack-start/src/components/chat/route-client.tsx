"use client";

import { Chat } from ".";
import { SignedCidProvider } from "./client-id";

type ChatRouteClientProps = Parameters<typeof Chat>[0];

export default function ChatRouteClient(props: ChatRouteClientProps) {
  return (
    <SignedCidProvider>
      <Chat {...props} />
    </SignedCidProvider>
  );
}
