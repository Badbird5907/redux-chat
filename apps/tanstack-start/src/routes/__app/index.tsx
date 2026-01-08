import { createFileRoute } from '@tanstack/react-router'
import { Chat } from "@/components/chat";
import { SignedCidProvider } from "@/components/chat/client-id";

export const Route = createFileRoute('/app/')({
  component: HomePage,
})

function HomePage() {
  return (
    <SignedCidProvider>
      <Chat initialThreadId={undefined} preload={undefined} />
    </SignedCidProvider>
  );
}