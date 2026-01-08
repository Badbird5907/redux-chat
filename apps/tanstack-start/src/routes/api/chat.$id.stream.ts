import { createFileRoute } from '@tanstack/react-router'
import { UI_MESSAGE_STREAM_HEADERS } from 'ai';
import { createResumableStreamContext } from "resumable-stream";
import { fetchAuthQuery } from "@/lib/auth-server";
import { api } from "@redux/backend/convex/_generated/api";

export const Route = createFileRoute('/api/chat/$id/stream')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const { id } = params;

        const thread = await fetchAuthQuery(api.functions.threads.getThread, { threadId: id });

        if (!thread.activeStreamId) {
          // no content response when there is no active stream
          return new Response(null, { status: 204 });
        }

        const streamContext = createResumableStreamContext({
          waitUntil: (callback) => {
            // TanStack Start equivalent of Next.js after
            Promise.resolve(callback()).catch(console.error);
          },
        });

        return new Response(await streamContext.resumeExistingStream(thread.activeStreamId), { 
          headers: UI_MESSAGE_STREAM_HEADERS 
        });
      },
    },
  },
})