import { createFileRoute } from "@tanstack/react-router";
import { RotateCcw } from "lucide-react";

import { Button } from "@redux/ui/components/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@redux/ui/components/select";
import { Switch } from "@redux/ui/components/switch";

import {
  CHAT_OPEN_POSITION_OPTIONS,
  useChatScrollPreferences,
} from "@/lib/preferences/chat-scroll-store";

function ChatRouteComponent() {
  const { preferences, setPreference, resetAll, isDefault, isReady } =
    useChatScrollPreferences();

  const openPositionOption = CHAT_OPEN_POSITION_OPTIONS.find(
    (option) => option.value === preferences.openPosition,
  );

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8">
      <div className="flex flex-row flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-2">
          <h1 className="min-w-0 text-2xl font-semibold tracking-tight">
            Chat
          </h1>
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={isDefault || !isReady}
          onClick={resetAll}
        >
          <RotateCcw className="size-4" />
          Reset to defaults
        </Button>
      </div>

      <section className="flex flex-col gap-2">
        <div>
          <h2 className="text-sm font-semibold">Scrolling</h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Control how the conversation scrolls while you read and as new
            replies arrive. These settings sync to your account.
          </p>
        </div>

        <div className="divide-border/60 border-border/60 bg-card/40 divide-y rounded-lg border">
          <div className="flex flex-col gap-2 px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">Follow new messages</p>
              <p className="text-muted-foreground mt-0.5 text-xs">
                Keep the latest reply in view while it streams, as long as
                you&apos;re already at the bottom. Scrolling up pauses it.
              </p>
            </div>
            <Switch
              checked={preferences.autoScroll}
              disabled={!isReady}
              onCheckedChange={(checked) =>
                setPreference("autoScroll", checked)
              }
              aria-label="Follow new messages"
            />
          </div>

          <div className="flex flex-col gap-2 px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">Opening position</p>
              <p className="text-muted-foreground mt-0.5 text-xs">
                {openPositionOption?.description ??
                  "Where a conversation lands when you open it."}
              </p>
            </div>
            <Select
              value={preferences.openPosition}
              disabled={!isReady}
              onValueChange={(value) =>
                setPreference(
                  "openPosition",
                  value as (typeof CHAT_OPEN_POSITION_OPTIONS)[number]["value"],
                )
              }
            >
              <SelectTrigger className="w-full sm:w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CHAT_OPEN_POSITION_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-2 px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">
                Keep previous message in view
              </p>
              <p className="text-muted-foreground mt-0.5 text-xs">
                When a new turn starts, keep a peek of the previous message
                above it so the conversation stays connected.
              </p>
            </div>
            <Switch
              checked={preferences.keepPreviousVisible}
              disabled={!isReady}
              onCheckedChange={(checked) =>
                setPreference("keepPreviousVisible", checked)
              }
              aria-label="Keep previous message in view"
            />
          </div>
        </div>
      </section>
    </div>
  );
}

export const Route = createFileRoute("/settings/chat")({
  component: ChatRouteComponent,
  head: () => ({
    meta: [{ title: "Chat | Redux Chat" }],
  }),
});
