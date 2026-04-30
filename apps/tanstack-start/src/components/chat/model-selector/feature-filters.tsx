import { useMemo, useState } from "react";
import { Check, ListFilter } from "lucide-react";

import type {
  ChatModelConfig,
  ModelKnowledgeCutoff,
} from "@redux/shared/models";
import { CHAT_MODELS } from "@redux/shared/models";
import { Button } from "@redux/ui/components/button";
import { Label } from "@redux/ui/components/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@redux/ui/components/popover";
import { cn } from "@redux/ui/lib/utils";

import type { CapabilityId } from "./capabilities";
import {
  CAPABILITY_CHIP_WRAPPER_CLASSES,
  CAPABILITY_DEFS,
} from "./capabilities";

const MONTHS: readonly { value: number; label: string }[] = [
  { value: 1, label: "January" },
  { value: 2, label: "February" },
  { value: 3, label: "March" },
  { value: 4, label: "April" },
  { value: 5, label: "May" },
  { value: 6, label: "June" },
  { value: 7, label: "July" },
  { value: 8, label: "August" },
  { value: 9, label: "September" },
  { value: 10, label: "October" },
  { value: 11, label: "November" },
  { value: 12, label: "December" },
] as const;

function cutoffPeriodKey(year: number, month: number): number {
  return year * 12 + month;
}

function modelKnowledgePeriodKey(k: ModelKnowledgeCutoff): number {
  const month = k.month ?? 12;
  return cutoffPeriodKey(k.year, month);
}

export type MinKnowledgeCutoff = { year: number; month: number };

export function modelMatchesMinKnowledgeCutoff(
  model: ChatModelConfig,
  min: MinKnowledgeCutoff | null,
): boolean {
  if (!min) return true;
  const k = model.knowledgeCutoff;
  if (!k) return true;
  return modelKnowledgePeriodKey(k) >= cutoffPeriodKey(min.year, min.month);
}

