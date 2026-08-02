import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { LockKeyhole } from "lucide-react";
import { toast } from "sonner";

import type {
  ByokProviderId,
  UserModelRoutingConfig,
} from "@redux/shared/models";
import { api } from "@redux/backend/convex/_generated/api";
import { Button } from "@redux/ui/components/button";
import { Card } from "@redux/ui/components/card";

import { useBillingState } from "@/components/chat/use-billing-state";
import { MobileSidebarTrigger } from "@/components/layout/mobile-sidebar-trigger";
import { ModelOverridesSection } from "@/components/settings/models/model-overrides-section";
import { ProviderKeysSection } from "@/components/settings/models/provider-keys-section";
import { RoutingPrioritySection } from "@/components/settings/models/routing-priority-section";
import { env } from "@/env";
import { fetchAuthMutation, fetchAuthQuery } from "@/lib/auth/server";
import { useQuery } from "@/lib/hooks/convex";

const reconcileByokSettings = createServerFn({ method: "POST" }).handler(
  async () => {
    const { userId } = await fetchAuthQuery(
      api.functions.user.getCurrentUserId,
      {},
    );
    if (!userId) return;
    await fetchAuthMutation(api.functions.byok.internal_reconcileUser, {
      secret: env.INTERNAL_CONVEX_SECRET,
      userId,
    });
  },
);

function ModelsRouteComponent() {
  const summary = useQuery(api.functions.byok.getSettingsSummary, {});
  const { billingState } = useBillingState();
  const entitled = billingState?.entitlements.byok === true;
  const [routingOverride, setRoutingOverride] =
    useState<UserModelRoutingConfig | null>(null);
  const [routingSaving, setRoutingSaving] = useState(false);
  const routing = routingOverride ?? summary?.routing ?? null;

  const configuredProviders = useMemo(
    () =>
      new Set<ByokProviderId>(
        (summary?.credentials ?? []).map((credential) => credential.provider),
      ),
    [summary?.credentials],
  );

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

      <ProviderKeysSection
        entitled={entitled}
        credentials={summary?.credentials ?? []}
      />

      {entitled && routing ? (
        <>
          <RoutingPrioritySection
            routing={routing}
            configuredProviders={configuredProviders}
            routingSaving={routingSaving}
            onSaveRouting={saveRouting}
          />
          <ModelOverridesSection
            routing={routing}
            configuredProviders={configuredProviders}
            routingSaving={routingSaving}
            onSaveRouting={saveRouting}
          />
        </>
      ) : null}
    </div>
  );
}

export const Route = createFileRoute("/settings/models")({
  loader: () => reconcileByokSettings(),
  component: ModelsRouteComponent,
  head: () => ({ meta: [{ title: "Models | Redux Chat" }] }),
});
