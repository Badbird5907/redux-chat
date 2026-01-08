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
import { cn } from "@redux/ui/lib/utils";

import appCss from "@/styles.css?url";
import { authClient } from '@/lib/auth-client'
import { getToken } from '@/lib/auth-server'
import { env } from '@/env'

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
        name: "description",
        content: "Opinionated full-stack template for quickly bootstrapping a TanStack Start and turborepo app with Better Auth, Convex, and more.",
      },
      {
        name: "theme-color",
        media: "(prefers-color-scheme: light)",
        content: "white",
      },
      {
        name: "theme-color",
        media: "(prefers-color-scheme: dark)",
        content: "black",
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
        <Outlet />
        <Toaster />
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
        {children}
        <Scripts />
      </body>
    </html>
  );
}
