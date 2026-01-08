import { createFileRoute } from "@tanstack/react-router";
import { fetchAuthQuery } from "@/lib/auth-server";
import { api } from "@redux/backend/convex/_generated/api";
import { Chat } from "@/components/chat";
import { SignedCidProvider } from "@/components/chat/client-id";

export const Route = createFileRoute("/_app/chat/$id")({
  loader: async ({ params }) => {
    const thread = await fetchAuthQuery(api.functions.threads.getThreadMessages, {
      threadId: params.id,
    });
    return { thread, threadId: params.id };
  },
  component: ChatPage,
});

function ChatPage() {
  const { thread, threadId } = Route.useLoaderData();

  return (
    <SignedCidProvider>
      <Chat preload={thread} initialThreadId={threadId} />
    </SignedCidProvider>
  );
}
