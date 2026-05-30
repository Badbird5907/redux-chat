"use client";

import type { UIMessage } from "ai";
import type React from "react";
import { isReasoningUIPart, isTextUIPart, isToolUIPart } from "ai";
import {
  CopyIcon,
  DownloadIcon,
  ExternalLinkIcon,
  ImageIcon,
} from "lucide-react";

import { Skeleton } from "@redux/ui/components/skeleton";

import type { AssistantTimelineStep } from "./assistant-message-timeline";
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
import { Shimmer } from "@/components/ai/shimmer";
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
  const imageModelStep = [...steps]
    .reverse()
    .find((step) => step.origin === "image-model");
  const chainSteps = steps.filter((step) => step.origin !== "image-model");
  const hasTimelineReasoning = chainSteps.some(
    (step) => step.kind === "reasoning",
  );
  const isReasoningStreaming =
    isStreaming && message.parts.at(-1)?.type === "reasoning";
  const hasActiveOrErroredStep = chainSteps.some(
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
    chainSteps.length > 0 &&
    (isStreaming || hasActiveMessagePart || textContent.trim().length === 0);
  const defaultChainOpen =
    isLastMessage &&
    chainSteps.length > 0 &&
    (isChainActive || hasActiveOrErroredStep);
  const headerState = getChainOfThoughtHeaderState(chainSteps);
  const activeStepId =
    [...chainSteps].reverse().find((step) => step.status === "active")?.id ??
    [...chainSteps].reverse().find((step) => step.status === "pending")?.id ??
    (isChainActive ? chainSteps.at(-1)?.id : undefined);
  const activeStep = chainSteps.find((step) => step.id === activeStepId);
  const headerIcon =
    isChainActive && activeStep
      ? getAssistantStepIcon(activeStep)
      : headerState.icon;
  const headerLabel =
    isChainActive && activeStep
      ? (activeStep.summary ?? activeStep.label)
      : headerState.label;
  const headerStatus = isChainActive ? "active" : headerState.status;
  const generatedImagesByUrl = getGeneratedImagesByUrl(message);
  const completedGeneratedImageKeys = getCompletedGeneratedImageKeys(message);
  const renderedGeneratedImageUrls = new Set<string>();

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

      {imageModelStep ? <ImageModelStatus step={imageModelStep} /> : null}

      {chainSteps.length > 0 ? (
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
            {chainSteps.map((step) => (
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
            return renderTextWithGeneratedImages({
              content: part.text,
              completedGeneratedImageKeys,
              generatedImagesByUrl,
              isStreaming,
              keyPrefix: `${message.id}:text:${index}`,
              renderedGeneratedImageUrls,
            });
          }

          const generatedImage = normalizeGeneratedImagePart(part);
          if (generatedImage) {
            if (
              generatedImage.status === "generating" &&
              completedGeneratedImageKeys.has(
                getGeneratedImageKey(generatedImage),
              )
            ) {
              return null;
            }
            if (
              generatedImage.url &&
              renderedGeneratedImageUrls.has(generatedImage.url)
            ) {
              return null;
            }
            if (generatedImage.url) {
              renderedGeneratedImageUrls.add(generatedImage.url);
            }
            return (
              <GeneratedImageBlock
                image={generatedImage}
                key={`${message.id}:generated-image:${getGeneratedImageKey(generatedImage)}`}
              />
            );
          }

          return null;
        })}
      </div>
    </>
  );
}

function ImageModelStatus({ step }: { step: AssistantTimelineStep }) {
  const isGenerating = step.status === "active";
  const label = isGenerating ? "Generating Image" : "Generated Image";

  return (
    <div className="text-muted-foreground mb-3 flex items-center gap-2 text-sm">
      <ImageIcon className="size-4 shrink-0" />
      {isGenerating ? (
        <Shimmer as="span" className="text-sm" duration={1.8}>
          {label}
        </Shimmer>
      ) : (
        <span>{label}</span>
      )}
    </div>
  );
}

function getToolOutput(part: unknown): unknown {
  return typeof part === "object" && part !== null && "output" in part
    ? part.output
    : undefined;
}

const MARKDOWN_IMAGE_RE = /!\[[^\]]*]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;

function getGeneratedImagesByUrl(message: UIMessage) {
  const images = new Map<string, GeneratedImagePart>();

  for (const part of message.parts) {
    const directImage = normalizeGeneratedImagePart(part);
    if (directImage?.url) {
      images.set(directImage.url, directImage);
    }

    const toolImage = isToolUIPart(part)
      ? normalizeGeneratedImagePart(getToolOutput(part))
      : undefined;
    if (toolImage?.url) {
      images.set(toolImage.url, toolImage);
    }
  }

  return images;
}

function getCompletedGeneratedImageKeys(message: UIMessage) {
  const keys = new Set<string>();

  for (const part of message.parts) {
    const directImage = normalizeGeneratedImagePart(part);
    if (directImage && directImage.status !== "generating") {
      keys.add(getGeneratedImageKey(directImage));
    }

    const toolImage = isToolUIPart(part)
      ? normalizeGeneratedImagePart(getToolOutput(part))
      : undefined;
    if (toolImage && toolImage.status !== "generating") {
      keys.add(getGeneratedImageKey(toolImage));
    }
  }

  return keys;
}

