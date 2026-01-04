import { fetchAuthQuery } from "@/auth/server";
import { api } from "@redux/backend/convex/_generated/api";
import type { Id } from "@redux/backend/convex/_generated/dataModel";
import { PreloadedChat } from "@/components/chat";
import { Authenticated } from "@/app/(app)/authenticated";

export default async function ChatPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const thread = await fetchAuthQuery(api.functions.threads.getThreadMessages, { threadId: id as Id<"threads"> });

  return (
    <Authenticated>
      <PreloadedChat preload={thread} threadId={id} />
    </Authenticated>
  );
}