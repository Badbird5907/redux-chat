import type { ChatThreadPreload } from "@/components/chat/preload";
import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import z from "zod";

import { api } from "@redux/backend/convex/_generated/api";

import { fetchAuthQuery } from "@/lib/auth/server";
import { ChatPage } from "./chat.$id.route-component";

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
    const preloadThread: ChatThreadPreload | null =
      thread == null
        ? null
        : {
            chatProjectId: thread.chatProjectId,
            selectedLeafMessageId: thread.selectedLeafMessageId,
            settingsJson: JSON.stringify(thread.settings),
          };

    return {
      messages,
      thread: preloadThread,
      threadName: displayName || null,
    };
  });

export const Route = createFileRoute("/_app/chat/$id")({
  params: z.object({ id: z.string() }),
  ssr: "data-only",
  loader: ({ params }) => loadChat({ data: { id: params.id } }),
  head: ({ loaderData }) => {
    const name = (loaderData as { threadName?: string | null } | undefined)
      ?.threadName;
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
