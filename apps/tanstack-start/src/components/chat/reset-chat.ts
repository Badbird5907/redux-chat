export const RESET_CHAT_EVENT = "redux-chat:reset-chat";

export function requestChatReset() {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new CustomEvent(RESET_CHAT_EVENT));
}
