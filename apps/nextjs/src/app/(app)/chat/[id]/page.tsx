import { fetchAuthQuery } from "@/auth/server";
import { api } from "@redux/backend/convex/_generated/api";
import { Chat } from "@/components/chat";
import { SignedCidProvider } from "@/components/chat/client-id";
import { Authenticated } from "../../authenticated";

export default async function ChatPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const thread = await fetchAuthQuery(api.functions.threads.getThreadMessages, { threadId: id });

  return (
    <SignedCidProvider>
      <Authenticated>
        <Chat key={id} preload={thread} initialThreadId={id} />
      </Authenticated>

  );
}