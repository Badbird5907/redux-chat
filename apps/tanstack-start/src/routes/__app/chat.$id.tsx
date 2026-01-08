import { createFileRoute } from '@tanstack/react-router'
import { Chat } from "@/components/chat";
import { SignedCidProvider } from "@/components/chat/client-id";
import { Authenticated } from "@/components/authenticated";

export const Route = createFileRoute('/app/chat/$id')({
  component: ChatPage,
  loader: async ({ params }) => {
    const { id } = params;
    // You would typically fetch thread data here using Convex
    // const thread = await fetchAuthQuery(api.functions.threads.getThreadMessages, { threadId: id });
    return { id };
  },
})

function ChatPage() {
  const { id } = Route.useLoaderData();
  
  return (
    <SignedCidProvider>
      <Authenticated>
        <Chat initialThreadId={id} preload={undefined} />
      </Authenticated>
    </SignedCidProvider>
  );
}