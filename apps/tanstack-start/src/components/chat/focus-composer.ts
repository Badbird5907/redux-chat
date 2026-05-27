export const FOCUS_COMPOSER_EVENT = "redux-chat:focus-composer";

export function requestFocusComposer() {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new CustomEvent(FOCUS_COMPOSER_EVENT));
}
