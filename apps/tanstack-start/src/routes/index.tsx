import { createFileRoute, redirect } from "@tanstack/react-router";
import { useRouteContext } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  beforeLoad: async ({ context }) => {
    if (context.isAuthenticated) {
      return {};
    } else {
      throw redirect("/auth/sign-in");
    }
  },
  component: IndexPage,
});

function IndexPage() {
  const context = useRouteContext({ from: "/_app" });
  
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-4">Welcome to Redux Chat</h2>
          <p className="text-muted-foreground">Select a chat from the sidebar or start a new conversation</p>
        </div>
      </div>
    </div>
  );
}
