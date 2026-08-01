import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowDown,
  ArrowUp,
  Check,
  KeyRound,
  LockKeyhole,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import type {
  ByokProviderId,
  RoutingPreset,
  UserModelRoutingConfig,
} from "@redux/shared/models";
import { api } from "@redux/backend/convex/_generated/api";
import {
  BYOK_PROVIDER_IDS,
  CHAT_MODELS,
  getModelRoutes,
  isByokProviderId,
  providerPriorityForPreset,
  resolveEffectiveModelRoute,
} from "@redux/shared/models";
import { Badge } from "@redux/ui/components/badge";
import { Button } from "@redux/ui/components/button";
import { Card } from "@redux/ui/components/card";
import { Input } from "@redux/ui/components/input";
import { Label } from "@redux/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@redux/ui/components/select";
import { Switch } from "@redux/ui/components/switch";

import { useBillingState } from "@/components/chat/use-billing-state";
import { MobileSidebarTrigger } from "@/components/layout/mobile-sidebar-trigger";
import { useQuery } from "@/lib/hooks/convex";

const PROVIDERS: Record<
  ByokProviderId,
  { label: string; description: string; accountId?: boolean }
> = {
  openai: {
    label: "OpenAI",
    description: "Route supported OpenAI models directly through your account.",
  },
  anthropic: {
    label: "Anthropic",
    description: "Use your Anthropic account for supported Claude models.",
  },
  vertex: {
    label: "Google Vertex",
    description: "Use your Google Vertex API key for supported Gemini models.",
  },
  workersai: {
    label: "Cloudflare Workers AI",
    description: "Use your Cloudflare account and API token.",
    accountId: true,
  },
  openrouter: {
    label: "OpenRouter",
    description: "Use OpenRouter as a broad fallback across model makers.",
  },
};

type ProviderDraft = { apiKey: string; accountId: string };

