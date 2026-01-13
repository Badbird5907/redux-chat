import type { ConvexQueryClient } from "@convex-dev/react-query";
import type { QueryClient } from "@tanstack/react-query";
import { ConvexBetterAuthProvider } from "@convex-dev/better-auth/react";
import {
  createRootRouteWithContext,
  HeadContent,
  Outlet,
  Scripts,
} from "@tanstack/react-router";

import { Toaster } from "@redux/ui/components/sonner";
import { cn } from "@redux/ui/lib/utils";

import { ConvexClientProvider } from "@/providers/convex";
import appCss from "@/styles/app.css?url";
import { ThemeProvider,
ThemeToggle } from "@redux/ui/components/theme";
import { authClient } from "@/auth/client";
import { useRouteContext } from "@tanstack/react-router";
import { getToken } from "@/auth/server";
import { createServerFn } from "@tanstack/react-start";

const getAuth = createServerFn({ method: 'GET' }).handler(async () => {
  return await getToken()
})

export const Route = createRootRouteWithContext<{
  queryClient: QueryClient;
  convexQueryClient: ConvexQueryClient;
}>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1",
      },
      { title: "TanStack Start Starter" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
    ],
  }),
  beforeLoad: async (ctx) => {
    const token = await getAuth();
    // all queries, mutations and actions through TanStack Query will be
    // authenticated during SSR if we have a valid token
    if (token) {
      // During SSR only (the only time serverHttpClient exists),
      // set the auth token to make HTTP queries with.
      ctx.context.convexQueryClient.serverHttpClient?.setAuth(token);
    }
    return {
      isAuthenticated: !!token,
      token,
    };
  },
  component: RootComponent,
});

function RootComponent() {
  const context = useRouteContext({ from: Route.id });
  return (
    <ConvexBetterAuthProvider
      client={context.convexQueryClient.convexClient}
      authClient={authClient}
      initialToken={context.token}
    >
      <RootDocument>
        <Outlet />
      </RootDocument>
    </ConvexBetterAuthProvider>
  );
}

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body
        className={cn(
          "bg-background text-foreground min-h-screen font-sans antialiased",
        )}
        style={{
          fontFamily: "var(--font-geist-sans, 'Geist', sans-serif)",
          // @ts-expect-error CSS custom properties
          "--font-geist-sans": "'Geist', sans-serif",
          "--font-geist-mono": "'Geist Mono', monospace",
          "--font-audiowide": "'Audiowide', sans-serif",
        }}
      >
        <ThemeProvider>
          {children}
          <ThemeToggle />
          <Toaster />
        </ThemeProvider>
        <Scripts />
      </body>
    </html>
  );
}
