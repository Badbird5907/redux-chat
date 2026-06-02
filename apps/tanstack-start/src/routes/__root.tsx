import type { ConvexQueryClient } from "@convex-dev/react-query";
import type { QueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { lazy, Suspense, useEffect, useRef } from "react";
import { ConvexBetterAuthProvider } from "@convex-dev/better-auth/react";
import {
  ClientOnly,
  createRootRouteWithContext,
  HeadContent,
  Outlet,
  Scripts,
  useRouteContext,
} from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/react";
import { BotIdClient } from "botid/client";
import { useAction, useConvexAuth } from "convex/react";
import { PostHogProvider } from "posthog-js/react";

import { api } from "@redux/backend/convex/_generated/api";
import { Toaster } from "@redux/ui/components/sonner";
import { ThemeProvider } from "@redux/ui/components/theme";
import { cn } from "@redux/ui/lib/utils";

import { env } from "@/env";
import { authClient } from "@/lib/auth/client";
import { getToken } from "@/lib/auth/server";
import { HotkeySettingsProvider } from "@/lib/hotkeys";
import appCss from "@/styles.css?url";

// eslint-disable-next-line turbo/no-undeclared-env-vars -- DEV is a Vite built-in, not a user-provided environment variable.
const isDev = import.meta.env.DEV;
const AppTanStackDevtools = isDev
  ? lazy(() => import("@/components/devtools/tanstack-devtools"))
  : null;
const DEFAULT_POSTHOG_UI_HOST = "https://us.posthog.com";

function getPostHogUiHost(posthogHost: string | undefined): string {
  if (!posthogHost) {
    return DEFAULT_POSTHOG_UI_HOST;
  }

  const normalizedHost = posthogHost.replace(/\/$/, "");

  if (/^https:\/\/(us|eu)\.i\.posthog\.com$/i.test(normalizedHost)) {
    return normalizedHost.replace(
      /^https:\/\/(us|eu)\.i\.posthog\.com$/i,
      "https://$1.posthog.com",
    );
  }

  if (normalizedHost === "https://app.posthog.com") {
    return DEFAULT_POSTHOG_UI_HOST;
  }

  return normalizedHost;
}

function RootComponent() {
  const context = useRouteContext({ from: "__root__" });
  return (
    <ConvexBetterAuthProvider
      client={context.convexQueryClient.convexClient}
      authClient={authClient}
      initialToken={context.token}
    >
      <RootDocument>
        <EnsureStripeCustomerOnAuth />
        <Outlet />
      </RootDocument>
    </ConvexBetterAuthProvider>
  );
}

function EnsureStripeCustomerOnAuth() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const ensureStripeCustomer = useAction(
    api.functions.billing.ensureCurrentUserStripeCustomer,
  );
  const didRequest = useRef(false);

  useEffect(() => {
    if (isLoading) {
      return;
    }

    if (!isAuthenticated) {
      didRequest.current = false;
      return;
    }

    if (didRequest.current) {
      return;
    }

    didRequest.current = true;
    void ensureStripeCustomer({}).catch((error: unknown) => {
      didRequest.current = false;
      console.error("Failed to ensure Stripe customer", error);
    });
  }, [ensureStripeCustomer, isAuthenticated, isLoading]);

  return null;
}

function RootDocument({ children }: { children: ReactNode }) {
  const posthogProjectToken = env.VITE_PUBLIC_POSTHOG_PROJECT_TOKEN;
  const posthogUiHost = getPostHogUiHost(env.VITE_PUBLIC_POSTHOG_HOST);
  const appShell = (
    <ThemeProvider>
      <HotkeySettingsProvider>
        {children}
        {AppTanStackDevtools ? (
          <ClientOnly>
            <Suspense fallback={null}>
              <AppTanStackDevtools />
            </Suspense>
          </ClientOnly>
        ) : null}
        {/* <ThemeToggle /> */}
        <Toaster />
      </HotkeySettingsProvider>
    </ThemeProvider>
  );

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
        <BotIdClient protect={[{ path: "/api/chat", method: "POST" }]} />
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
        {posthogProjectToken ? (
          <PostHogProvider
            apiKey={posthogProjectToken}
            options={{
              api_host: "/ingest",
              ui_host: posthogUiHost,
              defaults: "2025-05-24",
              capture_exceptions: true,
              debug: isDev,
            }}
          >
            {appShell}
          </PostHogProvider>
        ) : (
          appShell
        )}
        <Analytics />
        <SpeedInsights />
        <Scripts />
      </body>
    </html>
  );
}

const getAuth = createServerFn({ method: "GET" }).handler(async () => {
  return await getToken();
});

export const Route = createRootRouteWithContext<{
  queryClient: QueryClient;
  convexQueryClient: ConvexQueryClient;
}>()({
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
  head: () => ({
    meta: [
      {
        charSet: "utf-8",
      },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1",
      },
      {
        title: "Redux Chat",
      },
      {
        name: "description",
        content: "A chat app to rule them all",
      },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      {
        rel: "icon",
        href: "/favicon.ico",
      },
      {
        rel: "apple-touch-icon",
        sizes: "180x180",
        href: "/apple-touch-icon.png",
      },
      {
        rel: "icon",
        type: "image/png",
        sizes: "32x32",
        href: "/favicon-32x32.png",
      },
      {
        rel: "icon",
        type: "image/png",
        sizes: "16x16",
        href: "/favicon-16x16.png",
      },
      {
        rel: "preconnect",
        href: "https://fonts.googleapis.com",
      },
      {
        rel: "preconnect",
        href: "https://fonts.gstatic.com",
        crossOrigin: "anonymous",
      },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Geist:wght@100..900&family=Geist+Mono:wght@100..900&family=Audiowide:wght@400&display=swap",
      },
    ],
  }),
  component: RootComponent,
});
