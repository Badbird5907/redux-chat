import { Zap } from "lucide-react";
import type { ComponentType, SVGProps } from "react";

import type { ThinkingLevel } from "@redux/shared/models";

import {
  BrainHighIcon,
  BrainLowIcon,
  BrainMediumIcon,
} from "./input/brain-level-icons";

export const THINKING_LEVEL_LABELS: Record<ThinkingLevel, string> = {
  instant: "Instant",
  low: "Low",
  medium: "Medium",
  high: "High",
};

export const THINKING_LEVEL_ICONS: Record<
  ThinkingLevel,
  ComponentType<SVGProps<SVGSVGElement>>
> = {
  instant: Zap,
  low: BrainLowIcon,
  medium: BrainMediumIcon,
  high: BrainHighIcon,
};