function renderTextWithGeneratedImages({
  content,
  completedGeneratedImageKeys,
  generatedImagesByUrl,
  isStreaming,
  keyPrefix,
  renderedGeneratedImageUrls,
}: {
  content: string;
  completedGeneratedImageKeys: Set<string>;
  generatedImagesByUrl: Map<string, GeneratedImagePart>;
  isStreaming: boolean;
  keyPrefix: string;
  renderedGeneratedImageUrls: Set<string>;
}) {
  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;

  for (const match of content.matchAll(MARKDOWN_IMAGE_RE)) {
    const fullMatch = match[0];
    const url = match[1];
    const image = url ? generatedImagesByUrl.get(url) : undefined;
    const matchIndex = match.index;

    if (
      !image ||
      !completedGeneratedImageKeys.has(getGeneratedImageKey(image))
    ) {
      continue;
    }

    const before = content.slice(lastIndex, matchIndex);
    if (before.trim()) {
      nodes.push(
        <StreamingMarkdown
          content={before}
          isStreaming={isStreaming}
          key={`${keyPrefix}:markdown:${nodes.length}`}
        />,
      );
    }

    if (image.url && !renderedGeneratedImageUrls.has(image.url)) {
      renderedGeneratedImageUrls.add(image.url);
      nodes.push(
        <GeneratedImageBlock
          image={image}
          key={`${keyPrefix}:generated-image:${nodes.length}`}
        />,
      );
    }

    lastIndex = matchIndex + fullMatch.length;
  }

  if (nodes.length === 0) {
    return (
      <StreamingMarkdown
        content={content}
        isStreaming={isStreaming}
        key={keyPrefix}
      />
    );
  }

  const after = content.slice(lastIndex);
  if (after.trim()) {
    nodes.push(
      <StreamingMarkdown
        content={after}
        isStreaming={isStreaming}
        key={`${keyPrefix}:markdown:${nodes.length}`}
      />,
    );
  }

  return nodes;
}

interface GeneratedImagePart {
  type: "data-generated-image";
  url?: string;
  downloadUrl?: string;
  mimeType?: string;
  prompt: string;
  modelId: string;
  provider: string;
  createdAt: number;
  status?: "generating" | "generated";
}

function normalizeGeneratedImagePart(part: unknown): GeneratedImagePart | null {
  if (
    typeof part === "object" &&
    part !== null &&
    "type" in part &&
    part.type === "data-generated-image" &&
    "prompt" in part &&
    typeof part.prompt === "string" &&
    "modelId" in part &&
    typeof part.modelId === "string"
  ) {
    return part as GeneratedImagePart;
  }

  if (
    typeof part === "object" &&
    part !== null &&
    "type" in part &&
    part.type === "data-generated-image" &&
    "data" in part
  ) {
    return normalizeGeneratedImagePart(part.data);
  }

  return null;
}

function getGeneratedImageKey(image: GeneratedImagePart) {
  return `${image.modelId}:${image.prompt}`;
}

function getGeneratedImageFilename(image: GeneratedImagePart) {
  const slug =
    image.prompt
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "image";
  const ext =
    image.mimeType === "image/jpeg"
      ? "jpg"
      : image.mimeType === "image/webp"
        ? "webp"
        : "png";
  return `${slug}.${ext}`;
}

async function downloadGeneratedImage(image: GeneratedImagePart) {
  const src = image.downloadUrl ?? image.url;
  if (!src) return;
  try {
    const response = await fetch(src);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = getGeneratedImageFilename(image);
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(objectUrl);
  } catch (error) {
    console.error("Failed to download image", error);
    window.open(src, "_blank", "noopener,noreferrer");
  }
}

function GeneratedImageBlock({ image }: { image: GeneratedImagePart }) {
  const isGenerating = image.status === "generating" || !image.url;

  return (
    <figure className="border-border bg-card overflow-hidden rounded-lg border">
      {isGenerating ? (
        <div className="bg-muted/20 relative aspect-video w-full overflow-hidden">
          <Skeleton className="absolute inset-0 h-full w-full rounded-none" />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-muted-foreground text-sm">
              Generating image&hellip;
            </div>
          </div>
        </div>
      ) : (
        <a href={image.url} target="_blank" rel="noreferrer">
          <img
            src={image.url}
            alt={image.prompt}
            className="max-h-[640px] w-full object-contain"
            loading="lazy"
          />
        </a>
      )}
      <figcaption className="border-border bg-muted/40 flex items-center justify-between gap-3 border-t px-3 py-2">
        <span className="text-muted-foreground min-w-0 truncate text-xs">
          {image.modelId}
        </span>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            className="hover:bg-muted disabled:text-muted-foreground/40 rounded-md p-1.5 disabled:pointer-events-none"
            title="Copy image URL"
            disabled={!image.url}
            onClick={() =>
              image.url
                ? void navigator.clipboard.writeText(image.url)
                : undefined
            }
          >
            <CopyIcon className="size-4" />
          </button>
          <button
            type="button"
            className="hover:bg-muted disabled:text-muted-foreground/40 rounded-md p-1.5 disabled:pointer-events-none"
            title="Download image"
            disabled={!image.downloadUrl && !image.url}
            onClick={() => void downloadGeneratedImage(image)}
          >
            <DownloadIcon className="size-4" />
          </button>
          {image.url ? (
            <a
              className="hover:bg-muted rounded-md p-1.5"
              href={image.url}
              target="_blank"
              rel="noreferrer"
              title="Open image"
            >
              <ExternalLinkIcon className="size-4" />
            </a>
          ) : (
            <span className="text-muted-foreground/40 rounded-md p-1.5">
              <ExternalLinkIcon className="size-4" />
            </span>
          )}
        </div>
      </figcaption>
    </figure>
  );
}
