export const OPEN_REASONING_LEVEL_SELECTOR_EVENT =
  "redux-chat:open-reasoning-level-selector";

export interface ReasoningLevelSelectorRequestDetail {
  open?: boolean;
  toggle?: boolean;
}

function requestReasoningLevelSelector(
  detail: ReasoningLevelSelectorRequestDetail,
) {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(
    new CustomEvent(OPEN_REASONING_LEVEL_SELECTOR_EVENT, { detail }),
  );
}

export function requestOpenReasoningLevelSelector() {
  requestReasoningLevelSelector({ open: true });
}

export function requestCloseReasoningLevelSelector() {
  requestReasoningLevelSelector({ open: false });
}

export function requestToggleReasoningLevelSelector() {
  requestReasoningLevelSelector({ toggle: true });
}
