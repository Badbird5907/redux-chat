import {
  BrainIcon,
  CheckIcon,
  FileTextIcon,
  FlaskConicalIcon,
  GlobeIcon,
  ImageIcon,
  SearchIcon,
  TerminalIcon,
  WrenchIcon,
} from "lucide-react";

import type { AssistantTimelineStep } from "./assistant-message-timeline";

export function getAssistantStepIcon(step: AssistantTimelineStep) {
  if (step.kind === "reasoning") {
    return BrainIcon;
  }

  if (step.kind === "source") {
    return GlobeIcon;
  }

  if (step.label.toLowerCase().includes("search")) {
    return SearchIcon;
  }

  if (step.toolName?.toLowerCase() === "analysis_workspace") {
    return FlaskConicalIcon;
  }

  if (step.toolName?.toLowerCase() === "generate_image") {
    return ImageIcon;
  }

  if (step.toolName?.toLowerCase() === "bash") {
    return TerminalIcon;
  }

  if (
    step.toolName?.toLowerCase() === "readfile" ||
    step.toolName?.toLowerCase() === "writefile"
  ) {
    return FileTextIcon;
  }

  return WrenchIcon;
}

export function getChainOfThoughtHeaderState(steps: AssistantTimelineStep[]) {
  const activeStep =
    [...steps].reverse().find((step) => step.status === "active") ??
    [...steps].reverse().find((step) => step.status === "pending");

  if (activeStep) {
    return {
      icon: getAssistantStepIcon(activeStep),
      label: activeStep.summary ?? activeStep.label,
      status: activeStep.status,
    } as const;
  }

  const errorCount = steps.filter((step) => step.status === "error").length;
  const completeCount = steps.filter(
    (step) => step.status === "complete",
  ).length;
  const totalCount = steps.length;
  const onlyStep = totalCount === 1 ? steps[0] : undefined;

  if (errorCount > 0) {
    return {
      icon: WrenchIcon,
      label: `Completed ${completeCount} of ${totalCount} steps`,
      status: "error",
    } as const;
  }

  if (onlyStep?.summary) {
    return {
      icon: getAssistantStepIcon(onlyStep),
      label: onlyStep.summary,
      status: "complete",
    } as const;
  }

  return {
    icon: CheckIcon,
    label: `Completed ${totalCount} step${totalCount === 1 ? "" : "s"}`,
    status: "complete",
  } as const;
}
