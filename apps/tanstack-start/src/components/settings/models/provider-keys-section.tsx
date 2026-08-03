import { Check, KeyRound, Link2, RefreshCw, Trash2 } from "lucide-react";

import { BYOK_PROVIDER_IDS } from "@redux/shared/models";
import { Badge } from "@redux/ui/components/badge";
import { Button } from "@redux/ui/components/button";
import { Card } from "@redux/ui/components/card";
import { Input } from "@redux/ui/components/input";
import { Label } from "@redux/ui/components/label";

import type {
  ConnectionType,
  ProviderCredentialSummary,
} from "./use-provider-connections";
import {
  ChatGptConsentDialog,
  ChatGptDevicePanel,
} from "./chatgpt-connection-ui";
import { PROVIDERS } from "./provider-config";
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

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-sm font-semibold">Provider connections</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          Credentials are encrypted at rest and are never sent back to your
          browser.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {BYOK_PROVIDER_IDS.map((provider) => {
          const metadata = PROVIDERS[provider];
          const credential = credentialByProvider.get(provider);
          const draft = drafts[provider] ?? { apiKey: "", accountId: "" };
          return (
            <Card key={provider} className="gap-4 px-5 py-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 font-semibold">
                    <KeyRound className="size-4" /> {metadata.label}
                  </div>
                  <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
                    {metadata.description}
                  </p>
                </div>
                {credential ? (
                  <Badge variant="outline" className="gap-1">
                    <Check className="size-3" />
                    {connectionTypeLabel(credential.connectionType)} · ••••
                    {credential.displaySuffix}
                  </Badge>
                ) : null}
              </div>

              {credential ? (
                <div className="bg-muted/35 space-y-1 rounded-lg px-3 py-2 text-xs">
                  {credential.displayLabel ? (
                    <p className="font-medium">{credential.displayLabel}</p>
                  ) : null}
                  <p className="text-muted-foreground">
                    Updated {dateFormatter.format(credential.updatedAt)}
                    {credential.connectionType === "chatgpt_oauth"
                      ? ` · ${credential.availableModelIds?.length ?? 0} models`
                      : ""}
                  </p>
                </div>
              ) : null}

              {entitled && provider === "openai" ? (
                <div className="space-y-2">
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={connectingConnector !== null}
                      onClick={() => setChatGptConsentOpen(true)}
                    >
                      <Link2 className="size-4" />
                      {credential?.connectionType === "chatgpt_oauth"
                        ? "Reconnect ChatGPT"
                        : "Connect ChatGPT"}
                    </Button>
                    {credential?.connectionType === "chatgpt_oauth" ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={connectingConnector !== null}
                        onClick={() => void refreshChatGpt()}
                      >
                        <RefreshCw className="size-4" /> Refresh models
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
                <div className="space-y-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={connectingConnector !== null}
                    onClick={() => void startOpenRouter()}
                  >
                    <Link2 className="size-4" />
                    {credential?.connectionType === "openrouter_oauth"
                      ? "Reconnect OpenRouter"
                      : "Connect OpenRouter"}
                  </Button>
                  <p className="text-muted-foreground text-xs">
                    OAuth creates an OpenRouter API key. Removing it here does
                    not revoke it in OpenRouter. Manage or revoke generated keys
                    in{" "}
                    <a
                      className="underline underline-offset-2"
                      href="https://openrouter.ai/settings/keys"
                      target="_blank"
                      rel="noreferrer"
                    >
                      OpenRouter key settings
                    </a>
                    .
                  </p>
                </div>
              ) : null}

              {entitled ? (
                <form
                  className="space-y-3 border-t pt-3"
                  onSubmit={(event) => void saveCredential(provider, event)}
                >
                  {metadata.accountId ? (
                    <div className="space-y-1.5">
                      <Label htmlFor={`${provider}-account`}>Account ID</Label>
                      <Input
                        id={`${provider}-account`}
                        value={draft.accountId}
                        autoComplete="off"
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
                  <div className="space-y-1.5">
                    <Label htmlFor={`${provider}-key`}>API key</Label>
                    <Input
                      id={`${provider}-key`}
                      type="password"
                      value={draft.apiKey}
                      autoComplete="new-password"
                      placeholder={
                        credential ? "Enter a replacement key" : "Enter API key"
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
                  <div className="flex justify-between gap-2">
                    {credential ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={savingProvider === provider}
                        onClick={() => void deleteCredential(provider)}
                      >
                        <Trash2 className="size-4" /> Remove
                      </Button>
                    ) : (
                      <span />
                    )}
                    <Button
                      type="submit"
                      size="sm"
                      disabled={
                        savingProvider === provider ||
                        !draft.apiKey.trim() ||
                        (metadata.accountId === true && !draft.accountId.trim())
                      }
                    >
                      {savingProvider === provider
                        ? "Saving…"
                        : credential
                          ? "Replace with key"
                          : "Save key"}
                    </Button>
                  </div>
                </form>
              ) : credential ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void deleteCredential(provider)}
                >
                  <Trash2 className="size-4" /> Delete retained connection
                </Button>
              ) : null}
            </Card>
          );
        })}
      </div>

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
