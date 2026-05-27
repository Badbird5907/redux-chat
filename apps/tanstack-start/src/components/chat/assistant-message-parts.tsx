"use client";

import type { UIMessage } from "ai";
import { isReasoningUIPart, isTextUIPart, isToolUIPart } from "ai";
import { CopyIcon, DownloadIcon, ExternalLinkIcon } from "lucide-react";

import type { MessageStats } from "./chat-types";
import {
  ChainOfThought,
  ChainOfThoughtContent,
  ChainOfThoughtHeader,
  ChainOfThoughtSearchResult,
  ChainOfThoughtSearchResults,
  ChainOfThoughtStep,
} from "@/components/ai/chain-of-thought";
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "@/components/ai/reasoning";
import { AnalysisDetailsButton } from "@/components/chat/tools/analysis";
import { StreamingMarkdown } from "@/components/markdown/streaming-markdown";
import {
  getAssistantStepIcon,
  getChainOfThoughtHeaderState,
} from "./assistant-message-helpers";
import { normalizeAssistantMessage } from "./assistant-message-timeline";

export function AssistantMessageParts({
  isLastMessage,
  isStreaming,
  message,
  messageStats,
}: {
  isLastMessage: boolean;
  isStreaming: boolean;
  message: UIMessage;
  messageStats?: MessageStats;
}) {
  const { reasoningText, steps, textContent } =
    normalizeAssistantMessage(message);
  const hasTimelineReasoning = steps.some((step) => step.kind === "reasoning");
  const isReasoningStreaming =
    isStreaming && message.parts.at(-1)?.type === "reasoning";
  const hasActiveOrErroredStep = steps.some(
    (step) => step.status === "active" || step.status === "error",
  );
  const hasActiveMessagePart = message.parts.some((part) => {
    if (isReasoningUIPart(part)) {
      return part.state === "streaming";
    }

    if (isToolUIPart(part)) {
      return (
        part.state === "input-streaming" ||
        part.state === "input-available" ||
        part.state === "approval-requested" ||
        part.state === "approval-responded"
      );
    }

    return false;
  });
  const isChainActive =
    isLastMessage &&
    steps.length > 0 &&
    (isStreaming || hasActiveMessagePart || textContent.trim().length === 0);
  const defaultChainOpen =
    isLastMessage &&
    steps.length > 0 &&
    (isChainActive || hasActiveOrErroredStep);
  const headerState = getChainOfThoughtHeaderState(steps);
  const activeStepId =
    [...steps].reverse().find((step) => step.status === "active")?.id ??
    [...steps].reverse().find((step) => step.status === "pending")?.id ??
    (isChainActive ? steps.at(-1)?.id : undefined);
  const activeStep = steps.find((step) => step.id === activeStepId);
  const headerIcon =
    isChainActive && activeStep
      ? getAssistantStepIcon(activeStep)
      : headerState.icon;
  const headerLabel =
    isChainActive && activeStep
      ? (activeStep.summary ?? activeStep.label)
      : headerState.label;
  const headerStatus = isChainActive ? "active" : headerState.status;

  return (
    <>
      {reasoningText && !hasTimelineReasoning ? (
        <Reasoning
          className="mb-3"
          defaultOpen={isReasoningStreaming}
          duration={messageStats?.generationStats?.reasoningDurationMs}
          isStreaming={isReasoningStreaming}
          key={`${message.id}:reasoning:${isReasoningStreaming ? "streaming" : "done"}`}
        >
          <ReasoningTrigger />
          <ReasoningContent>
            <StreamingMarkdown
              content={reasoningText}
              isStreaming={isReasoningStreaming}
              reasoning
            />
          </ReasoningContent>
        </Reasoning>
      ) : null}

      {steps.length > 0 ? (
        <ChainOfThought
          className="mb-3"
          defaultOpen={defaultChainOpen}
          key={`${message.id}:chain`}
        >
          <ChainOfThoughtHeader
            icon={headerIcon}
            shimmer={isChainActive || headerStatus === "active"}
            status={headerStatus}
          >
            {headerLabel}
          </ChainOfThoughtHeader>
          <ChainOfThoughtContent>
            {steps.map((step) => (
              <ChainOfThoughtStep
                description={step.description}
                icon={getAssistantStepIcon(step)}
                key={step.id}
                label={step.label}
                shimmer={step.id === activeStepId}
                status={step.id === activeStepId ? "active" : step.status}
              >
                {step.kind === "reasoning" && step.content ? (
                  <div className="border-border/80 text-muted-foreground max-h-48 overflow-y-auto border-l pr-2 pl-4 text-sm">
                    <StreamingMarkdown
                      content={step.content}
                      isStreaming={step.status === "active"}
                      reasoning
                    />
                  </div>
                ) : null}

                {step.searchResults?.length ? (
                  <ChainOfThoughtSearchResults>
                    {step.searchResults.map((result) => (
                      <ChainOfThoughtSearchResult
                        href={result.url}
                        key={`${step.id}:${result.url}`}
                        rel="noreferrer"
                      >
                        {result.title}
                      </ChainOfThoughtSearchResult>
                    ))}
                  </ChainOfThoughtSearchResults>
                ) : null}

                {step.analysisDetails ? (
                  <AnalysisDetailsButton
                    details={step.analysisDetails}
                    status={step.status}
                  />
                ) : null}
              </ChainOfThoughtStep>
            ))}
          </ChainOfThoughtContent>
        </ChainOfThought>
      ) : null}

      <div className="space-y-3">
        {message.parts.map((part, index) => {
          if (isTextUIPart(part) && part.text) {
            return (
              <StreamingMarkdown
                content={part.text}
                isStreaming={isStreaming}
                key={`${message.id}:text:${index}`}
              />
            );
          }

          if (isGeneratedImagePart(part)) {
            return (
              <GeneratedImageBlock
                image={part}
                key={`${message.id}:generated-image:${index}`}
              />
            );
          }

          const toolOutput = isToolUIPart(part)
            ? getToolOutput(part)
            : undefined;
          if (isGeneratedImagePart(toolOutput)) {
            return (
              <GeneratedImageBlock
                image={toolOutput}
                key={`${message.id}:tool-generated-image:${index}`}
              />
            );
          }

          return null;
        })}
      </div>
    </>
  );
}

