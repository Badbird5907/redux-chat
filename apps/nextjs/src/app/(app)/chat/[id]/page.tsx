import { Chat } from "@/components/chat";

export default async function ChatPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // const thread = await preloadAuthQuery(api.functions.threads.getThread, { threadId: id as Id<"threads"> });

  return (
    <Chat threadId={id}/>
  );
}