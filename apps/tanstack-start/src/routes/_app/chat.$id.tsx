import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { api } from "@redux/backend/convex/_generated/api";
import { fetchAuthQuery } from "@/lib/auth/server";
import z from "zod";

import { AppChatRoute } from "@/components/chat/app-chat-route";

const loadChat = createServerFn({ method: "GET" })
  .inputValidator(z.object({ id: z.string() }))
  .handler(async ({ data }) => {
    const [messages, thread] = await Promise.all([
      fetchAuthQuery(api.functions.threads.getThreadMessages, {
        threadId: data.id,
      }),
      fetchAuthQuery(api.functions.threads.getThread, {
        threadId: data.id,
      }).catch((): null => null),
    ]);
    const displayName = thread != null ? thread.name.trim() : "";
    return {
      messages,
      threadName: displayName || null,
    };
  });

export const Route = createFileRoute("/_app/chat/$id")({
  ssr: "data-only",
  params: z.object({ id: z.string() }),
  loader: ({ params }) => loadChat({ data: { id: params.id } }),
  head: ({ loaderData }) => {
    const name = loaderData?.threadName;
    return {
      meta: [
        {
          title: name ? `${name} | Redux Chat` : "Redux Chat",
        },
      ],
    };
  },
  component: ChatPage,
});

function ChatPage() {
  const { id } = Route.useParams();
  const { messages } = Route.useLoaderData();

  return <AppChatRoute initialThreadId={id} preload={messages} />;
}
