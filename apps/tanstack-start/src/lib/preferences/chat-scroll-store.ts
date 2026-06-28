import { createContext, use } from "react";

/** Where a saved conversation lands when it is first opened. */
export type ChatOpenPosition = "last-anchor" | "end" | "start";

export interface ChatScrollPreferences {
  /** Follow streamed replies while the reader is at the bottom of the thread. */
  autoScroll: boolean;
  /** Scroll position a thread opens at. */
  openPosition: ChatOpenPosition;
  /** Keep a peek of the previous turn visible above a newly anchored message. */
  keepPreviousVisible: boolean;
}

/**
 * Pixels of the previous turn kept visible above a freshly anchored message
 * when {@link ChatScrollPreferences.keepPreviousVisible} is enabled.
 */
export const CHAT_SCROLL_PREVIOUS_ITEM_PEEK = 64;

export const DEFAULT_CHAT_SCROLL_PREFERENCES: ChatScrollPreferences = {
  autoScroll: true,
  openPosition: "last-anchor",
  keepPreviousVisible: true,
};

export const CHAT_OPEN_POSITION_OPTIONS: {
  value: ChatOpenPosition;
  label: string;
  description: string;
}[] = [
  {
    value: "last-anchor",
    label: "Your last message",
    description:
      "Open at your most recent message with its reply below, so you can pick up where you left off.",
  },
  {
    value: "end",
    label: "Latest reply",
    description: "Jump straight to the bottom of the conversation.",
  },
  {
    value: "start",
    label: "Beginning",
    description: "Start reading from the first message in the conversation.",
  },
];

export interface ChatScrollPreferencesContextValue {
  preferences: ChatScrollPreferences;
  setPreference: <Key extends keyof ChatScrollPreferences>(
    key: Key,
    value: ChatScrollPreferences[Key],
  ) => void;
  resetAll: () => void;
  isDefault: boolean;
}

export const ChatScrollPreferencesContext =
  createContext<ChatScrollPreferencesContextValue | null>(null);

const STORAGE_KEY = "redux-chat:chat-scroll-preferences:v1";
const OPEN_POSITION_VALUES = new Set<ChatOpenPosition>([
  "last-anchor",
  "end",
  "start",
]);

const preferenceListeners = new Set<() => void>();
let preferenceSnapshot = DEFAULT_CHAT_SCROLL_PREFERENCES;

function sanitizePreferences(value: unknown): ChatScrollPreferences {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    return DEFAULT_CHAT_SCROLL_PREFERENCES;
  }

  const record = value as Record<string, unknown>;
  const openPosition = record.openPosition;

  return {
    autoScroll:
      typeof record.autoScroll === "boolean"
        ? record.autoScroll
        : DEFAULT_CHAT_SCROLL_PREFERENCES.autoScroll,
    openPosition: OPEN_POSITION_VALUES.has(openPosition as ChatOpenPosition)
      ? (openPosition as ChatOpenPosition)
      : DEFAULT_CHAT_SCROLL_PREFERENCES.openPosition,
    keepPreviousVisible:
      typeof record.keepPreviousVisible === "boolean"
        ? record.keepPreviousVisible
        : DEFAULT_CHAT_SCROLL_PREFERENCES.keepPreviousVisible,
  };
}

export function isDefaultPreferences(preferences: ChatScrollPreferences) {
  return (
    preferences.autoScroll === DEFAULT_CHAT_SCROLL_PREFERENCES.autoScroll &&
    preferences.openPosition === DEFAULT_CHAT_SCROLL_PREFERENCES.openPosition &&
    preferences.keepPreviousVisible ===
      DEFAULT_CHAT_SCROLL_PREFERENCES.keepPreviousVisible
  );
}

function readStoredPreferences(): ChatScrollPreferences {
  if (typeof window === "undefined") {
    return DEFAULT_CHAT_SCROLL_PREFERENCES;
  }

  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return DEFAULT_CHAT_SCROLL_PREFERENCES;
  }

  try {
    return sanitizePreferences(JSON.parse(raw));
  } catch {
    return DEFAULT_CHAT_SCROLL_PREFERENCES;
  }
}

function persistPreferences(preferences: ChatScrollPreferences) {
  if (typeof window === "undefined") {
    return;
  }

  if (isDefaultPreferences(preferences)) {
    window.localStorage.removeItem(STORAGE_KEY);
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
}

function emitPreferenceChange() {
  preferenceListeners.forEach((listener) => listener());
}

function syncPreferenceSnapshot() {
  preferenceSnapshot = readStoredPreferences();
}

export function ensurePreferenceSnapshotInitialized() {
  if (typeof window !== "undefined" && preferenceListeners.size === 0) {
    syncPreferenceSnapshot();
  }
}

export function getPreferenceSnapshot() {
  return preferenceSnapshot;
}

export function getServerPreferenceSnapshot() {
  return DEFAULT_CHAT_SCROLL_PREFERENCES;
}

export function subscribeToPreferences(listener: () => void) {
  preferenceListeners.add(listener);

  if (typeof window === "undefined") {
    return () => {
      preferenceListeners.delete(listener);
    };
  }

  const handleStorage = (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY) {
      return;
    }

    syncPreferenceSnapshot();
    listener();
  };

  window.addEventListener("storage", handleStorage);

  return () => {
    preferenceListeners.delete(listener);
    window.removeEventListener("storage", handleStorage);
  };
}

export function setPreferenceValue<Key extends keyof ChatScrollPreferences>(
  key: Key,
  value: ChatScrollPreferences[Key],
) {
  const next = { ...readStoredPreferences(), [key]: value };
  persistPreferences(next);
  preferenceSnapshot = next;
  emitPreferenceChange();
}

export function resetPreferences() {
  persistPreferences(DEFAULT_CHAT_SCROLL_PREFERENCES);
  preferenceSnapshot = DEFAULT_CHAT_SCROLL_PREFERENCES;
  emitPreferenceChange();
}

export function useChatScrollPreferences() {
  const context = use(ChatScrollPreferencesContext);

  if (!context) {
    throw new Error(
      "useChatScrollPreferences must be used within ChatScrollPreferencesProvider.",
    );
  }

  return context;
}