function getToolOutput(part: unknown): unknown {
  return typeof part === "object" && part !== null && "output" in part
    ? part.output
    : undefined;
}

export { getAssistantStepIcon } from "./assistant-message-helpers";

interface GeneratedImagePart {
  type: "data-generated-image";
  url: string;
  downloadUrl: string;
  mimeType: string;
  prompt: string;
  modelId: string;
  provider: string;
  createdAt: number;
}

function isGeneratedImagePart(part: unknown): part is GeneratedImagePart {
  return (
    typeof part === "object" &&
    part !== null &&
    "type" in part &&
    part.type === "data-generated-image" &&
    "url" in part &&
    typeof part.url === "string"
  );
}

function GeneratedImageBlock({ image }: { image: GeneratedImagePart }) {
  return (
    <figure className="border-border bg-card overflow-hidden rounded-lg border">
      <a href={image.url} target="_blank" rel="noreferrer">
        <img
          src={image.url}
          alt={image.prompt}
          className="max-h-[640px] w-full object-contain"
          loading="lazy"
        />
      </a>
      <figcaption className="border-border bg-muted/40 flex items-center justify-between gap-3 border-t px-3 py-2">
        <span className="text-muted-foreground min-w-0 truncate text-xs">
          {image.modelId}
        </span>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            className="hover:bg-muted rounded-md p-1.5"
            title="Copy image URL"
            onClick={() => void navigator.clipboard.writeText(image.url)}
          >
            <CopyIcon className="size-4" />
          </button>
          <a
            className="hover:bg-muted rounded-md p-1.5"
            href={image.downloadUrl}
            title="Download image"
          >
            <DownloadIcon className="size-4" />
          </a>
          <a
            className="hover:bg-muted rounded-md p-1.5"
            href={image.url}
            target="_blank"
            rel="noreferrer"
            title="Open image"
          >
            <ExternalLinkIcon className="size-4" />
          </a>
        </div>
      </figcaption>
    </figure>
  );
}
