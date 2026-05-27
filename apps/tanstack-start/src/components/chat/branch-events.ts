export const JUMP_TO_THREAD_BRANCH_EVENT = "redux-chat:jump-to-thread-branch";
export const UPDATE_SHARE_TO_CURRENT_BRANCH_EVENT =
  "redux-chat:update-share-to-current-branch";

export function jumpToThreadBranch(detail: {
  leafMessageId: string;
  threadId: string;
}) {
  window.dispatchEvent(
    new CustomEvent(JUMP_TO_THREAD_BRANCH_EVENT, { detail }),
  );
}

export function updateShareToCurrentBranch(detail: {
  onError?: (error: unknown) => void;
  onSuccess?: () => void;
  shareId: string;
  threadId: string;
}) {
  window.dispatchEvent(
    new CustomEvent(UPDATE_SHARE_TO_CURRENT_BRANCH_EVENT, { detail }),
  );
}
