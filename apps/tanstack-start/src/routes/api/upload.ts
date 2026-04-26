import { createFileRoute } from "@tanstack/react-router";
import { createRouteHandler } from "@silo-storage/sdk-tanstack-start";

import { getSiloCore } from "@/lib/silo/core.server";
import type { UploadContext } from "@/upload";
import { fileRouter } from "@/upload";

const handlers = createRouteHandler<UploadContext>({
  router: fileRouter,
  core: getSiloCore(),
  completionTransport: "auto",
  resolveContext: (): UploadContext => ({}),
});

export const Route = createFileRoute("/api/upload")({
  server: {
    handlers,
  },
});
