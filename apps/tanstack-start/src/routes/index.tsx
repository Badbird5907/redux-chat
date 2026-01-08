import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: HomePage,
  beforeLoad: async () => {
    // Check if user is authenticated
    try {
      const response = await fetch('/api/auth/check', {
        method: 'GET',
      });
      
      if (response.ok) {
        // User is authenticated, redirect to app
        throw redirect({ to: "/_app" });
      }
    } catch (error) {
      // Either redirect or user is not authenticated, continue
    }
    
    return {};
  },
});

function HomePage() {
  return (
    <div className="min-h-dvh w-screen flex items-center justify-center flex-col gap-y-4 p-4">
      <h1>Welcome to Redux Chat</h1>
      <p>Please sign in to continue</p>
      <a
        className="bg-foreground text-background rounded-full px-4 py-1 hover:opacity-90"
        href="/auth/sign-in"
      >
        Sign In
      </a>
    </div>
  );
}
