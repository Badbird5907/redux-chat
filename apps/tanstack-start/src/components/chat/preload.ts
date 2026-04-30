import type { api } from "@redux/backend/convex/_generated/api";

export interface ChatThreadPreload {
  chatProjectId?: string;
  selectedLeafMessageId?: string;
  settingsJson?: string | null;
}

export interface ChatPreload {
  messages?: (typeof api.functions.threads.getThreadMessages)["_returnType"];
  thread?: ChatThreadPreload | null;
  settingsJson?: string | null;
}
