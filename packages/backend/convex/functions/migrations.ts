import { v } from "convex/values";

import { backendMutation, backendQuery } from "./index";

export const getLegacyMessageSettingsCounts = backendQuery({
  args: {
    secret: v.string(),
  },
  handler: () => {
    return {
      threads: 0,
      defaultMessageSettings: 0,
      threadsWithLegacyToolsArray: 0,
      threadsWithDeprecatedTemperature: 0,
      defaultMessageSettingsWithLegacyToolsArray: 0,
      defaultMessageSettingsWithDeprecatedTemperature: 0,
    };
  },
});

export const backfillLegacyMessageSettingsTools = backendMutation({
  args: {
    secret: v.string(),
  },
  handler: () => {
    return {
      updatedThreads: 0,
      updatedDefaultMessageSettings: 0,
      completedAt: Date.now(),
    };
  },
});
