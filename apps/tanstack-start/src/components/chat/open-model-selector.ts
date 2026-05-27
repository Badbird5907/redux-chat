export const OPEN_MODEL_SELECTOR_EVENT = "redux-chat:open-model-selector";

export interface ModelSelectorRequestDetail {
  open?: boolean;
  toggle?: boolean;
}

function requestModelSelector(detail: ModelSelectorRequestDetail) {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new CustomEvent(OPEN_MODEL_SELECTOR_EVENT, { detail }));
}

export function requestOpenModelSelector() {
  requestModelSelector({ open: true });
}

export function requestCloseModelSelector() {
  requestModelSelector({ open: false });
}

export function requestToggleModelSelector() {
  requestModelSelector({ toggle: true });
}
