import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { api } from "@redux/backend/convex/_generated/api";
import { Chat } from "@/components/chat";
import { SignedCidProvider } from "@/components/chat/client-id";
import { fetchAuthQuery } from "@/lib/auth/server";
import z from "zod";

const getThreadMessages = createServerFn({ method: "GET" })
  .inputValidator(z.object({ id: z.string() }))
  .handler(async ({ data }) => {
    const thread = await fetchAuthQuery(
      api.functions.threads.getThreadMessages,
      { threadId: data.id }
    );
    return thread;
  });

export const Route = createFileRoute("/_app/chat/$id")({
  // params: z.object({ id: z.string() }),
  loader: async ({ params }) => {
    const thread = await getThreadMessages({ data: { id: params.id } });
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
