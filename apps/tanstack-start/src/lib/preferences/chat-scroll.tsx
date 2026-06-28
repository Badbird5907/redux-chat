"use client";

import { useMemo, useSyncExternalStore } from "react";

import type { ChatScrollPreferencesContextValue } from "./chat-scroll-store";
import {
  ChatScrollPreferencesContext,
  ensurePreferenceSnapshotInitialized,
  getPreferenceSnapshot,
  getServerPreferenceSnapshot,
  isDefaultPreferences,
  resetPreferences,
  setPreferenceValue,
  subscribeToPreferences,
} from "./chat-scroll-store";

export function ChatScrollPreferencesProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  ensurePreferenceSnapshotInitialized();

  const preferences = useSyncExternalStore(
    subscribeToPreferences,
    getPreferenceSnapshot,
    getServerPreferenceSnapshot,
  );

  const value = useMemo<ChatScrollPreferencesContextValue>(
    () => ({
      preferences,
      setPreference: setPreferenceValue,
      resetAll: resetPreferences,
      isDefault: isDefaultPreferences(preferences),
    }),
    [preferences],
  );

  return (
    <ChatScrollPreferencesContext.Provider value={value}>
      {children}
    </ChatScrollPreferencesContext.Provider>
  );
}
