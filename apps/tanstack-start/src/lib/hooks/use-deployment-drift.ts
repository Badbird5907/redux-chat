import { useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";

const POLL_INTERVAL_MS = 60_000;
const DISMISS_DURATION_MS = 30 * 60 * 1000;
const STORAGE_KEY = "deployment-drift-dismissed-at";

interface DeploymentIdResponse {
  deploymentId: string | null;
}

function isDismissed(): boolean {
  try {
    const dismissedAt = localStorage.getItem(STORAGE_KEY);
    if (!dismissedAt) return false;
    return Date.now() - Number(dismissedAt) < DISMISS_DURATION_MS;
  } catch {
    return false;
  }
}

function setDismissed(): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(Date.now()));
  } catch {
    // noop
  }
}

export function useDeploymentDrift() {
  const initialDeploymentId = useRef<string | null | undefined>(undefined);
  const toastShown = useRef(false);

  const checkDeployment = useCallback(async () => {
    if (toastShown.current || isDismissed()) return;

    try {
      const response = await fetch("/api/deployment-id");
      if (!response.ok) return;
      const data = (await response.json()) as DeploymentIdResponse;
      const currentId = data.deploymentId;

      if (initialDeploymentId.current === undefined) {
        initialDeploymentId.current = currentId;
        return;
      }

      if (
        currentId &&
        initialDeploymentId.current &&
        currentId !== initialDeploymentId.current
      ) {
        toastShown.current = true;
        toast("Update available", {
          description: "Please refresh to continue with the latest version.",
          duration: Infinity,
          action: {
            label: "Refresh",
            onClick: () => window.location.reload(),
          }
        });
      }
    } catch {
      // network errors are expected when offline
    }
  }, []);

  useEffect(() => {
    void checkDeployment();
    const interval = setInterval(
      () => void checkDeployment(),
      POLL_INTERVAL_MS,
    );
    return () => clearInterval(interval);
  }, [checkDeployment]);
}