function ModelsRouteComponent() {
  const summary = useQuery(api.functions.byok.getSettingsSummary, {});
  const { billingState } = useBillingState();
  const entitled = billingState?.entitlements.byok === true;
  const [drafts, setDrafts] = useState<
    Partial<Record<ByokProviderId, ProviderDraft>>
  >({});
  const [savingProvider, setSavingProvider] = useState<ByokProviderId | null>(
    null,
  );
  const [routingOverride, setRoutingOverride] =
    useState<UserModelRoutingConfig | null>(null);
  const [routingSaving, setRoutingSaving] = useState(false);
  const [search, setSearch] = useState("");
  const routing = routingOverride ?? summary?.routing ?? null;

  useEffect(() => {
    if (summary === undefined) return;
    void fetch("/api/byok/reconcile", { method: "POST" });
  }, [summary]);

  const configuredProviders = useMemo(
    () =>
      new Set<ByokProviderId>(
        (summary?.credentials ?? []).map((credential) => credential.provider),
      ),
    [summary?.credentials],
  );
  const credentialByProvider = useMemo(
    () =>
      new Map(
        (summary?.credentials ?? []).map((credential) => [
          credential.provider,
          credential,
        ]),
      ),
    [summary?.credentials],
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

  const saveRouting = async (next: UserModelRoutingConfig) => {
    setRoutingOverride(next);
    setRoutingSaving(true);
    try {
      const response = await fetch("/api/byok/routing", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      if (!response.ok) throw new Error("Could not save routing settings.");
      setRoutingOverride(null);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Routing save failed",
      );
      setRoutingOverride(null);
    } finally {
      setRoutingSaving(false);
    }
  };

  const applyPreset = (preset: Exclude<RoutingPreset, "custom">) => {
    if (!routing) return;
    void saveRouting({
      ...routing,
      preset,
      providerPriority: providerPriorityForPreset(preset),
    });
  };

  const moveProvider = (provider: ByokProviderId, delta: -1 | 1) => {
    if (!routing) return;
    const priority = [...routing.providerPriority];
    const index = priority.indexOf(provider);
    const target = index + delta;
    if (index < 0 || target < 0 || target >= priority.length) return;
    const current = priority[index];
    const destination = priority[target];
    if (!current || !destination) return;
    priority[index] = destination;
    priority[target] = current;
    void saveRouting({
      ...routing,
      preset: "custom",
      providerPriority: priority,
    });
  };

  const setOverride = (modelId: string, value: string) => {
    if (!routing) return;
    const overrides = routing.overrides.filter(
      (override) => override.modelId !== modelId,
    );
    if (value === "hosted") {
      overrides.push({ modelId, kind: "hosted" });
    } else if (value !== "auto") {
      overrides.push({
        modelId,
        kind: "byok",
        routeId: value,
      });
    }
    void saveRouting({ ...routing, overrides });
  };

  const visibleModels = CHAT_MODELS.filter((model) => {
    const query = search.trim().toLowerCase();
    return (
      !query || `${model.name} ${model.makerName}`.toLowerCase().includes(query)
    );
  });

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-2">
          <MobileSidebarTrigger />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Models</h1>
            <p className="text-muted-foreground mt-1 text-sm">
              Securely connect provider accounts and choose how models route.
            </p>
          </div>
        </div>
        {routingSaving ? (
          <span className="text-muted-foreground text-xs">Saving routing…</span>
        ) : null}
      </div>

      {!entitled ? (
        <Card className="border-primary/25 bg-primary/6 px-5 py-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2 font-semibold">
                <LockKeyhole className="size-4" /> BYOK requires a paid plan
              </div>
              <p className="text-muted-foreground mt-1 text-sm">
                Base includes Free limits plus provider keys for $2/month.
                Retained keys remain encrypted and inactive while you are Free.
              </p>
            </div>
            <Button render={<Link to="/settings" />}>View plans</Button>
          </div>
        </Card>
      ) : null}

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
                        <Label htmlFor={`${provider}-account`}>
                          Account ID
                        </Label>
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
                          credential
                            ? "Enter a replacement key"
                            : "Enter API key"
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
                          (metadata.accountId === true &&
                            !draft.accountId.trim())
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

      {entitled && routing ? (
        <>
          <section className="space-y-3">
            <div>
              <h2 className="text-sm font-semibold">Routing priority</h2>
              <p className="text-muted-foreground mt-1 text-sm">
                The first configured provider that supports a model is used.
              </p>
            </div>
            <Card className="gap-4 px-5 py-5">
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  disabled={routingSaving}
                  variant={
                    routing.preset === "native_first" ? "default" : "outline"
                  }
                  onClick={() => applyPreset("native_first")}
                >
                  Native first
                </Button>
                <Button
                  size="sm"
                  disabled={routingSaving}
                  variant={
                    routing.preset === "openrouter_first"
                      ? "default"
                      : "outline"
                  }
                  onClick={() => applyPreset("openrouter_first")}
                >
                  OpenRouter first
                </Button>
              </div>
              <div className="divide-border/60 divide-y rounded-lg border">
                {routing.providerPriority.map((provider, index) => (
                  <div
                    key={provider}
                    className="flex items-center gap-3 px-3 py-2.5"
                  >
                    <span className="text-muted-foreground w-5 text-center text-xs tabular-nums">
                      {index + 1}
                    </span>
                    <span className="min-w-0 flex-1 text-sm font-medium">
                      {PROVIDERS[provider].label}
                    </span>
                    <Badge variant="outline">
                      {configuredProviders.has(provider)
                        ? "Configured"
                        : "No key"}
                    </Badge>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label={`Move ${PROVIDERS[provider].label} up`}
                      disabled={routingSaving || index === 0}
                      onClick={() => moveProvider(provider, -1)}
                    >
                      <ArrowUp />
                    </Button>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label={`Move ${PROVIDERS[provider].label} down`}
                      disabled={
                        routingSaving ||
                        index === routing.providerPriority.length - 1
                      }
                      onClick={() => moveProvider(provider, 1)}
                    >
                      <ArrowDown />
                    </Button>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between gap-4 border-t pt-4">
                <div>
                  <p className="text-sm font-medium">
                    Redux Chat hosted fallback
                  </p>
                  <p className="text-muted-foreground mt-0.5 text-xs">
                    Use hosted provider credentials and credits when no BYOK
                    route is available.
                  </p>
                </div>
                <Switch
                  checked={routing.hostedFallback}
                  disabled={routingSaving}
                  onCheckedChange={(checked) =>
                    void saveRouting({ ...routing, hostedFallback: checked })
                  }
                  aria-label="Redux Chat hosted fallback"
                />
              </div>
            </Card>
          </section>

          <section className="space-y-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-sm font-semibold">Per-model overrides</h2>
                <p className="text-muted-foreground mt-1 text-sm">
                  Auto follows the priority above. Stale catalog routes are
                  removed automatically.
                </p>
              </div>
              <Input
                className="sm:w-72"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search models"
              />
            </div>
            <div className="divide-border/60 divide-y overflow-hidden rounded-lg border">
              {visibleModels.map((model) => {
                const override = routing.overrides.find(
                  (item) => item.modelId === model.id,
                );
                const effective = resolveEffectiveModelRoute({
                  modelId: model.id,
                  config: routing,
                  availableProviders: configuredProviders,
                  byokEnabled: true,
                });
                const value =
                  override?.kind === "hosted"
                    ? "hosted"
                    : override?.kind === "byok"
                      ? override.routeId
                      : "auto";
                const routes = getModelRoutes(model.id).filter(
                  (route) =>
                    isByokProviderId(route.provider) &&
                    configuredProviders.has(route.provider),
                );
                return (
                  <div
                    key={model.id}
                    className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {model.name}
                      </p>
                      <p className="text-muted-foreground mt-0.5 text-xs">
                        {effective
                          ? `${effective.route.providerName} · ${effective.fundingSource === "user" ? "BYOK" : "Redux Chat credits"}`
                          : "No available route"}
                      </p>
                    </div>
                    <Select
                      value={value}
                      disabled={routingSaving}
                      onValueChange={(next) => setOverride(model.id, next)}
                    >
                      <SelectTrigger className="w-full sm:w-64">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="auto">Auto</SelectItem>
                        {routes.map((route) => (
                          <SelectItem key={route.id} value={route.id}>
                            {route.providerName} · BYOK
                          </SelectItem>
                        ))}
                        {routing.hostedFallback ? (
                          <SelectItem value="hosted">
                            Redux Chat hosted · credits
                          </SelectItem>
                        ) : null}
                      </SelectContent>
                    </Select>
                  </div>
                );
              })}
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}

export const Route = createFileRoute("/settings/models")({
  component: ModelsRouteComponent,
  head: () => ({ meta: [{ title: "Models | Redux Chat" }] }),
});
