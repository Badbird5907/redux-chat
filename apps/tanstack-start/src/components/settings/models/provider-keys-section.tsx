import type { FormEvent } from "react";
import { useMemo, useState } from "react";
import { Check, KeyRound, Trash2 } from "lucide-react";
import { toast } from "sonner";

import type { ByokProviderId } from "@redux/shared/models";
import { BYOK_PROVIDER_IDS } from "@redux/shared/models";
import { Badge } from "@redux/ui/components/badge";
import { Button } from "@redux/ui/components/button";
import { Card } from "@redux/ui/components/card";
import { Input } from "@redux/ui/components/input";
import { Label } from "@redux/ui/components/label";

import { PROVIDERS } from "./provider-config";

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

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-sm font-semibold">Provider keys</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          Keys are encrypted at rest and are never sent back to your browser.
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
                    <Check className="size-3" /> ••••
                    {credential.displaySuffix}
                  </Badge>
                ) : null}
              </div>
              {entitled ? (
                <form
                  className="space-y-3"
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
                          ? "Replace"
                          : "Save"}
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
                  <Trash2 className="size-4" /> Delete retained key
                </Button>
              ) : null}
            </Card>
          );
        })}
      </div>
    </section>
  );
}
