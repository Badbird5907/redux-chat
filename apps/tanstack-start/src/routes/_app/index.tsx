import { createFileRoute } from "@tanstack/react-router";

import { AppChatRoute } from "@/components/chat/app-chat-route";

export const Route = createFileRoute("/_app/")({
  ssr: false,
  component: NewChatPage,
});

function NewChatPage() {
  return <AppChatRoute initialThreadId={undefined} preload={undefined} />;
}
