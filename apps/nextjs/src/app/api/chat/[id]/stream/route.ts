
import { UI_MESSAGE_STREAM_HEADERS } from 'ai';
import { after } from 'next/server';
import { createResumableStreamContext } from 'resumable-stream/generic';
import { fetchAuthQuery } from "@/auth/server"
import { api } from '@redux/backend/convex/_generated/api';
import type { Id } from '@redux/backend/convex/_generated/dataModel';
import { createPubSub } from '../../stream';

export async function GET(
  _: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const thread = await fetchAuthQuery(api.functions.threads.getThread, { threadId: id as Id<"threads"> });

  if (!thread.activeStreamId) {
    // no content response when there is no active stream
    return new Response(null, { status: 204 });
  }

  const streamContext = createResumableStreamContext({
    waitUntil: after,
    ...createPubSub(),
  });

  return new Response(
    await streamContext.resumeExistingStream(thread.activeStreamId),
    { headers: UI_MESSAGE_STREAM_HEADERS },
  );
}
