import { createServerFn } from "@tanstack/react-start";
import { UI_MESSAGE_STREAM_HEADERS } from 'ai';
import { after } from '@tanstack/react-start/server';
import { createResumableStreamContext } from 'resumable-stream';

import { api } from '@redux/backend/convex/_generated/api';

export const { GET } = createServerFn()
  .handler(async ({ request, params }) => {
    const { id } = params as { id: string };

    const thread = await fetchAuthQuery(api.functions.threads.getThread, { threadId: id });

    if (!thread.activeStreamId) {
      // no content response when there is no active stream
      return new Response(null, { status: 204 });
    }

    const streamContext = createResumableStreamContext({
      waitUntil: after,
      // ...createPubSub(),
    });

    return new Response(await streamContext.resumeExistingStream(thread.activeStreamId), { headers: UI_MESSAGE_STREAM_HEADERS });
  });