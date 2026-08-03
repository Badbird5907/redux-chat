import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import type { ByokProviderId } from "@redux/shared/models";

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
  const credentialByProvider = useMemo(
    () =>
      new Map(
        credentials.map((credential) => [credential.provider, credential]),
      ),
    [credentials],
  );

  useEffect(() => {
    if (!deviceFlow) return;
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [deviceFlow]);

  useEffect(() => {
    if (!deviceFlow) return;
    let cancelled = false;
    let timer: number | undefined;
    const poll = async () => {
      if (cancelled) return;
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
        });
        if (!response.ok) {
          throw new Error(
            await readErrorMessage(response, "ChatGPT connection failed."),
          );
        }
        const result = (await response.json().catch(() => undefined)) as
          | {
              status?: "pending" | "connected" | "expired";
              retryAfterMs?: number;
            }
          | undefined;
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
        setDeviceError(null);
        timer = window.setTimeout(
          () => void poll(),
          result.retryAfterMs ?? deviceFlow.intervalMs,
        );
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "ChatGPT connection failed";
        setDeviceError(message);
        timer = window.setTimeout(() => void poll(), deviceFlow.intervalMs);
      }
    };
    timer = window.setTimeout(() => void poll(), deviceFlow.intervalMs);
    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [deviceFlow, pollRetry]);

  useEffect(() => {
    const handler = (event: MessageEvent<unknown>) => {
      if (event.origin !== window.location.origin) return;
      const data = event.data as
        | { type?: string; connector?: string; success?: boolean }
        | undefined;
      if (
        data?.type !== "byok-oauth-complete" ||
        data.connector !== "openrouter"
      ) {
        return;
      }
      setConnectingConnector(null);
      if (data.success) toast.success("OpenRouter connected");
      else toast.error("OpenRouter connection failed");
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

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
        | { mode?: "redirect"; authorizationUrl?: string }
        | undefined;
      if (result?.mode !== "redirect" || !result.authorizationUrl) {
        throw new Error(
          "OpenRouter returned an invalid authorization response.",
        );
      }
      popup.location.href = result.authorizationUrl;
      const interval = window.setInterval(() => {
        if (popup.closed) {
          window.clearInterval(interval);
          setConnectingConnector(null);
        }
      }, 500);
    } catch (error) {
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
