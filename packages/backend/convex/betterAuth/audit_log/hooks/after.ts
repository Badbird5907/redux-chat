import type { HookEndpointContext } from "@better-auth/core";
import { createAuthMiddleware } from "better-auth/api";

import type { AuditLogStatus, ResolvedOptions } from "../types";
import { buildLogEntry, writeEntry } from "../internal";

export function createAfterHooks(opts: ResolvedOptions, modelName: string) {
  return [
    {
      matcher: (context: HookEndpointContext) => {
        const path = context.path;
        if (!path) return false;
        if (opts.beforePaths.some((p) => path.startsWith(p))) return false;
        return opts.shouldCapture(path);
      },

      handler: createAuthMiddleware(async (ctx) => {
        try {
          const path = ctx.path;
          if (!path) return;

          const returned = ctx.context.returned;
          // BetterAuth signals redirects (e.g. OAuth callback success) as an
          // APIError with status "FOUND". That is not a real failure.
          const isRedirect =
            returned instanceof Error &&
            "status" in returned &&
            (returned as { status?: unknown }).status === "FOUND";
          const isError = returned instanceof Error && !isRedirect;
          const status: AuditLogStatus = isError ? "failed" : "success";

          const user =
            ctx.context.newSession?.user ?? ctx.context.session?.user;

          // Skip pre-auth redirects where no user identity is available yet
          // (e.g. the initial /sign-in/social hop to the provider).
          if (user == null && !isError) return;

          // BetterAuth only fires sign-in/* for credential flows. OAuth
          // sign-ins complete at /callback/:provider — rewrite to
          // /sign-in/social/:provider so the event is consistent with
          // credential sign-ins and carries the provider name.
          // Note: `path` is the route pattern (/callback/:id), so we read
          // the actual provider from the request URL instead.
          const effectivePath = (() => {
            if (!isRedirect || !path.startsWith("/callback/")) return path;
            const provider = ctx.request
              ? new URL(ctx.request.url).pathname.split("/").pop()
              : undefined;
            return `/sign-in/social/${provider ?? "unknown"}`;
          })();

          const pathConfig = opts.getPathConfig(path);

          const metadata: Record<string, unknown> = {};

          if (opts.capture.requestBody && ctx.body) {
            metadata.requestBody = ctx.body as Record<string, unknown>;
          }

          if (isError) {
            const err = returned as Error & {
              status?: unknown;
              code?: string;
            };
            metadata.error = {
              message: err.message,
              ...(err.status !== undefined && { status: err.status }),
              ...(err.code !== undefined && { code: err.code }),
            };
          }

          const entry = await buildLogEntry(effectivePath, status, {
            userId: user?.id ?? null,
            request: ctx.request,
            headers: ctx.headers,
            metadata,
            pathConfig,
            options: opts,
            authOptions: ctx.context.options,
          });

          await writeEntry(ctx, entry, opts, modelName);
        } catch (err) {
          ctx.context.logger.error("[audit-log] after hook failed", err);
        }
      }),
    },
  ];
}
