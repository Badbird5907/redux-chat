"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useConvexAuth, useMutation, useQuery } from "convex/react";

import { api } from "@redux/backend/convex/_generated/api";

import type {
  ChatScrollPreferences,
  ChatScrollPreferencesContextValue,
} from "./chat-scroll-store";
import {
  ChatScrollPreferencesContext,
  DEFAULT_CHAT_SCROLL_PREFERENCES,
  isDefaultPreferences,
  readCachedPreferences,
  sanitizePreferences,
  writeCachedPreferences,
} from "./chat-scroll-store";

export function ChatScrollPreferencesProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isAuthenticated, isLoading: isAuthLoading } = useConvexAuth();

  // Seed synchronously from the device-local cache so the very first render
  // already reflects the reader's last-known preferences (no scroll flash)
  // before Convex (the source of truth) resolves.
  const [cached] = useState(readCachedPreferences);
  // Used only when signed out, where there is no account to persist to.
  const [localPreferences, setLocalPreferences] =
    useState<ChatScrollPreferences | null>(null);

  const storedPreferences = useQuery(
    api.functions.chatScrollPreferences.get,
    isAuthenticated ? {} : "skip",
  );

  const updatePreference = useMutation(
    api.functions.chatScrollPreferences.update,
  ).withOptimisticUpdate((localStore, args) => {
    const current =
      localStore.getQuery(api.functions.chatScrollPreferences.get, {}) ??
      DEFAULT_CHAT_SCROLL_PREFERENCES;
    localStore.setQuery(
      api.functions.chatScrollPreferences.get,
      {},
      { ...current, ...args.patch },
    );
  });
  const resetPreferences = useMutation(
    api.functions.chatScrollPreferences.reset,
  ).withOptimisticUpdate((localStore) => {
    localStore.setQuery(api.functions.chatScrollPreferences.get, {}, null);
  });

  const preferences = useMemo<ChatScrollPreferences>(() => {
    if (isAuthenticated && storedPreferences !== undefined) {
      return storedPreferences === null
        ? DEFAULT_CHAT_SCROLL_PREFERENCES
        : sanitizePreferences(storedPreferences);
    }
    return localPreferences ?? cached;
  }, [isAuthenticated, storedPreferences, localPreferences, cached]);

  const isReady =
    !isAuthLoading && (!isAuthenticated || storedPreferences !== undefined);

  // Keep the first-paint cache in sync with the resolved preferences.
  useEffect(() => {
    writeCachedPreferences(preferences);
  }, [preferences]);

  const setPreference = useCallback<
    ChatScrollPreferencesContextValue["setPreference"]
  >(
    (key, value) => {
      const next = { ...preferences, [key]: value };

      if (isAuthenticated) {
        void updatePreference({ patch: next }).catch((error: unknown) => {
          console.error("Failed to persist chat scroll preference", error);
        });
      } else {
        setLocalPreferences(next);
      }
    },
    [isAuthenticated, preferences, updatePreference],
  );

  const resetAll = useCallback(() => {
    if (isAuthenticated) {
      void resetPreferences({}).catch((error: unknown) => {
        console.error("Failed to reset chat scroll preferences", error);
      });
    } else {
      setLocalPreferences(DEFAULT_CHAT_SCROLL_PREFERENCES);
    }
  }, [isAuthenticated, resetPreferences]);

  const value = useMemo<ChatScrollPreferencesContextValue>(
    () => ({
      preferences,
      setPreference,
      resetAll,
      isDefault: isDefaultPreferences(preferences),
      isReady,
    }),
    [preferences, setPreference, resetAll, isReady],
  );

  return (
    <ChatScrollPreferencesContext.Provider value={value}>
      {children}
    </ChatScrollPreferencesContext.Provider>
  );
}
