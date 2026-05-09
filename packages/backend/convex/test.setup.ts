export const modules: Record<string, () => Promise<unknown>> = {
  "./functions/index.ts": () => import("./functions/index"),
  "./functions/defaultMessageSettings.ts": () =>
    import("./functions/defaultMessageSettings"),
  "./functions/instructions.ts": () => import("./functions/instructions"),
  "./functions/mcpServers.ts": () => import("./functions/mcpServers"),
  "./functions/migrations.ts": () => import("./functions/migrations"),
  "./functions/modelFavorites.ts": () => import("./functions/modelFavorites"),
  "./functions/projects.ts": () => import("./functions/projects"),
  "./functions/credits.ts": () => import("./functions/credits"),
  "./functions/internal.ts": () => import("./functions/internal"),
  "./functions/threads.ts": () => import("./functions/threads"),
  "./credits.ts": () => import("./credits"),
  "./usageStats.ts": () => import("./usageStats"),
  "./_generated/api.js": () => import("./_generated/api.js"),
  "./_generated/server.js": () => import("./_generated/server.js"),
};
