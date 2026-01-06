import { Chat } from "@/components/chat";
import { SignedCidProvider } from "@/components/chat/client-id";

export default function HomePage() {
  
  return (
    <SignedCidProvider>
      <Chat initialThreadId={undefined} preload={undefined} />
    </SignedCidProvider>
  );
}