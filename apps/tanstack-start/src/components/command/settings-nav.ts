export const COMMAND_THREAD_RESULT_LIMIT = 8;

export const SETTINGS_NAV_ITEMS = [
  {
    value: "settings-general",
    to: "/settings" as const,
    title: "General Settings",
    subtitle: "Preferences and global options",
    /** Lowercase keywords matched against the search query (see settingsNavMatches). */
    searchBlob: "general settings preferences",
  },
  {
    value: "settings-instructions",
    to: "/settings/instructions" as const,
    title: "Instructions",
    subtitle: "Manage reusable chat behavior presets",
    searchBlob: "instructions prompts styles presets system prompts",
  },
  {
    value: "settings-hotkeys",
    to: "/settings/hotkeys" as const,
    title: "Hotkeys",
    subtitle: "Customize keyboard shortcuts",
    searchBlob: "hotkeys keyboard shortcuts",
  },
];

export function settingsNavMatches(query: string, searchBlob: string) {
  if (!query.trim()) {
    return true;
  }
  const blob = searchBlob.toLowerCase();
  const segments = query
    .toLowerCase()
    .split(/[/\s]+/)
    .map((segment) => segment.trim())
    .filter(Boolean);
  if (segments.length === 0) {
    return true;
  }
  return segments.some((segment) => blob.includes(segment));
}