/** Descending years, never after the current calendar year. */
function knowledgeCutoffYearOptions(calendarYear: number): readonly number[] {
  let minY = calendarYear;
  let maxY = calendarYear;
  for (const m of CHAT_MODELS) {
    const y = m.knowledgeCutoff?.year;
    if (y != null) {
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  }
  minY = Math.min(minY, calendarYear - 6);
  maxY = Math.min(maxY, calendarYear);
  const out: number[] = [];
  for (let y = maxY; y >= minY; y--) out.push(y);
  return out;
}

function clampCutoffToPresent(
  c: MinKnowledgeCutoff,
  calendarYear: number,
  calendarMonth: number,
): MinKnowledgeCutoff {
  if (c.year > calendarYear)
    return { year: calendarYear, month: calendarMonth };
  if (c.year === calendarYear && c.month > calendarMonth) {
    return { year: calendarYear, month: calendarMonth };
  }
  return c;
}

function selectableMonthsForYear(
  year: number,
  calendarYear: number,
  calendarMonth: number,
): readonly (typeof MONTHS)[number][] {
  if (year > calendarYear) return [];
  if (year < calendarYear) return MONTHS;
  return MONTHS.filter((m) => m.value <= calendarMonth);
}

export type ModelFeatureFilterId = CapabilityId;

export function modelMatchesFeatureFilters(
  model: ChatModelConfig,
  selectedIds: readonly string[],
): boolean {
  if (selectedIds.length === 0) return true;
  return selectedIds.every((id) => {
    const f = CAPABILITY_DEFS.find((x) => x.id === id);
    return f?.test(model) ?? false;
  });
}

const selectClass =
  "border-input bg-background ring-offset-background focus-visible:ring-ring h-9 min-w-0 flex-1 rounded-md border px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-offset-2";

interface ModelFeatureFiltersProps {
  filtersPopoverOpen: boolean;
  onFiltersPopoverOpenChange: (next: boolean) => void;
  selectedIds: readonly string[];
  onToggle: (id: ModelFeatureFilterId) => void;
  minKnowledgeCutoff: MinKnowledgeCutoff | null;
  onMinKnowledgeCutoffChange: (next: MinKnowledgeCutoff | null) => void;
  onClear: () => void;
}

export function ModelFeatureFilters({
  filtersPopoverOpen,
  onFiltersPopoverOpenChange,
  selectedIds,
  onToggle,
  minKnowledgeCutoff,
  onMinKnowledgeCutoffChange,
  onClear,
}: ModelFeatureFiltersProps) {
  const selected = new Set(selectedIds);

  const { calendarYear, calendarMonth } = useMemo(() => {
    const d = new Date();
    return { calendarYear: d.getFullYear(), calendarMonth: d.getMonth() + 1 };
  }, []);

  const years = useMemo(
    () => [...knowledgeCutoffYearOptions(calendarYear)],
    [calendarYear],
  );

  const [draftYear, setDraftYear] = useState<number | "">("");
  const [draftMonth, setDraftMonth] = useState<number | "">("");

  const hasAnyFilters = selectedIds.length > 0 || minKnowledgeCutoff !== null;

  return (
    <div onPointerDown={(e) => e.stopPropagation()}>
      <Popover
        open={filtersPopoverOpen}
        onOpenChange={(next) => {
          onFiltersPopoverOpenChange(next);
          if (!next) return;
          if (minKnowledgeCutoff) {
            const c = clampCutoffToPresent(
              minKnowledgeCutoff,
              calendarYear,
              calendarMonth,
            );
            setDraftYear(c.year);
            setDraftMonth(c.month);
            if (
              c.year !== minKnowledgeCutoff.year ||
              c.month !== minKnowledgeCutoff.month
            ) {
              onMinKnowledgeCutoffChange(c);
            }
          } else {
            setDraftYear("");
            setDraftMonth("");
          }
        }}
      >
        <PopoverTrigger
          render={
            <Button
              type="button"
              variant="outline"
              size="icon"
              title="Filter models"
              aria-label="Filter models"
              aria-expanded={filtersPopoverOpen}
              aria-haspopup="dialog"
              className={cn(
                "border-input bg-muted/50 text-muted-foreground hover:text-foreground size-11 shrink-0 rounded-lg",
                hasAnyFilters &&
                  "border-primary/50 text-foreground bg-muted/80",
              )}
            />
          }
        >
          <ListFilter className="size-4" />
        </PopoverTrigger>
        <PopoverContent
          align="end"
          side="bottom"
          sideOffset={4}
          className="border-border/80 flex w-[min(calc(100vw-2rem),20rem)] flex-col gap-0 overflow-hidden p-0 shadow-lg"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div className="flex max-h-[min(70vh,28rem)] flex-col gap-0 overflow-y-auto">
            <div className="px-3 pt-3 pb-1">
              <p className="text-muted-foreground px-1 pb-2 text-xs font-medium tracking-wide uppercase">
                Features
              </p>
              <ul className="flex flex-col gap-0.5" role="list">
                {CAPABILITY_DEFS.map(({ id, label, Icon, chipClassName }) => {
                  const isOn = selected.has(id);
                  return (
                    <li key={id}>
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked={isOn}
                        className="hover:bg-muted/80 focus-visible:bg-muted focus-visible:ring-ring flex w-full cursor-pointer items-center gap-2 rounded-md py-2 pr-2 pl-2 text-left text-sm transition-colors outline-none select-none focus-visible:ring-2"
                        onClick={() => onToggle(id)}
                      >
                        <span
                          className={cn(
                            "border-input flex size-4 shrink-0 items-center justify-center rounded-[4px] border shadow-xs",
                            isOn &&
                              "bg-primary text-primary-foreground border-primary",
                          )}
                          aria-hidden
                        >
                          {isOn ? (
                            <Check className="size-3.5" strokeWidth={2.5} />
                          ) : null}
                        </span>
                        <span
                          className={cn(
                            CAPABILITY_CHIP_WRAPPER_CLASSES,
                            "pointer-events-none",
                            chipClassName,
                          )}
                          aria-hidden
                        >
                          <Icon className="size-3.5" strokeWidth={2} />
                        </span>
                        <span className="min-w-0 flex-1">{label}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>

            <div className="bg-border mx-3 h-px shrink-0" role="separator" />

            <div className="px-3 py-3">
              <p className="text-muted-foreground px-1 pb-1 text-xs font-medium tracking-wide uppercase">
                Minimum knowledge cutoff
              </p>
              <div className="flex flex-col gap-3">
                <div className="flex flex-wrap gap-2">
                  <div className="flex min-w-22 flex-1 flex-col gap-1">
                    <Label
                      htmlFor="model-cutoff-year"
                      className="text-muted-foreground px-1 text-xs"
                    >
                      Year
                    </Label>
                    <select
                      id="model-cutoff-year"
                      className={selectClass}
                      value={draftYear === "" ? "" : String(draftYear)}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v === "") {
                          setDraftYear("");
                          setDraftMonth("");
                          onMinKnowledgeCutoffChange(null);
                          return;
                        }
                        const year = Number(v);
                        setDraftYear(year);
                        if (draftMonth === "") {
                          onMinKnowledgeCutoffChange(null);
                          return;
                        }
                        const allowed = selectableMonthsForYear(
                          year,
                          calendarYear,
                          calendarMonth,
                        );
                        const maxM =
                          allowed[allowed.length - 1]?.value ?? calendarMonth;
                        const month = draftMonth <= maxM ? draftMonth : maxM;
                        setDraftMonth(month);
                        onMinKnowledgeCutoffChange({ year, month });
                      }}
                    >
                      <option value="">—</option>
                      {years.map((y) => (
                        <option key={y} value={y}>
                          {y}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex min-w-30 flex-1 flex-col gap-1">
                    <Label
                      htmlFor="model-cutoff-month"
                      className="text-muted-foreground px-1 text-xs"
                    >
                      Month
                    </Label>
                    <select
                      id="model-cutoff-month"
                      className={selectClass}
                      disabled={draftYear === ""}
                      value={draftMonth === "" ? "" : String(draftMonth)}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (draftYear === "") return;
                        if (v === "") {
                          setDraftMonth("");
                          onMinKnowledgeCutoffChange(null);
                          return;
                        }
                        const month = Number(v);
                        const allowed = selectableMonthsForYear(
                          draftYear,
                          calendarYear,
                          calendarMonth,
                        );
                        if (!allowed.some((m) => m.value === month)) return;
                        setDraftMonth(month);
                        onMinKnowledgeCutoffChange({
                          year: draftYear,
                          month,
                        });
                      }}
                    >
                      <option value="">—</option>
                      {(draftYear === ""
                        ? []
                        : selectableMonthsForYear(
                            draftYear,
                            calendarYear,
                            calendarMonth,
                          )
                      ).map(({ value: mv, label: ml }) => (
                        <option key={mv} value={mv}>
                          {ml}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="border-border/70 shrink-0 border-t px-2 py-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-foreground h-9 w-full"
              onClick={() => {
                onClear();
                setDraftYear("");
                setDraftMonth("");
                // onFiltersPopoverOpenChange(false);
              }}
              disabled={!hasAnyFilters}
            >
              Clear all filters
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
