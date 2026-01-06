import { fetchAuthQuery } from "@/auth/server";
import { api } from "@redux/backend/convex/_generated/api";
import { Chat } from "@/components/chat";
import { SignedCidProvider } from "@/components/chat/client-id";

export default async function ChatPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const thread = await fetchAuthQuery(api.functions.threads.getThreadMessages, { threadId: id });

  return (
    <SignedCidProvider>
      <Chat preload={thread} initialThreadId={id} />
    </SignedCidProvider>
  );
}