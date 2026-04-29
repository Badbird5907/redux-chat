import type { UploadContext } from "@/upload";
import { createRouteHandler } from "@silo-storage/sdk-tanstack-start";
import { createFileRoute } from "@tanstack/react-router";

import { getSiloCore } from "@/lib/silo/core.server";
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
