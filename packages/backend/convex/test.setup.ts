export const modules: Record<string, () => Promise<unknown>> = {
  "./functions/index.ts": () => import("./functions/index"),
  "./functions/migrations.ts": () => import("./functions/migrations"),
  "./functions/credits.ts": () => import("./functions/credits"),
  "./functions/internal.ts": () => import("./functions/internal"),
  "./credits.ts": () => import("./credits"),
  "./_generated/api.js": () => import("./_generated/api.js"),
  "./_generated/server.js": () => import("./_generated/server.js"),
};
