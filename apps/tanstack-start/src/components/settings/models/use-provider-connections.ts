import type { FormEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import type { ByokProviderId } from "@redux/shared/models";

import type { PendingOpenRouterFlow } from "./openrouter-pending-flow";
import {
  getByokOAuthChannelName,
  getByokOAuthPendingStorageKey,
  getByokOAuthResultStorageKey,
} from "@/lib/byok-oauth-channel";
import { isPendingOpenRouterFlowSuperseded } from "./openrouter-pending-flow";
import { PROVIDERS } from "./provider-config";

export type ConnectionType = "api_key" | "chatgpt_oauth" | "openrouter_oauth";

export interface ProviderCredentialSummary {
  provider: ByokProviderId;
  displaySuffix: string;
  connectionType: ConnectionType;
  displayLabel?: string;
  availableModelIds?: readonly string[];
  supportsImageGeneration: boolean;
  updatedAt: number;
}

export interface DeviceFlow {
  flowId: string;
  userCode: string;
  verificationUrl: string;
  intervalMs: number;
  expiresAt: number;
}

type ProviderDraft = { apiKey: string; accountId: string };
type OAuthCompletionMessage = {
  type?: string;
  connector?: string;
  flowId?: string;
  success?: boolean;
};

const OPENROUTER_POPUP_CLOSE_GRACE_MS = 3000;

export function useProviderConnections(
  credentials: readonly ProviderCredentialSummary[],
) {
  const [drafts, setDrafts] = useState<
    Partial<Record<ByokProviderId, ProviderDraft>>
  >({});
  const [savingProvider, setSavingProvider] = useState<ByokProviderId | null>(
    null,
  );
  const [connectingConnector, setConnectingConnector] = useState<
    "chatgpt" | "openrouter" | null
  >(null);
  const [chatGptConsentOpen, setChatGptConsentOpen] = useState(false);
  const [deviceFlow, setDeviceFlow] = useState<DeviceFlow | null>(null);
  const [deviceError, setDeviceError] = useState<string | null>(null);
  const [pollRetry, setPollRetry] = useState(0);
  const [now, setNow] = useState(0);
  const [openRouterFlow, setOpenRouterFlow] =
    useState<PendingOpenRouterFlow | null>(null);
  const activeOpenRouterFlow = useRef<PendingOpenRouterFlow | null>(null);
  const openRouterPopupWatcher = useRef<number | null>(null);
  const openRouterCloseGrace = useRef<number | null>(null);
  const openRouterChannel = useRef<BroadcastChannel | null>(null);
  const credentialByProvider = useMemo(
    () =>
      new Map(
        credentials.map((credential) => [credential.provider, credential]),
      ),
    [credentials],
  );

  const clearOpenRouterTracking = useCallback(() => {
    if (openRouterPopupWatcher.current !== null) {
      window.clearInterval(openRouterPopupWatcher.current);
      openRouterPopupWatcher.current = null;
    }
    if (openRouterCloseGrace.current !== null) {
      window.clearTimeout(openRouterCloseGrace.current);
      openRouterCloseGrace.current = null;
    }
    openRouterChannel.current?.close();
    openRouterChannel.current = null;
  }, []);

  const updateOpenRouterFlow = useCallback(
    (flow: PendingOpenRouterFlow | null) => {
      activeOpenRouterFlow.current = flow;
      setOpenRouterFlow(flow);
      persistPendingOpenRouterFlow(flow);
    },
    [],
  );

  const handleOpenRouterCompletion = useCallback(
    (data: unknown, expectedFlowId?: string) => {
      const result = data as OAuthCompletionMessage | undefined;
      const flowId = result?.flowId ?? expectedFlowId;
      if (
        result?.type !== "byok-oauth-complete" ||
        result.connector !== "openrouter" ||
        !flowId ||
        (expectedFlowId !== undefined &&
          result.flowId !== undefined &&
          result.flowId !== expectedFlowId) ||
        activeOpenRouterFlow.current?.flowId !== flowId
      ) {
        return;
      }
      clearStoredOpenRouterResult(flowId);
      clearOpenRouterTracking();
      updateOpenRouterFlow(null);
      setConnectingConnector(null);
      if (result.success) toast.success("OpenRouter connected");
      else toast.error("OpenRouter connection failed");
    },
    [clearOpenRouterTracking, updateOpenRouterFlow],
  );

  useEffect(() => {
    if (!deviceFlow) return;
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [deviceFlow]);

  useEffect(() => {
    if (!deviceFlow) return;
    let timer: number | undefined;
    const abortController = new AbortController();
    const poll = async () => {
      if (abortController.signal.aborted) return;
      if (Date.now() >= deviceFlow.expiresAt) {
        setDeviceFlow(null);
        setDeviceError(null);
        setConnectingConnector(null);
        toast.error("The ChatGPT authorization code expired.");
        return;
      }
      try {
        const response = await fetch("/api/byok/oauth/chatgpt/poll", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ flowId: deviceFlow.flowId }),
          signal: abortController.signal,
        });
        abortController.signal.throwIfAborted();
        if (!response.ok) {
          throw new Error(
            await readErrorMessage(response, "ChatGPT connection failed."),
          );
        }
        const result = (await response.json().catch(() => undefined)) as
          | {
              status?: "pending" | "connected" | "expired";
              retryAfterMs?: number;
              expiresAt?: number;
            }
          | undefined;
        abortController.signal.throwIfAborted();
        if (!result?.status) {
          throw new Error("ChatGPT returned an invalid authorization status.");
        }
        if (result.status === "connected") {
          setDeviceFlow(null);
          setDeviceError(null);
          setConnectingConnector(null);
          toast.success("ChatGPT subscription connected");
          return;
        }
        if (result.status === "expired") {
          setDeviceFlow(null);
          setDeviceError(null);
          setConnectingConnector(null);
          toast.error("The ChatGPT authorization code expired.");
          return;
        }
        if (
          typeof result.retryAfterMs !== "number" ||
          typeof result.expiresAt !== "number"
        ) {
          throw new Error("ChatGPT returned an invalid authorization status.");
        }
        const { expiresAt, retryAfterMs } = result;
        setDeviceFlow((current) => {
          if (
            current?.flowId !== deviceFlow.flowId ||
            (current.intervalMs === retryAfterMs &&
              current.expiresAt === expiresAt)
          ) {
            return current;
          }
          return {
            ...current,
            intervalMs: retryAfterMs,
            expiresAt,
          };
        });
        setDeviceError(null);
        timer = window.setTimeout(() => void poll(), retryAfterMs);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError")
          return;
        const message =
          error instanceof Error ? error.message : "ChatGPT connection failed";
        setDeviceError(message);
        timer = window.setTimeout(() => void poll(), deviceFlow.intervalMs);
      }
    };
    timer = window.setTimeout(() => void poll(), deviceFlow.intervalMs);
    return () => {
      abortController.abort();
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [deviceFlow, pollRetry]);

  useEffect(() => {
    const restoreTimer = window.setTimeout(() => {
      const pending = readPendingOpenRouterFlow();
      if (!pending) return;
      if (pending.expiresAt <= Date.now()) {
        persistPendingOpenRouterFlow(null);
        clearStoredOpenRouterResult(pending.flowId);
        return;
      }
      activeOpenRouterFlow.current = pending;
      setOpenRouterFlow(pending);
    }, 0);
    return () => window.clearTimeout(restoreTimer);
  }, []);

  useEffect(() => {
    if (!openRouterFlow) return;
    const credential = credentialByProvider.get("openrouter");
    if (!isPendingOpenRouterFlowSuperseded(openRouterFlow, credential)) return;

    const { flowId } = openRouterFlow;
    const reconcileTimer = window.setTimeout(() => {
      if (activeOpenRouterFlow.current?.flowId !== flowId) return;
      clearStoredOpenRouterResult(flowId);
      clearOpenRouterTracking();
      updateOpenRouterFlow(null);
      setConnectingConnector(null);
    }, 0);
    return () => window.clearTimeout(reconcileTimer);
  }, [
    clearOpenRouterTracking,
    credentialByProvider,
    openRouterFlow,
    updateOpenRouterFlow,
  ]);

  useEffect(() => {
    if (!openRouterFlow) return;
    const { expiresAt, flowId } = openRouterFlow;
    const channel = new BroadcastChannel(
      getByokOAuthChannelName("openrouter", flowId),
    );
    channel.onmessage = (event: MessageEvent<unknown>) => {
      handleOpenRouterCompletion(event.data, flowId);
    };
    openRouterChannel.current = channel;
    const storageKey = getByokOAuthResultStorageKey("openrouter", flowId);
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== storageKey || !event.newValue) return;
      handleOpenRouterCompletion(parseStoredJson(event.newValue), flowId);
    };
    window.addEventListener("storage", handleStorage);
    const reconcileTimer = window.setTimeout(() => {
      const storedResult = readStoredOpenRouterResult(flowId);
      if (storedResult) {
        handleOpenRouterCompletion(storedResult, flowId);
      }
    }, 0);
    const expiryTimer = window.setTimeout(
      () => {
        if (activeOpenRouterFlow.current?.flowId !== flowId) return;
        clearStoredOpenRouterResult(flowId);
        clearOpenRouterTracking();
        updateOpenRouterFlow(null);
        setConnectingConnector(null);
        toast.error("The OpenRouter authorization expired.");
      },
      Math.max(0, expiresAt - Date.now()),
    );
    return () => {
      window.removeEventListener("storage", handleStorage);
      window.clearTimeout(reconcileTimer);
      window.clearTimeout(expiryTimer);
      if (openRouterChannel.current === channel) {
        openRouterChannel.current = null;
      }
      channel.close();
    };
  }, [
    clearOpenRouterTracking,
    handleOpenRouterCompletion,
    openRouterFlow,
    updateOpenRouterFlow,
  ]);

  useEffect(() => {
    const handler = (event: MessageEvent<unknown>) => {
      if (event.origin !== window.location.origin) return;
      handleOpenRouterCompletion(event.data);
    };
    window.addEventListener("message", handler);
    return () => {
      window.removeEventListener("message", handler);
      clearOpenRouterTracking();
    };
  }, [clearOpenRouterTracking, handleOpenRouterCompletion]);

  const saveCredential = async (provider: ByokProviderId, event: FormEvent) => {
    event.preventDefault();
    const draft = drafts[provider];
    if (!draft?.apiKey.trim()) return;
    const existing = credentialByProvider.get(provider);
    if (
      existing &&
      !window.confirm(
        `Replace the current ${PROVIDERS[provider].label} connection with this API key?`,
      )
    ) {
      return;
    }
    setSavingProvider(provider);
    try {
      const response = await fetch(`/api/byok/credentials/${provider}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiKey: draft.apiKey,
          ...(PROVIDERS[provider].accountId
            ? { accountId: draft.accountId }
            : {}),
        }),
      });
      if (!response.ok) throw new Error("Could not save provider credentials.");
      setDrafts((current) => ({
        ...current,
        [provider]: { apiKey: "", accountId: "" },
      }));
      toast.success(`${PROVIDERS[provider].label} API key saved`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Save failed");
    } finally {
      setSavingProvider(null);
    }
  };

  const deleteCredential = async (provider: ByokProviderId) => {
    if (
      !window.confirm(
        credentialByProvider.get(provider)?.connectionType ===
          "openrouter_oauth"
          ? "Remove the OpenRouter connection from Redux Chat? The generated key will remain active in OpenRouter until you revoke it there."
          : `Remove the ${PROVIDERS[provider].label} connection?`,
      )
    ) {
      return;
    }
    setSavingProvider(provider);
    try {
      const response = await fetch(`/api/byok/credentials/${provider}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        throw new Error("Could not remove provider credentials.");
      }
      toast.success(`${PROVIDERS[provider].label} connection removed`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Remove failed");
    } finally {
      setSavingProvider(null);
    }
  };

  const startChatGpt = async () => {
    const existing = credentialByProvider.get("openai");
    if (
      existing &&
      !window.confirm(
        "Connecting ChatGPT will replace the current OpenAI connection. Continue?",
      )
    ) {
      return;
    }
    const popup = window.open(
      "about:blank",
      "byok-chatgpt-oauth",
      "width=600,height=720,popup=yes",
    );
    if (!popup) {
      toast.error("Please allow popups to connect ChatGPT.");
      return;
    }
    popup.opener = null;
    setChatGptConsentOpen(false);
    setConnectingConnector("chatgpt");
    setDeviceError(null);
    try {
      const response = await fetch("/api/byok/oauth/chatgpt/start", {
        method: "POST",
      });
      if (!response.ok) {
        throw new Error(
          await readErrorMessage(
            response,
            "Could not start ChatGPT authorization.",
          ),
        );
      }
      const result = (await response.json().catch(() => undefined)) as
        | ({ mode?: "device" } & Partial<DeviceFlow>)
        | undefined;
      if (
        result?.mode !== "device" ||
        !result.flowId ||
        !result.userCode ||
        !result.verificationUrl ||
        typeof result.intervalMs !== "number" ||
        typeof result.expiresAt !== "number"
      ) {
        throw new Error("ChatGPT returned an invalid authorization response.");
      }
      const flow: DeviceFlow = {
        flowId: result.flowId,
        userCode: result.userCode,
        verificationUrl: result.verificationUrl,
        intervalMs: result.intervalMs,
        expiresAt: result.expiresAt,
      };
      setNow(Date.now());
      setDeviceFlow(flow);
      popup.location.href = flow.verificationUrl;
    } catch (error) {
      popup.close();
      setConnectingConnector(null);
      toast.error(error instanceof Error ? error.message : "Connection failed");
    }
  };

  const startOpenRouter = async () => {
    const pendingFlow =
      activeOpenRouterFlow.current ?? readPendingOpenRouterFlow();
    if (pendingFlow) {
      if (pendingFlow.expiresAt > Date.now()) {
        activeOpenRouterFlow.current = pendingFlow;
        setOpenRouterFlow(pendingFlow);
        toast.info("OpenRouter authorization is already in progress.");
        return;
      }
      clearStoredOpenRouterResult(pendingFlow.flowId);
      updateOpenRouterFlow(null);
    }
    const existing = credentialByProvider.get("openrouter");
    if (
      existing &&
      !window.confirm(
        "Connecting OpenRouter will replace the current OpenRouter API key. Continue?",
      )
    ) {
      return;
    }
    const popup = window.open(
      "about:blank",
      "byok-openrouter-oauth",
      "width=600,height=720,popup=yes",
    );
    if (!popup) {
      toast.error("Please allow popups to connect OpenRouter.");
      return;
    }
    popup.opener = null;
    clearOpenRouterTracking();
    updateOpenRouterFlow(null);
    setConnectingConnector("openrouter");
    try {
      const response = await fetch("/api/byok/oauth/openrouter/start", {
        method: "POST",
      });
      if (!response.ok) {
        throw new Error(
          await readErrorMessage(
            response,
            "Could not start OpenRouter authorization.",
          ),
        );
      }
      const result = (await response.json().catch(() => undefined)) as
        | {
            mode?: "redirect";
            flowId?: string;
            authorizationUrl?: string;
            expiresAt?: number;
          }
        | undefined;
      if (
        result?.mode !== "redirect" ||
        !result.flowId ||
        !result.authorizationUrl ||
        typeof result.expiresAt !== "number"
      ) {
        throw new Error(
          "OpenRouter returned an invalid authorization response.",
        );
      }
      const flow: PendingOpenRouterFlow = {
        flowId: result.flowId,
        expiresAt: result.expiresAt,
        previousCredentialUpdatedAt: existing?.updatedAt ?? null,
      };
      updateOpenRouterFlow(flow);
      popup.location.href = result.authorizationUrl;
      const interval = window.setInterval(() => {
        if (popup.closed) {
          window.clearInterval(interval);
          if (openRouterPopupWatcher.current === interval) {
            openRouterPopupWatcher.current = null;
          }
          const storedResult = readStoredOpenRouterResult(flow.flowId);
          if (storedResult) {
            handleOpenRouterCompletion(storedResult, flow.flowId);
            return;
          }
          openRouterCloseGrace.current = window.setTimeout(() => {
            if (activeOpenRouterFlow.current?.flowId !== flow.flowId) return;
            const delayedResult = readStoredOpenRouterResult(flow.flowId);
            if (delayedResult) {
              handleOpenRouterCompletion(delayedResult, flow.flowId);
              return;
            }
            clearOpenRouterTracking();
            clearStoredOpenRouterResult(flow.flowId);
            updateOpenRouterFlow(null);
            setConnectingConnector(null);
            toast.error(
              "The OpenRouter authorization window closed before completion.",
            );
          }, OPENROUTER_POPUP_CLOSE_GRACE_MS);
        }
      }, 500);
      openRouterPopupWatcher.current = interval;
    } catch (error) {
      clearOpenRouterTracking();
      updateOpenRouterFlow(null);
      popup.close();
      setConnectingConnector(null);
      toast.error(error instanceof Error ? error.message : "Connection failed");
    }
  };

  const refreshChatGpt = async () => {
    setConnectingConnector("chatgpt");
    try {
      const response = await fetch("/api/byok/oauth/chatgpt/refresh", {
        method: "POST",
      });
      if (!response.ok) {
        throw new Error(
          await readErrorMessage(response, "Could not refresh ChatGPT models."),
        );
      }
      const result = (await response.json().catch(() => undefined)) as
        | { modelCount?: number }
        | undefined;
      toast.success(
        `ChatGPT models refreshed${result?.modelCount ? ` (${result.modelCount})` : ""}`,
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Refresh failed");
    } finally {
      setConnectingConnector(null);
    }
  };

  return {
    chatGptConsentOpen,
    connectingConnector,
    credentialByProvider,
    deleteCredential,
    deviceError,
    deviceFlow,
    drafts,
    openRouterConnecting:
      connectingConnector === "openrouter" || openRouterFlow !== null,
    refreshChatGpt,
    saveCredential,
    savingProvider,
    secondsRemaining: deviceFlow
      ? Math.max(0, Math.ceil((deviceFlow.expiresAt - now) / 1000))
      : 0,
    setChatGptConsentOpen,
    setConnectingConnector,
    setDeviceError,
    setDeviceFlow,
    setDrafts,
    setPollRetry,
    startChatGpt,
    startOpenRouter,
  };
}

async function readErrorMessage(
  response: Response,
  fallback: string,
): Promise<string> {
  const value = (await response.json().catch(() => undefined)) as
    | { message?: unknown }
    | undefined;
  return typeof value?.message === "string" ? value.message : fallback;
}

function persistPendingOpenRouterFlow(
  flow: PendingOpenRouterFlow | null,
): void {
  try {
    const key = getByokOAuthPendingStorageKey("openrouter");
    if (flow) sessionStorage.setItem(key, JSON.stringify(flow));
    else sessionStorage.removeItem(key);
  } catch {
    // Storage may be disabled; the in-memory flow still handles this page.
  }
}

function readPendingOpenRouterFlow(): PendingOpenRouterFlow | undefined {
  try {
    const value = parseStoredJson(
      sessionStorage.getItem(getByokOAuthPendingStorageKey("openrouter")),
    ) as Partial<PendingOpenRouterFlow> | undefined;
    if (
      typeof value?.flowId === "string" &&
      typeof value.expiresAt === "number" &&
      Number.isFinite(value.expiresAt) &&
      (value.previousCredentialUpdatedAt === undefined ||
        value.previousCredentialUpdatedAt === null ||
        (typeof value.previousCredentialUpdatedAt === "number" &&
          Number.isFinite(value.previousCredentialUpdatedAt)))
    ) {
      return {
        flowId: value.flowId,
        expiresAt: value.expiresAt,
        ...(value.previousCredentialUpdatedAt !== undefined
          ? {
              previousCredentialUpdatedAt: value.previousCredentialUpdatedAt,
            }
          : {}),
      };
    }
  } catch {
    // Storage may be disabled or contain an invalid value.
  }
  return undefined;
}

function readStoredOpenRouterResult(flowId: string): unknown {
  try {
    return parseStoredJson(
      localStorage.getItem(getByokOAuthResultStorageKey("openrouter", flowId)),
    );
  } catch {
    return undefined;
  }
}

function clearStoredOpenRouterResult(flowId: string): void {
  try {
    localStorage.removeItem(getByokOAuthResultStorageKey("openrouter", flowId));
  } catch {
    // Storage may be disabled.
  }
}

function parseStoredJson(value: string | null): unknown {
  if (!value) return undefined;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
}
