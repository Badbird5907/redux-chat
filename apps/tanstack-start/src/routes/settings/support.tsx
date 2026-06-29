import { createFileRoute } from "@tanstack/react-router";
import { ExternalLink, MessageSquareHeart } from "lucide-react";

import { Button } from "@redux/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@redux/ui/components/card";

import { SettingsMobileSidebarTrigger } from "@/components/settings/settings-mobile-sidebar-trigger";
import { useReducerState } from "@/lib/hooks/use-reducer-state";
import { getFeaturebaseSsoUrl } from "@/server/featurebase-sso";

function SupportRouteComponent() {
  const [isLoading, setIsLoading] = useReducerState(false);

  const handleOpenPortal = async () => {
    setIsLoading(true);
    try {
      const result = await getFeaturebaseSsoUrl();
      window.open(result.url, "_blank", "noopener,noreferrer");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8">
      <div className="flex flex-row flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-2">
          <SettingsMobileSidebarTrigger />
          <h1 className="min-w-0 text-2xl font-semibold tracking-tight">
            Support
          </h1>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Feedback & Roadmap</CardTitle>
          <CardDescription>
            Share feature requests, report bugs, and view the product roadmap.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={handleOpenPortal} disabled={isLoading}>
            {isLoading ? (
              <MessageSquareHeart className="size-4 animate-pulse" />
            ) : (
              <ExternalLink className="size-4" />
            )}
            Open Feedback Portal
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

export const Route = createFileRoute("/settings/support")({
  component: SupportRouteComponent,
});
