import type { FormEvent } from "react";
import { useMemo, useState } from "react";
import { Check, ExternalLink, ShieldCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";

import type { ByokProviderId } from "@redux/shared/models";
import { BYOK_PROVIDER_IDS } from "@redux/shared/models";
import { Badge } from "@redux/ui/components/badge";
import { Button } from "@redux/ui/components/button";
import { Input } from "@redux/ui/components/input";
import { Label } from "@redux/ui/components/label";

import { ByokProviderIcon } from "./byok-provider-icon";
import { PROVIDERS } from "./provider-config";
import { UpgradeLockBadge } from "./upgrade-lock-badge";

type ProviderDraft = { apiKey: string; accountId: string };

type ProviderCredentialSummary = {
  provider: ByokProviderId;
  displaySuffix: string;
};

export function ProviderKeysSection({
  entitled,
  credentials,
}: {
  entitled: boolean;
  credentials: readonly ProviderCredentialSummary[];
}) {
  const [drafts, setDrafts] = useState<
    Partial<Record<ByokProviderId, ProviderDraft>>
  >({});
  const [savingProvider, setSavingProvider] = useState<ByokProviderId | null>(
    null,
  );
  const credentialByProvider = useMemo(
    () =>
      new Map(
        credentials.map((credential) => [credential.provider, credential]),
      ),
    [credentials],
  );

  const saveCredential = async (provider: ByokProviderId, event: FormEvent) => {
    event.preventDefault();
    if (!entitled) return;
    const draft = drafts[provider];
    if (!draft?.apiKey.trim()) return;
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
      toast.success(`${PROVIDERS[provider].label} credentials saved`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Save failed");
    } finally {
      setSavingProvider(null);
    }
  };

  const deleteCredential = async (provider: ByokProviderId) => {
    if (
      !window.confirm(`Remove the ${PROVIDERS[provider].label} credentials?`)
    ) {
      return;
    }
    setSavingProvider(provider);
    try {
      const response = await fetch(`/api/byok/credentials/${provider}`, {
        method: "DELETE",
      });
      if (!response.ok)
        throw new Error("Could not remove provider credentials.");
      toast.success(`${PROVIDERS[provider].label} credentials removed`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Remove failed");
    } finally {
      setSavingProvider(null);
    }
  };

  const connectedCount = credentialByProvider.size;

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold">Provider keys</h2>
            {entitled ? null : <UpgradeLockBadge />}
          </div>
          <p className="text-muted-foreground mt-1 flex items-center gap-1.5 text-sm">
            <ShieldCheck className="size-3.5 shrink-0" aria-hidden />
            Keys are encrypted at rest and are never sent back to your browser.
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
          const canSubmit =
            entitled &&
            !busy &&
            draft.apiKey.trim().length > 0 &&
            (metadata.accountId !== true || draft.accountId.trim().length > 0);

          return (
            <div
              key={provider}
              className="flex flex-col gap-3 px-4 py-3.5 lg:flex-row lg:items-center lg:gap-5"
            >
              <div className="flex min-w-0 items-start gap-3 lg:w-64 lg:shrink-0">
                <ByokProviderIcon provider={provider} />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-sm font-medium">
                      {metadata.label}
                    </span>
                    {credential ? (
                      <Badge variant="outline" color="green">
                        <Check aria-hidden /> ••••{credential.displaySuffix}
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
                    Get a key <ExternalLink className="size-3" aria-hidden />
                  </a>
                </div>
              </div>

              <form
                className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center"
                onSubmit={(event) => void saveCredential(provider, event)}
              >
                {metadata.accountId ? (
                  <div className="min-w-0 sm:w-44 sm:shrink-0">
                    <Label htmlFor={`${provider}-account`} className="sr-only">
                      {metadata.label} account ID
                    </Label>
                    <Input
                      id={`${provider}-account`}
                      value={draft.accountId}
                      autoComplete="off"
                      disabled={!entitled || busy}
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
                    disabled={!entitled || busy}
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
                      aria-label={`Remove ${metadata.label} credentials`}
                      title={`Remove ${metadata.label} credentials`}
                      disabled={busy}
                      onClick={() => void deleteCredential(provider)}
                    >
                      <Trash2 />
                    </Button>
                  ) : null}
                </div>
              </form>
            </div>
          );
        })}
      </div>

      {!entitled && connectedCount > 0 ? (
        <p className="text-muted-foreground text-xs">
          Retained keys stay encrypted and inactive while you are on the Free
          plan. You can still remove them at any time.
        </p>
      ) : null}
    </section>
  );
}
