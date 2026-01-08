import type { QueryClient } from "@tanstack/react-query";
import {
  createRootRouteWithContext,
  HeadContent,
  Outlet,
  Scripts,
  useRouteContext,
} from "@tanstack/react-router";
import * as React from "react";
import { createServerFn } from '@tanstack/react-start'
import { ConvexBetterAuthProvider } from '@convex-dev/better-auth/react'
import type { ConvexQueryClient } from '@convex-dev/react-query'
import { Toaster } from "@redux/ui/components/sonner";
import { ThemeProvider } from "@redux/ui/components/theme";
import { env } from "../env";

import appCss from "@/styles.css?url";
import { authClient } from '@/lib/auth-client'
import { getToken } from '@/lib/auth-server'
import { ConvexClientProvider } from "@/providers/convex";

const getAuth = createServerFn({ method: 'GET' }).handler(async () => {
  return await getToken()
})

export const Route = createRootRouteWithContext<{
  queryClient: QueryClient;
  convexQueryClient: ConvexQueryClient
}>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1",
      },
      {
        name: "theme-color",
        content: [
          { media: "(prefers-color-scheme: light)", color: "white" },
          { media: "(prefers-color-scheme: dark)", color: "black" },
        ],
      },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
    ],
    title: "Redux Chat",
  }),
  beforeLoad: async (ctx) => {
    const token = await getAuth()
    // all queries, mutations and actions through TanStack Query will be
    // authenticated during SSR if we have a valid token
    if (token) {
      // During SSR only (the only time serverHttpClient exists),
      // set the auth token to make HTTP queries with.
      ctx.context.convexQueryClient.serverHttpClient?.setAuth(token)
    }
    return {
      isAuthenticated: !!token,
      token,
    }
  },
  component: RootComponent,
});

function RootComponent() {
  const context = useRouteContext({ from: Route.id }) 
  return (
    <ConvexBetterAuthProvider
      client={context.convexQueryClient.convexClient}
      authClient={authClient}
      initialToken={context.token}
    >
      <RootDocument>
        <ConvexClientProvider initialToken={context.token}>
          <Outlet />
          <Toaster />
        </ConvexClientProvider>
      </RootDocument>
    </ConvexBetterAuthProvider>
  )
}

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body className="bg-background text-foreground min-h-screen font-sans antialiased">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
        </ThemeProvider>
        <Scripts />
      </body>
    </html>
  );
}
