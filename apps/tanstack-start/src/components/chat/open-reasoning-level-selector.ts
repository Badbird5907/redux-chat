export const OPEN_REASONING_LEVEL_SELECTOR_EVENT =
  "redux-chat:open-reasoning-level-selector";

export function requestOpenReasoningLevelSelector() {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new CustomEvent(OPEN_REASONING_LEVEL_SELECTOR_EVENT));
}
