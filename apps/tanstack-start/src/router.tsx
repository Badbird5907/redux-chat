import { ConvexQueryClient } from "@convex-dev/react-query";
import { notifyManager, QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query";
import * as Sentry from "@sentry/tanstackstart-react";
import SuperJSON from "superjson";
import { useEffect } from "react";

import { env, getSentryPublicDsn } from "./env";
import { routeTree } from "./routeTree.gen";

function DefaultRouterError({ error }: { error: Error }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);
  return <p>{error.stack}</p>;
}

export function getRouter() {
  if (typeof document !== "undefined") {
    notifyManager.setScheduler(window.requestAnimationFrame);
  }
  const convexUrl = env.VITE_CONVEX_URL;
  if (!convexUrl) {
    throw new Error("VITE_CONVEX_URL is not set");
  }
  const convexQueryClient = new ConvexQueryClient(convexUrl, {
    expectAuth: true,
  });

  const queryClient = new QueryClient({
    defaultOptions: {
      dehydrate: { serializeData: SuperJSON.serialize },
      hydrate: { deserializeData: SuperJSON.deserialize },
      queries: {
        queryKeyHashFn: convexQueryClient.hashFn(),
        queryFn: convexQueryClient.queryFn(),
      },
    },
  });
  convexQueryClient.connect(queryClient);

  if (typeof document !== "undefined") {
    Sentry.init({
      dsn: getSentryPublicDsn(),
      sendDefaultPii: true,
      enabled: env.NODE_ENV === "production",
    });
  }

  const router = createRouter({
    routeTree,
    defaultPreload: "intent",
    context: { queryClient, convexQueryClient },
    scrollRestoration: true,
    defaultErrorComponent: DefaultRouterError,
    defaultNotFoundComponent: () => <p>not found</p>,
  });
  setupRouterSsrQueryIntegration({
    router,
    queryClient,
  });

  return router;
}
