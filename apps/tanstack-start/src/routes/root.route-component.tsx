import type { ReactNode } from "react";
import { lazy, Suspense, useEffect, useRef } from "react";
import { ConvexBetterAuthProvider } from "@convex-dev/better-auth/react";
import {
  ClientOnly,
  HeadContent,
  Outlet,
  Scripts,
  useRouteContext,
} from "@tanstack/react-router";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/react";
import { useAction, useConvexAuth } from "convex/react";
import { PostHogProvider } from "posthog-js/react";

import { api } from "@redux/backend/convex/_generated/api";
import { Toaster } from "@redux/ui/components/sonner";
import { ThemeProvider } from "@redux/ui/components/theme";
import { cn } from "@redux/ui/lib/utils";

import { env } from "@/env";
import { authClient } from "@/lib/auth/client";
import { HotkeySettingsProvider } from "@/lib/hotkeys";

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

export function RootComponent() {
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
