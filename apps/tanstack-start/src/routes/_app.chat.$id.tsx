import { createFileRoute } from "@tanstack/react-router";
import { fetchAuthQuery } from "@/lib/auth-server";
import { api } from "@redux/backend/convex/_generated/api";
import { Chat } from "@/components/chat";
import { SignedCidProvider } from "@/components/chat/client-id";
import { Authenticated } from "./authenticated";

export const Route = createFileRoute("/_app/chat/$id")({
  component: ChatPage,
  loader: async ({ params }) => {
    const { id } = params;
    
    const thread = await fetchAuthQuery(api.functions.threads.getThreadMessages, { threadId: id });
    
    return { 
      thread,
      id,
    };
  },
});

function ChatPage() {
  const { thread, id } = Route.useLoaderData();
  
  return (
    <SignedCidProvider>
      <Authenticated>
        <Chat preload={thread} initialThreadId={id} />
      </Authenticated>
    </SignedCidProvider>
  );
}