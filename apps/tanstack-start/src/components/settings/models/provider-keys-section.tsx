import {
  Check,
  ExternalLink,
  Link2,
  RefreshCw,
  ShieldCheck,
  Trash2,
} from "lucide-react";

import { BYOK_PROVIDER_IDS } from "@redux/shared/models";
import { Badge } from "@redux/ui/components/badge";
import { Button } from "@redux/ui/components/button";
import { Input } from "@redux/ui/components/input";
import { Label } from "@redux/ui/components/label";

import type {
  ConnectionType,
  ProviderCredentialSummary,
} from "./use-provider-connections";
import { ByokProviderIcon } from "./byok-provider-icon";
import {
  ChatGptConsentDialog,
  ChatGptDevicePanel,
} from "./chatgpt-connection-ui";
import { PROVIDERS } from "./provider-config";
import { UpgradeLockBadge } from "./upgrade-lock-badge";
import { useProviderConnections } from "./use-provider-connections";

const dateFormatter = new Intl.DateTimeFormat("en", {
  dateStyle: "medium",
  timeZone: "UTC",
});

export function ProviderKeysSection({
  entitled,
  credentials,
}: {
  entitled: boolean;
  credentials: readonly ProviderCredentialSummary[];
}) {
  const {
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
    secondsRemaining,
    setChatGptConsentOpen,
    setConnectingConnector,
    setDeviceError,
    setDeviceFlow,
    setDrafts,
    setPollRetry,
    startChatGpt,
    startOpenRouter,
  } = useProviderConnections(credentials);
  const connectedCount = credentialByProvider.size;

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold">Provider connections</h2>
            {entitled ? null : <UpgradeLockBadge />}
          </div>
          <p className="text-muted-foreground mt-1 flex items-center gap-1.5 text-sm">
            <ShieldCheck className="size-3.5 shrink-0" aria-hidden />
            Credentials are encrypted at rest and are never sent back to your
            browser.
          </p>
        </div>
        <span className="text-muted-foreground text-xs tabular-nums">
          {connectedCount} of {BYOK_PROVIDER_IDS.length} connected
        </span>
      </div>

      <div className="divide-border/60 divide-y overflow-hidden rounded-xl border">
        {BYOK_PROVIDER_IDS.map((provider) => {
          const metadata = PROVIDERS[provider];
          const credential = credentialByProvider.get(provider);
          const draft = drafts[provider] ?? { apiKey: "", accountId: "" };
          const busy = savingProvider === provider;
          const interactionLocked = busy || connectingConnector !== null;
          const canSubmit =
            entitled &&
            !interactionLocked &&
            draft.apiKey.trim().length > 0 &&
            (metadata.accountId !== true || draft.accountId.trim().length > 0);

          return (
            <div
              key={provider}
              className="flex flex-col gap-3 px-4 py-3.5 lg:flex-row lg:items-start lg:gap-5"
            >
              <div className="flex min-w-0 items-start gap-3 lg:w-72 lg:shrink-0">
                <ByokProviderIcon provider={provider} />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-sm font-medium">
                      {metadata.label}
                    </span>
                    {credential ? (
                      <Badge variant="outline" color="green">
                        <Check aria-hidden />
                        {connectionTypeLabel(credential.connectionType)} · ••••
                        {credential.displaySuffix}
                      </Badge>
                    ) : null}
                  </div>
                  <p className="text-muted-foreground mt-0.5 text-xs leading-relaxed">
                    {metadata.description}
                  </p>
                  <a
                    href={metadata.keyUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="text-muted-foreground hover:text-foreground mt-1 inline-flex items-center gap-1 text-xs underline-offset-2 hover:underline"
                  >
                    Get an API key
                    <ExternalLink className="size-3" aria-hidden />
                  </a>
                  {credential ? (
                    <div className="text-muted-foreground mt-1.5 space-y-0.5 text-xs">
                      {credential.displayLabel ? (
                        <p className="text-foreground truncate font-medium">
                          {credential.displayLabel}
                        </p>
                      ) : null}
                      <p>
                        Updated {dateFormatter.format(credential.updatedAt)}
                        {credential.connectionType === "chatgpt_oauth"
                          ? ` · ${credential.availableModelIds?.length ?? 0} models`
                          : ""}
                      </p>
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="flex min-w-0 flex-1 flex-col gap-3">
                {entitled && provider === "openai" ? (
                  <div className="space-y-2">
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={interactionLocked}
                        onClick={() => setChatGptConsentOpen(true)}
                      >
                        <Link2 />
                        {credential?.connectionType === "chatgpt_oauth"
                          ? "Reconnect ChatGPT"
                          : "Connect ChatGPT"}
                      </Button>
                      {credential?.connectionType === "chatgpt_oauth" ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          disabled={interactionLocked}
                          onClick={() => void refreshChatGpt()}
                        >
                          <RefreshCw /> Refresh models
                        </Button>
                      ) : null}
                    </div>
                    {deviceFlow ? (
                      <ChatGptDevicePanel
                        error={deviceError}
                        flow={deviceFlow}
                        secondsRemaining={secondsRemaining}
                        onCancel={() => {
                          setDeviceFlow(null);
                          setDeviceError(null);
                          setConnectingConnector(null);
                        }}
                        onRetry={() => {
                          setDeviceError(null);
                          setConnectingConnector("chatgpt");
                          setPollRetry((value) => value + 1);
                        }}
                      />
                    ) : null}
                  </div>
                ) : null}

                {entitled && provider === "openrouter" ? (
                  <div className="space-y-1.5">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={interactionLocked}
                      onClick={() => void startOpenRouter()}
                    >
                      <Link2 />
                      {connectingConnector === "openrouter"
                        ? "Connecting…"
                        : credential?.connectionType === "openrouter_oauth"
                          ? "Reconnect OpenRouter"
                          : "Connect OpenRouter"}
                    </Button>
                    <p className="text-muted-foreground text-xs">
                      OAuth creates a dedicated API key. Removing it here does
                      not revoke it in OpenRouter. Manage generated keys in{" "}
                      <a
                        className="underline underline-offset-2"
                        href="https://openrouter.ai/settings/keys"
                        target="_blank"
                        rel="noreferrer noopener"
                      >
                        OpenRouter key settings
                      </a>
                      .
                    </p>
                  </div>
                ) : null}

                <form
                  className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center"
                  onSubmit={(event) => void saveCredential(provider, event)}
                >
                  {metadata.accountId ? (
                    <div className="min-w-0 sm:w-44 sm:shrink-0">
                      <Label
                        htmlFor={`${provider}-account`}
                        className="sr-only"
                      >
                        {metadata.label} account ID
                      </Label>
                      <Input
                        id={`${provider}-account`}
                        value={draft.accountId}
                        autoComplete="off"
                        disabled={!entitled || interactionLocked}
                        placeholder="Account ID"
                        onChange={(event) =>
                          setDrafts((current) => ({
                            ...current,
                            [provider]: {
                              ...draft,
                              accountId: event.target.value,
                            },
                          }))
                        }
                      />
                    </div>
                  ) : null}
                  <div className="min-w-0 flex-1">
                    <Label htmlFor={`${provider}-key`} className="sr-only">
                      {metadata.label} API key
                    </Label>
                    <Input
                      id={`${provider}-key`}
                      type="password"
                      value={draft.apiKey}
                      autoComplete="new-password"
                      disabled={!entitled || interactionLocked}
                      placeholder={
                        entitled
                          ? credential
                            ? "Enter a replacement key"
                            : "Enter API key"
                          : "Upgrade to add a key"
                      }
                      onChange={(event) =>
                        setDrafts((current) => ({
                          ...current,
                          [provider]: {
                            ...draft,
                            apiKey: event.target.value,
                          },
                        }))
                      }
                    />
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <Button type="submit" disabled={!canSubmit}>
                      {busy ? "Saving…" : credential ? "Replace" : "Save"}
                    </Button>
                    {credential ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Remove ${metadata.label} connection`}
                        title={`Remove ${metadata.label} connection`}
                        disabled={interactionLocked}
                        onClick={() => void deleteCredential(provider)}
                      >
                        <Trash2 />
                      </Button>
                    ) : null}
                  </div>
                </form>
              </div>
            </div>
          );
        })}
      </div>

      {!entitled && connectedCount > 0 ? (
        <p className="text-muted-foreground text-xs">
          Retained connections stay encrypted and inactive while you are on the
          Free plan. You can still remove them at any time.
        </p>
      ) : null}

      <ChatGptConsentDialog
        open={chatGptConsentOpen}
        onOpenChange={setChatGptConsentOpen}
        onConnect={() => void startChatGpt()}
      />
    </section>
  );
}

function connectionTypeLabel(connectionType: ConnectionType): string {
  switch (connectionType) {
    case "chatgpt_oauth":
      return "ChatGPT";
    case "openrouter_oauth":
      return "OpenRouter OAuth";
    default:
      return "API key";
  }
}
