import * as React from "react";

const MOBILE_BREAKPOINT = 768;

export function useIsMobile() {
  const subscribe = React.useCallback((onStoreChange: () => void) => {
    if (typeof window === "undefined") {
      return () => undefined;
    }

    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    mql.addEventListener("change", onStoreChange);

    return () => mql.removeEventListener("change", onStoreChange);
  }, []);

  const getSnapshot = React.useCallback(() => {
    if (typeof window === "undefined") {
      return false;
    }

    return window.innerWidth < MOBILE_BREAKPOINT;
  }, []);

  return React.useSyncExternalStore(
    subscribe,
    getSnapshot,
    () => false,
  );
}
