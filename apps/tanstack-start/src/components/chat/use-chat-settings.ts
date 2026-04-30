"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useConvex, useMutation } from "convex/react";

import type {
  MessageSettings,
  MessageSettingsInput,
  MessageSettingsPatch,
} from "@redux/types";
import { api } from "@redux/backend/convex/_generated/api";
import {
  DEFAULT_MESSAGE_SETTINGS,
  mergeMessageSettings,
  normalizeMessageSettings,
} from "@redux/types";

import { authClient } from "@/lib/auth/client";

export function useChatSettings(
  threadId?: string,
  initialSettings?: MessageSettingsInput | null,
) {
  const convex = useConvex();
  const { data: session, isPending } = authClient.useSession();
  const getDefaultSettings = useMutation(
    api.functions.defaultMessageSettings.getOrCreate,
  );
  const updateDefaultSettings = useMutation(
    api.functions.defaultMessageSettings.update,
  );
  const updateThreadSettings = useMutation(
    api.functions.threads.updateThreadSettings,
  );
  const scopeKey = useMemo(
    () => (threadId ? `thread:${threadId}` : "home"),
    [threadId],
  );
  const normalizedInitialSettings = useMemo(
    () => normalizeMessageSettings(initialSettings),
    [initialSettings],
  );

  const [settings, setSettings] = useState<MessageSettings>(
    normalizedInitialSettings,
  );
  const [baselineSettings, setBaselineSettings] = useState<MessageSettings>(
    normalizedInitialSettings,
  );
  const [isReady, setIsReady] = useState(() => initialSettings !== undefined);

  useEffect(() => {
    let cancelled = false;

    async function loadSettings() {
      if (!cancelled) {
        setSettings(normalizedInitialSettings);
        setBaselineSettings(normalizedInitialSettings);
        setIsReady(initialSettings !== undefined);
      }

      if (isPending) {
        return;
      }

      setIsReady(false);

      if (!session?.session.userId) {
        if (!cancelled) {
          setSettings(DEFAULT_MESSAGE_SETTINGS);
          setBaselineSettings(DEFAULT_MESSAGE_SETTINGS);
          setIsReady(true);
        }
        return;
      }

      try {
        const nextSettings = threadId
          ? normalizeMessageSettings(
              (
                await convex.query(api.functions.threads.getThread, {
                  threadId,
                })
              )?.settings,
            )
          : normalizeMessageSettings(await getDefaultSettings({}));

        if (!cancelled) {
          setSettings(nextSettings);
          setBaselineSettings(nextSettings);
          setIsReady(true);
        }
      } catch (error) {
        console.error("Failed to load chat settings", error);
        if (!cancelled) {
          setSettings(DEFAULT_MESSAGE_SETTINGS);
          setBaselineSettings(DEFAULT_MESSAGE_SETTINGS);
          setIsReady(true);
        }
      }
    }

    void loadSettings();

    return () => {
      cancelled = true;
    };
  }, [
    convex,
    getDefaultSettings,
    initialSettings,
    isPending,
    normalizedInitialSettings,
    scopeKey,
    session?.session.userId,
    threadId,
  ]);

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

        setBaselineSettings(nextSettings);
      } catch (error) {
        console.error("Failed to persist chat settings", error);
      }

      return nextSettings;
    },
    [
      session?.session.userId,
      settings,
      threadId,
      updateDefaultSettings,
      updateThreadSettings,
    ],
  );

  const restoreSettings = useCallback((nextSettings: MessageSettings) => {
    setSettings(normalizeMessageSettings(nextSettings));
  }, []);

  return {
    settings,
    baselineSettings,
    isReady,
    setModel: (model: string) => updateSettings({ model }),
    restoreSettings,
    updateSettings,
  };
}
