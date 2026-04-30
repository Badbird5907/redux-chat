import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";

import { api } from "@redux/backend/convex/_generated/api";

import { fetchAuthMutation } from "@/lib/auth/server";

const loadHomeChat = createServerFn({ method: "GET" }).handler(async () => {
  const settings = await fetchAuthMutation(
    api.functions.defaultMessageSettings.getOrCreate,
    {},
  ).catch(() => null);

  return {
    settingsJson: settings ? JSON.stringify(settings) : null,
  };
});

export const Route = createFileRoute("/_app/")({
  ssr: false,
  loader: () => loadHomeChat(),
  component: NewChatPage,
});

function NewChatPage() {
  return null;
}
