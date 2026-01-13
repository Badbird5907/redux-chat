import { QueryClient, notifyManager } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query";
import { ConvexQueryClient } from "@convex-dev/react-query";
import SuperJSON from "superjson";
// import { env } from "./env";

import { routeTree } from "./routeTree.gen";

export function getRouter() {
  if (typeof document !== "undefined") {
    notifyManager.setScheduler(window.requestAnimationFrame);
  }
  const convexUrl = import.meta.env.VITE_CONVEX_URL as string;
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

  const router = createRouter({
    routeTree,
    defaultPreload: "intent",
    context: { queryClient, convexQueryClient },
    scrollRestoration: true,
    defaultErrorComponent: ({ error }) => <p>{error.stack}</p>,
    defaultNotFoundComponent: () => <p>not found</p>,
  });
  setupRouterSsrQueryIntegration({
    router,
    queryClient,
  });

  return router;
}