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
import { ThemeProvider, ThemeToggle } from "@redux/ui/components/theme";
import { Toaster } from "@redux/ui/components/sonner";

import appCss from "@/styles.css?url";
import { authClient } from '@/lib/auth-client'
import { getToken } from '@/lib/auth-server'
import { env } from "@/env";

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
      { title: "Redux Chat" },
      {
        name: "description",
        content:
          "Opinionated full-stack template for quickly bootstrapping a TanStack Start and turborepo app with Convex, Better Auth, and more.",
      },
      {
        property: "og:title",
        content: "Redux Chat",
      },
      {
        property: "og:description",
        content:
          "Opinionated full-stack template for quickly bootstrapping a TanStack Start and turborepo app with Convex, Better Auth, and more.",
      },
      {
        property: "og:url",
        content: env.VITE_CONVEX_SITE_URL || "http://localhost:3000",
      },
      {
        property: "og:site_name",
        content: "Redux Chat",
      },
      {
        name: "twitter:card",
        content: "summary_large_image",
      },
      {
        name: "twitter:site",
        content: "@jullerino",
      },
      {
        name: "twitter:creator",
        content: "@jullerino",
      },
      {
        name: "theme-color",
        content: "white",
        media: "(prefers-color-scheme: light)",
      },
      {
        name: "theme-color",
        content: "black",
        media: "(prefers-color-scheme: dark)",
      },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
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
        <Outlet />
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
        <ThemeProvider>
          {children}
          <Toaster />
          <ThemeToggle />
        </ThemeProvider>
        <Scripts />
      </body>
    </html>
  );
}
