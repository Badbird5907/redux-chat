import type { MessageSettings } from "@redux/types";
import { getEnabledMessageTools } from "@redux/types";
import type { ToolSet } from "ai";
import { webSearch } from '@exalabs/ai-sdk';

export const getToolSet = (settings: MessageSettings): ToolSet => {
  const { tools } = settings;
  const enabledTools = getEnabledMessageTools(tools);

  const aiSdkTools: ToolSet = {}

  if (enabledTools.includes("search")) {
    aiSdkTools.search = webSearch();
  }

  return aiSdkTools;
};