import { createFileRoute, redirect } from "@tanstack/react-router";
import { useRouteContext } from "@tanstack/react-router";
import { api } from "@redux/backend/convex/_generated/api";
import { Chat } from "@/components/chat";
import { SignedCidProvider } from "@/components/chat/client-id";

export const Route = createFileRoute("/_app/chat/$id")({
  beforeLoad: async ({ context }) => {
    if (!context.isAuthenticated) {
      throw redirect("/auth/sign-in");
    }
    return {};
  },
  loader: async ({ params, context }) => {
    const { id } = params as { id: string };
    // Use fetchAuthQuery pattern for SSR data fetching
    // This would need to be adapted based on your auth setup
    try {
      // Placeholder for SSR data fetching
      // const thread = await fetchAuthQuery(api.functions.threads.getThreadMessages, { threadId: id });
      return { threadId: id };
    } catch (error) {
      console.error("Error loading thread:", error);
      throw new Response("Thread not found", { status: 404 });
    }
  },
  component: ChatPage,
});

function ChatPage() {
  const { id } = Route.useParams();
  const loaderData = Route.useLoaderData();
  const context = useRouteContext({ from: "/_app" });

  return (
    <SignedCidProvider>
      <div className="flex h-full flex-col overflow-hidden">
        <Chat 
          initialThreadId={id} 
          preload={loaderData?.threadId ? undefined : undefined} 
        />
      </div>
    </SignedCidProvider>
  );
}