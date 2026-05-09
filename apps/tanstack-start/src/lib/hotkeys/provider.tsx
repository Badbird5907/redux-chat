import type { AppHotkeyBinding, AppHotkeyId } from "@/lib/hotkeys/registry";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useSyncExternalStore,
} from "react";
import { validateHotkey } from "@tanstack/react-hotkeys";

import {
  appHotkeyIds,
  getAppHotkeyDefinition,
  getDefaultHotkeyBindings,
} from "@/lib/hotkeys/registry";

const HOTKEY_STORAGE_KEY = "redux-chat:hotkeys";
const DEFAULT_BINDINGS = getDefaultHotkeyBindings();
const EMPTY_OVERRIDES: AppHotkeyOverrides = {};
const hotkeyOverrideListeners = new Set<() => void>();
let hotkeyOverrideSnapshot = EMPTY_OVERRIDES;

type AppHotkeyOverrides = Partial<Record<AppHotkeyId, AppHotkeyBinding>>;

interface HotkeySettingsContextValue {
  bindings: Record<AppHotkeyId, AppHotkeyBinding>;
  setBinding: (id: AppHotkeyId, binding: AppHotkeyBinding) => void;
  resetBinding: (id: AppHotkeyId) => void;
  resetAll: () => void;
  isCustomized: (id: AppHotkeyId) => boolean;
}

const HotkeySettingsContext = createContext<HotkeySettingsContextValue | null>(
  null,
);

function sanitizeHotkeyOverrides(value: unknown): AppHotkeyOverrides {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const sanitized: AppHotkeyOverrides = {};

  for (const [rawId, rawBinding] of Object.entries(value)) {
    if (!appHotkeyIds.includes(rawId as AppHotkeyId)) {
      continue;
    }

    if (typeof rawBinding !== "string") {
      continue;
    }

    const result = validateHotkey(rawBinding);
    if (!result.valid) {
      continue;
    }

    const id = rawId as AppHotkeyId;
    if (rawBinding === getAppHotkeyDefinition(id).defaultHotkey) {
      continue;
    }

    sanitized[id] = rawBinding as AppHotkeyBinding;
  }

  return sanitized;
}

function readStoredHotkeyOverrides(): AppHotkeyOverrides {
  if (typeof window === "undefined") {
    return {};
  }

  const raw = window.localStorage.getItem(HOTKEY_STORAGE_KEY);
  if (!raw) {
    return {};
  }

  try {
    return sanitizeHotkeyOverrides(JSON.parse(raw));
  } catch {
    return {};
  }
}

function persistHotkeyOverrides(overrides: AppHotkeyOverrides) {
  if (typeof window === "undefined") {
    return;
  }

  if (Object.keys(overrides).length === 0) {
    window.localStorage.removeItem(HOTKEY_STORAGE_KEY);
    return;
  }

  window.localStorage.setItem(HOTKEY_STORAGE_KEY, JSON.stringify(overrides));
}

function emitHotkeyOverrideChange() {
  hotkeyOverrideListeners.forEach((listener) => listener());
}

function syncHotkeyOverrideSnapshot() {
  hotkeyOverrideSnapshot = readStoredHotkeyOverrides();
}

function getHotkeyOverrideSnapshot() {
  return hotkeyOverrideSnapshot;
}

function subscribeToHotkeyOverrides(listener: () => void) {
  hotkeyOverrideListeners.add(listener);

  if (typeof window === "undefined") {
    return () => {
      hotkeyOverrideListeners.delete(listener);
    };
  }

  const handleStorage = (event: StorageEvent) => {
    if (event.key !== HOTKEY_STORAGE_KEY) {
      return;
    }

    syncHotkeyOverrideSnapshot();
    listener();
  };

  window.addEventListener("storage", handleStorage);

  return () => {
    hotkeyOverrideListeners.delete(listener);
    window.removeEventListener("storage", handleStorage);
  };
}

function resolveHotkeyBindings(overrides: AppHotkeyOverrides) {
  return {
    ...DEFAULT_BINDINGS,
    ...overrides,
  };
}

export function HotkeySettingsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  if (typeof window !== "undefined" && hotkeyOverrideListeners.size === 0) {
    syncHotkeyOverrideSnapshot();
  }

  const overrides = useSyncExternalStore(
    subscribeToHotkeyOverrides,
    getHotkeyOverrideSnapshot,
    () => EMPTY_OVERRIDES,
  );

  const bindings = useMemo(() => resolveHotkeyBindings(overrides), [overrides]);

  const setBinding = useCallback(
    (id: AppHotkeyId, binding: AppHotkeyBinding) => {
      const result = validateHotkey(binding);
      if (!result.valid) {
        return;
      }

      const next = { ...readStoredHotkeyOverrides() };

      if (binding === getAppHotkeyDefinition(id).defaultHotkey) {
        delete next[id];
      } else {
        next[id] = binding;
      }

      persistHotkeyOverrides(next);
      hotkeyOverrideSnapshot = next;
      emitHotkeyOverrideChange();
    },
    [],
  );

  const resetBinding = useCallback((id: AppHotkeyId) => {
    const next = { ...readStoredHotkeyOverrides() };
    if (!(id in next)) {
      return;
    }

    delete next[id];
    persistHotkeyOverrides(next);
    hotkeyOverrideSnapshot = next;
    emitHotkeyOverrideChange();
  }, []);

  const resetAll = useCallback(() => {
    persistHotkeyOverrides({});
    hotkeyOverrideSnapshot = EMPTY_OVERRIDES;
    emitHotkeyOverrideChange();
  }, []);

  const isCustomized = useCallback(
    (id: AppHotkeyId) => overrides[id] !== undefined,
    [overrides],
  );

  const value = useMemo<HotkeySettingsContextValue>(
    () => ({
      bindings,
      setBinding,
      resetBinding,
      resetAll,
      isCustomized,
    }),
    [bindings, isCustomized, resetAll, resetBinding, setBinding],
  );

  return (
    <HotkeySettingsContext.Provider value={value}>
      {children}
    </HotkeySettingsContext.Provider>
  );
}

export function useHotkeySettings() {
  const context = useContext(HotkeySettingsContext);

  if (!context) {
    throw new Error(
      "useHotkeySettings must be used within HotkeySettingsProvider.",
    );
  }

  return context;
}

export function useResolvedHotkey(id: AppHotkeyId) {
  return useHotkeySettings().bindings[id] as AppHotkeyBinding;
}
