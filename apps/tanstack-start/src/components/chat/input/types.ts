import type { UIMessage } from "ai";

import type { MessageSettings, MessageSettingsPatch } from "@redux/types";

export interface ChatInputProps {
  threadId?: string;
  /**
   * When set, new threads created from this input are scoped to the given
   * project. Existing threads ignore this prop (project membership is fixed
   * at thread creation time).
   */
  chatProjectId?: string;
  setThreadId: (threadId: string) => void;
  sendMessage: (
    message: { text: string; id?: string; metadata?: Record<string, unknown> },
    options?: { body?: object },
  ) => void;
  setOptimisticMessage: (message: UIMessage | undefined) => void;
  messages: UIMessage[];
  status: "ready" | "streaming" | "submitted" | "error";
  clientId: string;
  convexMessages: UIMessage[];
  settings: MessageSettings;
  baselineSettings: MessageSettings;
  settingsReady: boolean;
  onModelChange: (modelId: string) => Promise<MessageSettings>;
  onSettingsChange: (patch: MessageSettingsPatch) => Promise<MessageSettings>;
  restoreSettings: (settings: MessageSettings) => void;
}

export interface PreviewableFile {
  generatingDerivative?: boolean;
  id: string;
  name: string;
  type: string;
  url?: string;
  usedDerivative?: boolean;
}
