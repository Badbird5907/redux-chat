import type { AppHotkeyBinding, AppHotkeyId } from "@/lib/hotkeys";
import { useMemo, useState } from "react";
import { formatForDisplay, useHotkeyRecorder } from "@tanstack/react-hotkeys";
import { createFileRoute } from "@tanstack/react-router";
import { Pencil, RotateCcw, X } from "lucide-react";

import { Badge } from "@redux/ui/components/badge";
import { Button } from "@redux/ui/components/button";
import { Kbd } from "@redux/ui/components/kbd";

import { MobileSidebarTrigger } from "@/components/layout/mobile-sidebar-trigger";
import { appHotkeyDefinitions, useHotkeySettings } from "@/lib/hotkeys";

function HotkeysRouteComponent() {
  const { bindings, isCustomized, resetAll, resetBinding, setBinding } =
    useHotkeySettings();
  const [editingId, setEditingId] = useState<AppHotkeyId | null>(null);
  const [errors, setErrors] = useState<Partial<Record<AppHotkeyId, string>>>(
    {},
  );

  const groupedHotkeys = useMemo(
    () =>
      appHotkeyDefinitions.reduce(
        (groups, definition) => {
          const group =
            groups[definition.category] ??
            ([] as (typeof appHotkeyDefinitions)[number][]);
          group.push(definition);
          groups[definition.category] = group;
          return groups;
        },
        {} as Record<string, (typeof appHotkeyDefinitions)[number][]>,
      ),
    [],
  );

  const customizedCount = appHotkeyDefinitions.filter((definition) =>
    isCustomized(definition.id),
  ).length;

  const recorder = useHotkeyRecorder({
    onRecord: (hotkey) => {
      if (!editingId) {
        return;
      }

      const nextHotkey = hotkey.trim();
      if (nextHotkey.length === 0) {
        setErrors((previous) => ({
          ...previous,
          [editingId]: "Use Reset to restore the default shortcut.",
        }));
        setEditingId(null);
        return;
      }

      const conflictingDefinition = appHotkeyDefinitions.find(
        (definition) =>
          definition.id !== editingId && bindings[definition.id] === nextHotkey,
      );

      if (conflictingDefinition) {
        setErrors((previous) => ({
          ...previous,
          [editingId]: `${formatForDisplay(nextHotkey)} is already assigned to ${conflictingDefinition.label}.`,
        }));
        setEditingId(null);
        return;
      }

      setBinding(editingId, nextHotkey as AppHotkeyBinding);
      setErrors((previous) => {
        const next = { ...previous };
        delete next[editingId];
        return next;
      });
      setEditingId(null);
    },
    onCancel: () => {
      setEditingId(null);
    },
    onClear: () => {
      if (!editingId) {
        return;
      }

      setErrors((previous) => ({
        ...previous,
        [editingId]: "Use Reset to restore the default shortcut.",
      }));
      setEditingId(null);
    },
  });

  const handleStartEditing = (id: AppHotkeyId) => {
    if (recorder.isRecording) {
      recorder.cancelRecording();
    }

    setErrors((previous) => {
      const next = { ...previous };
      delete next[id];
      return next;
    });
    setEditingId(id);
    recorder.startRecording();
  };

  const handleCancelEditing = () => {
    recorder.cancelRecording();
  };

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8">
      <div className="flex flex-row flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-2">
          <MobileSidebarTrigger />
          <h1 className="min-w-0 text-2xl font-semibold tracking-tight">
            Keyboard shortcuts
          </h1>
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={customizedCount === 0}
          onClick={resetAll}
        >
          <RotateCcw className="size-4" />
          Reset all
        </Button>
      </div>

      {Object.entries(groupedHotkeys).map(([category, definitions]) => (
        <section key={category} className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold">{category}</h2>
          <div className="divide-border/60 border-border/60 bg-card/40 divide-y rounded-lg border">
            {definitions.map((definition) => {
              const active =
                editingId === definition.id && recorder.isRecording;
              const currentBinding = bindings[definition.id];
              const currentError = errors[definition.id];

              return (
                <div
                  key={definition.id}
                  className="flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm">{definition.label}</span>
                      {isCustomized(definition.id) && (
                        <Badge variant="secondary" className="text-[10px]">
                          Custom
                        </Badge>
                      )}
                    </div>
                    {currentError ? (
                      <p className="text-destructive mt-1 text-xs">
                        {currentError}
                      </p>
                    ) : null}
                  </div>

                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <Kbd
                      className={
                        active
                          ? "text-muted-foreground min-h-7 px-2 py-1 text-xs italic"
                          : "min-h-7 px-2 py-1 text-xs"
                      }
                    >
                      {active
                        ? "Press keys…"
                        : formatForDisplay(currentBinding)}
                    </Kbd>
                    <Button
                      variant={active ? "secondary" : "outline"}
                      size="icon-sm"
                      aria-label={
                        active ? "Cancel shortcut recording" : "Edit shortcut"
                      }
                      onClick={() =>
                        active
                          ? handleCancelEditing()
                          : handleStartEditing(definition.id)
                      }
                    >
                      {active ? (
                        <X className="size-4" />
                      ) : (
                        <Pencil className="size-4" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Reset shortcut to default"
                      disabled={!isCustomized(definition.id)}
                      onClick={() => {
                        resetBinding(definition.id);
                        setErrors((previous) => {
                          const next = { ...previous };
                          delete next[definition.id];
                          return next;
                        });
                      }}
                    >
                      <RotateCcw className="size-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

export const Route = createFileRoute("/settings/hotkeys")({
  component: HotkeysRouteComponent,
});
