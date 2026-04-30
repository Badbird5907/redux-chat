export const OPEN_MODEL_SELECTOR_EVENT = "redux-chat:open-model-selector";

export function requestOpenModelSelector() {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new CustomEvent(OPEN_MODEL_SELECTOR_EVENT));
}
