import { createFileRoute } from "@tanstack/react-router";
import { Monitor, Moon, Sun } from "lucide-react";

import type { ThemeMode } from "@redux/ui/components/theme";
import { Tabs, TabsList, TabsTrigger } from "@redux/ui/components/tabs";
import { useTheme } from "@redux/ui/components/theme";

import { SettingsMobileSidebarTrigger } from "@/components/settings/settings-mobile-sidebar-trigger";

export const Route = createFileRoute("/settings/appearance")({
  component: AppearanceRouteComponent,
});

const themeOptions = [
  {
    icon: Monitor,
    label: "System",
    value: "auto",
  },
  {
    icon: Moon,
    label: "Dark",
    value: "dark",
  },
  {
    icon: Sun,
    label: "Light",
    value: "light",
  },
] as const;

function AppearanceRouteComponent() {
  const { setTheme, themeMode } = useTheme();

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8">
      <div className="flex flex-row flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-2">
          <SettingsMobileSidebarTrigger />
          <h1 className="min-w-0 text-2xl font-semibold tracking-tight">
            Appearance
          </h1>
        </div>
      </div>

      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-sm font-semibold">Theme</h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Choose how Redux Chat looks on this device.
          </p>
        </div>
        <Tabs
          value={themeMode}
          onValueChange={(value) => setTheme(value as ThemeMode)}
        >
          <TabsList className="w-fit">
            {themeOptions.map((option) => {
              const Icon = option.icon;

              return (
                <TabsTrigger key={option.value} value={option.value}>
                  <Icon className="size-4" />
                  {option.label}
                </TabsTrigger>
              );
            })}
          </TabsList>
        </Tabs>
      </section>
    </div>
  );
}
