export const RESET_CHAT_EVENT = "redux-chat:reset-chat";

let pendingAdoptedThreadId: string | undefined;

export function requestChatReset() {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new CustomEvent(RESET_CHAT_EVENT));
}

export function rememberAdoptedThreadNavigation(threadId: string) {
  pendingAdoptedThreadId = threadId;
}

export function consumeAdoptedThreadNavigation(threadId: string | undefined) {
  if (!threadId || pendingAdoptedThreadId !== threadId) {
    return false;
  }

  pendingAdoptedThreadId = undefined;
  return true;
}
