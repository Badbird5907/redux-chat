import { createFileRoute } from "@tanstack/react-router";
import { waitUntil } from "@vercel/functions";
import { UI_MESSAGE_STREAM_HEADERS } from "ai";
import { createResumableStreamContext } from "resumable-stream";

import { api } from "@redux/backend/convex/_generated/api";

import { fetchAuthMutation, fetchAuthQuery } from "@/lib/auth/server";
import { createUpstashPubSub } from "@/lib/upstash-resumable-stream";

export const Route = createFileRoute("/api/chat/$id/stream/")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const { id } = params;

        const thread = await fetchAuthQuery(api.functions.threads.getThread, {
          threadId: id,
        });

        if (!thread?.activeStreamId) {
          // no content response when there is no active stream
          return new Response(null, { status: 204 });
        }

        const { publisher, subscriber } = createUpstashPubSub();
        const streamContext = createResumableStreamContext({
          waitUntil,
          publisher,
          subscriber,
        });

        return new Response(
          await streamContext.resumeExistingStream(thread.activeStreamId),
          { headers: UI_MESSAGE_STREAM_HEADERS },
        );
      },
      DELETE: async ({ params }) => {
        const { id } = params;
        const thread = await fetchAuthQuery(api.functions.threads.getThread, {
          threadId: id,
        });
        console.log("DELETE request received for thread:", thread?._id);
        if (!thread?.activeStreamId) {
          return new Response(null, { status: 204 });
        }
        if (!thread.activeStreamMessageId) {
          return new Response(null, { status: 204 });
        }
        await fetchAuthMutation(api.functions.threads.abortStream, {
          threadId: id,
          messageId: thread.activeStreamMessageId,
        });
        return new Response("Stream aborted", { status: 200 });
      },
    },
  },
});
