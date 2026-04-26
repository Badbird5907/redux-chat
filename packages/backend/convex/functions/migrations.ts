import { v } from "convex/values";

import { normalizeMessageSettings } from "@redux/types";

import { backendMutation, backendQuery } from "./index";

function hasLegacyToolsShape(settings: { tools?: unknown } | null | undefined): boolean {
  return Array.isArray(settings?.tools);
}

function hasDeprecatedTemperatureField(
  settings: { temperature?: unknown } | null | undefined,
): boolean {
  return Object.prototype.hasOwnProperty.call(settings ?? {}, "temperature");
}

function hasLegacyMessageSettings(
  settings: { tools?: unknown; temperature?: unknown } | null | undefined,
): boolean {
  return hasLegacyToolsShape(settings) || hasDeprecatedTemperatureField(settings);
}

export const getLegacyMessageSettingsCounts = backendQuery({
  args: {
    secret: v.string(),
  },
  handler: async (ctx) => {
    const [threads, defaultSettings] = await Promise.all([
      ctx.db.query("threads").collect(),
      ctx.db.query("defaultMessageSettings").collect(),
    ]);

    return {
      threads: threads.filter((thread) => hasLegacyMessageSettings(thread.settings)).length,
      defaultMessageSettings: defaultSettings.filter((entry) =>
        hasLegacyMessageSettings(entry.settings),
      ).length,
      threadsWithLegacyToolsArray: threads.filter((thread) =>
        hasLegacyToolsShape(thread.settings),
      ).length,
      threadsWithDeprecatedTemperature: threads.filter((thread) =>
        hasDeprecatedTemperatureField(thread.settings),
      ).length,
      defaultMessageSettingsWithLegacyToolsArray: defaultSettings.filter((entry) =>
        hasLegacyToolsShape(entry.settings),
      ).length,
      defaultMessageSettingsWithDeprecatedTemperature: defaultSettings.filter((entry) =>
        hasDeprecatedTemperatureField(entry.settings),
      ).length,
    };
  },
});

export const backfillLegacyMessageSettingsTools = backendMutation({
  args: {
    secret: v.string(),
  },
  handler: async (ctx) => {
    const [threads, defaultSettings] = await Promise.all([
      ctx.db.query("threads").collect(),
      ctx.db.query("defaultMessageSettings").collect(),
    ]);

    let updatedThreads = 0;
    let updatedDefaultMessageSettings = 0;
    const now = Date.now();

    for (const thread of threads) {
      if (!hasLegacyMessageSettings(thread.settings)) {
        continue;
      }

      await ctx.db.patch(thread._id, {
        settings: normalizeMessageSettings(thread.settings),
        updatedAt: now,
      });
      updatedThreads += 1;
    }

    for (const entry of defaultSettings) {
      if (!hasLegacyMessageSettings(entry.settings)) {
        continue;
      }

      await ctx.db.patch(entry._id, {
        settings: normalizeMessageSettings(entry.settings),
        updatedAt: now,
      });
      updatedDefaultMessageSettings += 1;
    }

    return {
      updatedThreads,
      updatedDefaultMessageSettings,
      completedAt: now,
    };
  },
});
