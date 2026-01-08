import { createFileRoute } from "@tanstack/react-router";
import { fetchAuthQuery } from "@/lib/auth-server";
import { api } from "@redux/backend/convex/_generated/api";
import { createResumableStreamContext } from "resumable-stream";

export const Route = createFileRoute("/api/chat/$id/stream").server({
  handlers: {
    GET: async ({ request, params }) => {
      const { id } = params;
      const streamId = id;
      
      // Get the stream from the context
      const streamContext = createResumableStreamContext({
        waitUntil: globalThis.after,
      });
      
      const stream = await streamContext.getResumableStream(streamId);
      
      if (!stream) {
        throw new Response("Stream not found", { status: 404 });
      }
      
      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive",
        },
      });
    },
  },
});