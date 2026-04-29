import type { AppHotkeyId } from "@/lib/hotkeys/registry";
import type { HotkeyCallback, UseHotkeyOptions } from "@tanstack/react-hotkeys";
import { useHotkey } from "@tanstack/react-hotkeys";

import { useResolvedHotkey } from "@/lib/hotkeys/provider";
import { appHotkeyRegistry } from "@/lib/hotkeys/registry";

export function useAppHotkey(
  id: AppHotkeyId,
  callback: HotkeyCallback,
  optionOverrides: UseHotkeyOptions = {},
) {
  const definition = appHotkeyRegistry[id];
  const hotkey = useResolvedHotkey(id);

  const options: UseHotkeyOptions = {
    ...definition.options,
    ...optionOverrides,
    meta: {
      ...definition.options?.meta,
      name: definition.label,
      description: definition.description,
      ...optionOverrides.meta,
    },
  };

  useHotkey(hotkey, callback, options);
}
