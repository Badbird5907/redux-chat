export const modules: Record<string, () => Promise<unknown>> = {
  "./functions/index.ts": () => import("./functions/index"),
  "./functions/migrations.ts": () => import("./functions/migrations"),
  "./_generated/api.js": () => import("./_generated/api.js"),
  "./_generated/server.js": () => import("./_generated/server.js"),
};
