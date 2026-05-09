import type { HookEndpointContext } from "@better-auth/core";
import { createAuthMiddleware, getSessionFromCtx } from "better-auth/api";

import type { ResolvedOptions } from "../types";
import { buildLogEntry, writeEntry } from "../internal";

export function createBeforeHooks(opts: ResolvedOptions, modelName: string) {
  return [
    {
      matcher: (context: HookEndpointContext) => {
        const path = context.path;
        if (!path) return false;
        return (
          opts.beforePaths.some((p) => path.startsWith(p)) &&
          opts.shouldCapture(path)
        );
      },

      handler: createAuthMiddleware(async (ctx) => {
        try {
          const session = await getSessionFromCtx(ctx);
          if (!session) return;
          const path = ctx.path;
          if (!path) return;
          const pathConfig = opts.getPathConfig(path);

          const entry = await buildLogEntry(path, "success", {
            userId: session.user.id,
            request: ctx.request,
            headers: ctx.headers,
            pathConfig,
            options: opts,
            authOptions: ctx.context.options,
          });

          await writeEntry(ctx, entry, opts, modelName);
        } catch (err) {
          ctx.context.logger.error("[audit-log] before hook failed", err);
        }
      }),
    },
  ];
}
