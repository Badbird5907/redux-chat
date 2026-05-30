import type {
  ChatModelConfig,
  ModelKnowledgeCutoff,
} from "@redux/shared/models";
import { CHAT_MODELS } from "@redux/shared/models";

import type { CapabilityId } from "./capabilities-data";
import { CAPABILITY_DEFS } from "./capabilities-data";

export type MinKnowledgeCutoff = { year: number; month: number };

export type ModelFeatureFilterId = CapabilityId;

export function cutoffPeriodKey(year: number, month: number): number {
  return year * 12 + month;
}

export function modelKnowledgePeriodKey(k: ModelKnowledgeCutoff): number {
  const month = k.month ?? 12;
  return cutoffPeriodKey(k.year, month);
}

export function modelMatchesMinKnowledgeCutoff(
  model: ChatModelConfig,
  min: MinKnowledgeCutoff | null,
): boolean {
  if (!min) return true;
  const k = model.knowledgeCutoff;
  if (!k) return true;
  return modelKnowledgePeriodKey(k) >= cutoffPeriodKey(min.year, min.month);
}

export function knowledgeCutoffYearOptions(
  calendarYear: number,
): readonly number[] {
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

export function clampCutoffToPresent(
  c: MinKnowledgeCutoff,
  calendarYear: number,
  calendarMonth: number,
): MinKnowledgeCutoff {
  if (c.year > calendarYear) {
    return { year: calendarYear, month: calendarMonth };
  }
  if (c.year === calendarYear && c.month > calendarMonth) {
    return { year: calendarYear, month: calendarMonth };
  }
  return c;
}

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
