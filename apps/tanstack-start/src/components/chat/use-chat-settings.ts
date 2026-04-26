"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation } from "convex/react";
import { useConvex } from "convex/react";

import {
  DEFAULT_MESSAGE_SETTINGS,
  mergeMessageSettings,
  normalizeMessageSettings
} from "@redux/types";
import type { MessageSettings, MessageSettingsPatch } from "@redux/types";
import { api } from "@redux/backend/convex/_generated/api";

import { authClient } from "@/lib/auth/client";

export function useChatSettings(threadId?: string) {
  const convex = useConvex();
  const { data: session } = authClient.useSession();
  const getDefaultSettings = useMutation(api.functions.defaultMessageSettings.getOrCreate);
  const updateDefaultSettings = useMutation(api.functions.defaultMessageSettings.update);
  const updateThreadSettings = useMutation(api.functions.threads.updateThreadSettings);
  const scopeKey = useMemo(() => (threadId ? `thread:${threadId}` : "home"), [threadId]);

  const [settings, setSettings] = useState<MessageSettings>(DEFAULT_MESSAGE_SETTINGS);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadSettings() {
      setIsReady(false);

      if (!session?.session.userId) {
        if (!cancelled) {
          setSettings(DEFAULT_MESSAGE_SETTINGS);
          setIsReady(true);
        }
        return;
      }

      try {
        const nextSettings = threadId
          ? normalizeMessageSettings(
              (await convex.query(api.functions.threads.getThread, { threadId }))?.settings,
            )
          : normalizeMessageSettings(await getDefaultSettings({}));

        if (!cancelled) {
          setSettings(nextSettings);
          setIsReady(true);
        }
      } catch (error) {
        console.error("Failed to load chat settings", error);
        if (!cancelled) {
          setSettings(DEFAULT_MESSAGE_SETTINGS);
          setIsReady(true);
        }
      }
    }

    void loadSettings();

    return () => {
      cancelled = true;
    };
  }, [convex, getDefaultSettings, scopeKey, session?.session.userId, threadId]);

  const updateSettings = useCallback(
    async (patch: MessageSettingsPatch) => {
      const nextSettings = mergeMessageSettings(settings, patch);
      setSettings(nextSettings);

      if (!session?.session.userId) {
        return nextSettings;
      }

      try {
        if (threadId) {
          await updateThreadSettings({
            threadId,
            patch,
          });
        } else {
          await updateDefaultSettings({
            patch,
          });
        }
      } catch (error) {
        console.error("Failed to persist chat settings", error);
      }

      return nextSettings;
    },
    [session?.session.userId, settings, threadId, updateDefaultSettings, updateThreadSettings],
  );

  return {
    settings,
    isReady,
    setModel: (model: string) => updateSettings({ model }),
    updateSettings,
  };
}
