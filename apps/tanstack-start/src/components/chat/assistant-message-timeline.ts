import type { UIDataTypes, UIMessage, UIMessagePart, UITools } from "ai";
import { getToolName, isReasoningUIPart, isTextUIPart, isToolUIPart } from "ai";

export type AssistantTimelineStepStatus =
  | "active"
  | "complete"
  | "error"
  | "pending";

export interface AssistantTimelineSearchResult {
  title: string;
  url: string;
}

export interface AssistantTimelineStep {
  analysisDetails?: AssistantTimelineAnalysisDetails;
  content?: string;
  description?: string;
  id: string;
  kind: "reasoning" | "source" | "tool";
  origin?: "image-model";
  label: string;
  rawPartIds: string[];
  searchResults?: AssistantTimelineSearchResult[];
  status: AssistantTimelineStepStatus;
  summary?: string;
  toolName?: string;
}

export interface AssistantTimelineAnalysisDetails {
  code?: string;
  stderr: string[];
  stdout: string[];
  text?: string;
  uploadedFiles: {
    fileName: string;
    path: string;
  }[];
}

interface NormalizedAssistantMessage {
  reasoningText?: string;
  steps: AssistantTimelineStep[];
  textContent: string;
}

export function normalizeAssistantMessage(
  message: UIMessage,
): NormalizedAssistantMessage {
  const textContent = message.parts
    .filter(isTextUIPart)
    .map((part) => part.text)
    .join("");
  const indexedParts = message.parts.map((part, index) => ({
    id: `${message.id}:${index}`,
    index,
    part,
  }));
  const reasoningParts = indexedParts.filter(({ part }) =>
    isReasoningUIPart(part),
  );
  const reasoningText = joinReasoningParts(
    reasoningParts.flatMap(({ part }) =>
      isReasoningUIPart(part) ? [part.text] : [],
    ),
  );
  const hasToolOrSourceActivity = indexedParts.some(
    ({ part }) =>
      isToolUIPart(part) ||
      part.type === "source-document" ||
      part.type === "source-url",
  );
  const completedGeneratedImageKeys = getCompletedGeneratedImageKeys(
    message.parts,
  );
  const steps: AssistantTimelineStep[] = [];
  let attachableStepIndex = -1;

  for (const { id, part } of indexedParts) {
    if (isReasoningUIPart(part) && hasToolOrSourceActivity) {
      const content = part.text.trim();

      if (!content) {
        continue;
      }

      const previousStep = steps.at(-1);

      if (previousStep?.kind === "reasoning") {
        previousStep.content = joinReasoningParts([
          previousStep.content ?? "",
          content,
        ]);
        previousStep.rawPartIds.push(id);
        previousStep.status =
          part.state === "streaming" ? "active" : previousStep.status;
        attachableStepIndex = steps.length - 1;
        continue;
      }

      steps.push({
        content,
        id: `${message.id}:reasoning:${id}`,
        kind: "reasoning",
        label: "Thinking",
        rawPartIds: [id],
        status: part.state === "streaming" ? "active" : "complete",
        summary: "Thinking through the response",
      });
      attachableStepIndex = steps.length - 1;
      continue;
    }

    if (isToolUIPart(part)) {
      const toolName = getToolName(part);
      const label = getToolLabel(toolName, part.title);
      const toolStep: AssistantTimelineStep = {
        analysisDetails: getAnalysisDetails(toolName, part),
        description: getToolDescription(toolName, part),
        id: part.toolCallId,
        kind: "tool",
        label,
        rawPartIds: [id],
        searchResults: getToolSearchResults(toolName, part),
        status: mapToolStateToStatus(part.state),
        summary: getToolSummary(toolName, label, part),
        toolName,
      };

      steps.push(toolStep);
      attachableStepIndex = steps.length - 1;
      continue;
    }

    const generatedImage = normalizeGeneratedImagePart(part);
    if (generatedImage) {
      const isGenerating = generatedImage.status === "generating";
      if (
        isGenerating &&
        completedGeneratedImageKeys.has(getGeneratedImageKey(generatedImage))
      ) {
        continue;
      }

      steps.push({
        description: getGeneratedImageDescription(
          generatedImage.prompt,
          isGenerating,
        ),
        id: `${message.id}:generated-image:${id}`,
        kind: "tool",
        label: "Generate Image",
        origin: "image-model",
        rawPartIds: [id],
        status: isGenerating ? "active" : "complete",
        summary: isGenerating ? "Generating Image" : "Generated Image",
        toolName: "generate_image",
      });
      attachableStepIndex = steps.length - 1;
      continue;
    }

    if (part.type === "source-url") {
      const result = {
        title:
          part.title?.trim() && part.title.trim().length > 0
            ? part.title.trim()
            : formatSourceUrlLabel(part.url),
        url: part.url,
      };

      const targetStep = attachSearchResultToCurrentStep(
        steps,
        attachableStepIndex,
        result,
        id,
      );

      if (targetStep !== null) {
        attachableStepIndex = targetStep;
        continue;
      }

      steps.push({
        id: `${message.id}:sources`,
        kind: "source",
        label: "Sources",
        rawPartIds: [id],
        searchResults: [result],
        status: "complete",
        summary: "Collecting supporting sources",
      });
      attachableStepIndex = steps.length - 1;
      continue;
    }

    if (part.type === "source-document") {
      const targetStep = steps[attachableStepIndex];
      const sourceText = part.filename
        ? `${part.title} (${part.filename})`
        : part.title;

      if (targetStep) {
        targetStep.description = appendDescription(
          targetStep.description,
          `Source: ${sourceText}`,
        );
        targetStep.rawPartIds.push(id);
        continue;
      }

      steps.push({
        description: sourceText,
        id: `${message.id}:document-source`,
        kind: "source",
        label: "Source",
        rawPartIds: [id],
        status: "complete",
        summary: "Collecting supporting sources",
      });
      attachableStepIndex = steps.length - 1;
    }
  }

  return {
    reasoningText,
    steps,
    textContent,
  };
}

function joinReasoningParts(parts: string[]) {
  const joined = parts
    .map((part) => part.trim())
    .filter(Boolean)
    .join("\n\n");
  return joined || undefined;
}

function mapToolStateToStatus(state: string): AssistantTimelineStepStatus {
  switch (state) {
    case "input-streaming":
    case "input-available":
    case "approval-requested":
    case "approval-responded":
      return "active";
    case "output-available":
      return "complete";
    case "output-denied":
    case "output-error":
      return "error";
    default:
      return "pending";
  }
}

function humanizeToolName(toolName: string) {
  return toolName
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function getToolLabel(toolName: string, title: string | undefined) {
  switch (toolName.toLowerCase()) {
    case "generate_image":
      return "Generate Image";
    case "analysis_workspace":
      return "Analysis";
    case "bash":
      return "Bash";
    case "readfile":
      return "Read File";
    case "writefile":
      return "Write File";
    default:
      return title ?? humanizeToolName(toolName);
  }
}

function getToolDescription(
  toolName: string,
  part: Extract<UIMessagePart<UIDataTypes, UITools>, { state: string }>,
) {
  const inputText = summarizeUnknown(getToolInput(part));
  const normalizedToolName = toolName.toLowerCase();

  if (part.state === "output-error") {
    return part.errorText;
  }

  if (part.state === "output-denied") {
    return "Tool execution was denied.";
  }

  if (normalizedToolName === "search") {
    const query = getToolQuery(part);

    if (part.state === "output-available") {
      const results = getToolSearchResults(toolName, part);
      if (results.length > 0) {
        return query
          ? `Searched for "${query}" and found ${results.length} result${results.length === 1 ? "" : "s"}.`
          : `Found ${results.length} search result${results.length === 1 ? "" : "s"}.`;
      }
    }

    if (query) {
      return `Searching for "${query}"`;
    }
  }

  if (normalizedToolName === "analysis_workspace") {
    if (part.state === "output-available") {
      // const analysisDetails = getAnalysisDetails(toolName, part);
      // const outputPreview =
      //   summarizeText(
      //     [
      //       analysisDetails?.text,
      //       analysisDetails?.stdout.join("\n"),
      //       analysisDetails?.stderr.join("\n"),
      //     ]
      //       .filter(Boolean)
      //       .join("\n"),
      //   ) ?? "Executed Python analysis.";

      // return outputPreview;
      return "Executed Python analysis.";
    }

    if (part.state === "input-streaming" || part.state === "input-available") {
      return "Preparing Python analysis.";
    }
  }

  if (normalizedToolName === "generate_image") {
    const prompt = getToolPrompt(part);
    return getGeneratedImageDescription(
      prompt,
      part.state !== "output-available",
    );
  }

  if (normalizedToolName === "bash") {
    return getBashToolDescription(part);
  }

  if (normalizedToolName === "readfile") {
    return getReadFileToolDescription(part);
  }

  if (normalizedToolName === "writefile") {
    return getWriteFileToolDescription(part);
  }

  if (part.state === "output-available") {
    const outputText = summarizeUnknown(part.output);
    if (outputText) {
      return outputText;
    }
  }

  return inputText;
}

function getToolSummary(
  toolName: string,
  label: string,
  part: Extract<UIMessagePart<UIDataTypes, UITools>, { state: string }>,
) {
  const normalizedToolName = toolName.toLowerCase();
  const query = getToolQuery(part);

  if (normalizedToolName === "search" && query) {
    return part.state === "output-available"
      ? `Searched for ${formatInlineQuery(query)}`
      : `Searching for ${formatInlineQuery(query)}`;
  }

  if (normalizedToolName === "analysis_workspace") {
    switch (part.state) {
      case "output-available":
        return "Ran analysis";
      case "input-streaming":
      case "input-available":
        return "Running analysis";
      default:
        return "Analysis";
    }
  }

  if (normalizedToolName === "generate_image") {
    const prompt = getToolPrompt(part);
    const action =
      part.state === "output-available"
        ? "Generated image"
        : "Generating image";
    return prompt
      ? `${action} with prompt ${formatInlineQuery(prompt)}`
      : action;
  }

  if (normalizedToolName === "bash") {
    return part.state === "output-available"
      ? "Ran Bash command"
      : "Running Bash command";
  }

  if (normalizedToolName === "readfile") {
    return part.state === "output-available" ? "Read file" : "Reading file";
  }

  if (normalizedToolName === "writefile") {
    return part.state === "output-available" ? "Wrote file" : "Writing file";
  }

  switch (part.state) {
    case "output-error":
      return `${label} failed`;
    case "output-denied":
      return `${label} was denied`;
    case "output-available":
      return `Finished ${label.toLowerCase()}`;
    case "input-streaming":
    case "input-available":
      return `${label} in progress`;
    case "approval-requested":
    case "approval-responded":
      return `Waiting on ${label.toLowerCase()}`;
    default:
      return label;
  }
}

function getBashToolDescription(
  part: Extract<UIMessagePart<UIDataTypes, UITools>, { state: string }>,
) {
  const input = getToolInput(part);
  const command =
    isRecord(input) && typeof input.command === "string"
      ? input.command
      : undefined;
  const commandText = command
    ? `\`${summarizeText(command, 96) ?? command}\``
    : "command";

  if (part.state !== "output-available") {
    return `Running ${commandText}`;
  }

  const output = part.output;
  const exitCode =
    isRecord(output) && typeof output.exitCode === "number"
      ? output.exitCode
      : undefined;
  const stdout =
    isRecord(output) && typeof output.stdout === "string"
      ? summarizeText(output.stdout, 120)
      : undefined;
  const stderr =
    isRecord(output) && typeof output.stderr === "string"
      ? summarizeText(output.stderr, 120)
      : undefined;
  const statusText =
    exitCode === undefined ? "finished" : `exited with code ${exitCode}`;
  const outputText = stderr
    ? ` stderr: ${stderr}`
    : stdout
      ? ` output: ${stdout}`
      : "";

  return `Ran ${commandText}; ${statusText}.${outputText}`;
}

function getReadFileToolDescription(
  part: Extract<UIMessagePart<UIDataTypes, UITools>, { state: string }>,
) {
  const path = getToolPath(part);
  const pathText = path ? `\`${path}\`` : "file";

  if (part.state !== "output-available") {
    return `Reading ${pathText}`;
  }

  const output = part.output;
  const contentLength =
    isRecord(output) && typeof output.content === "string"
      ? output.content.length
      : undefined;

  return contentLength === undefined
    ? `Read ${pathText}.`
    : `Read ${pathText} (${contentLength.toLocaleString()} characters).`;
}

function getWriteFileToolDescription(
  part: Extract<UIMessagePart<UIDataTypes, UITools>, { state: string }>,
) {
  const path = getToolPath(part);
  const pathText = path ? `\`${path}\`` : "file";

  return part.state === "output-available"
    ? `Wrote ${pathText}.`
    : `Writing ${pathText}`;
}

function getToolInput(
  part: Extract<UIMessagePart<UIDataTypes, UITools>, { state: string }>,
) {
  if ("input" in part) {
    return part.input;
  }

  return undefined;
}

function getToolQuery(
  part: Extract<UIMessagePart<UIDataTypes, UITools>, { state: string }>,
) {
  const input = getToolInput(part);
  return isRecord(input) && typeof input.query === "string"
    ? input.query
    : undefined;
}

function getToolPrompt(
  part: Extract<UIMessagePart<UIDataTypes, UITools>, { state: string }>,
) {
  const input = getToolInput(part);
  return isRecord(input) && typeof input.prompt === "string"
    ? input.prompt
    : undefined;
}

function getToolPath(
  part: Extract<UIMessagePart<UIDataTypes, UITools>, { state: string }>,
) {
  const input = getToolInput(part);
  return isRecord(input) && typeof input.path === "string"
    ? input.path
    : undefined;
}

function getToolSearchResults(
  toolName: string,
  part: Extract<UIMessagePart<UIDataTypes, UITools>, { state: string }>,
) {
  if (
    toolName.toLowerCase() !== "search" ||
    part.state !== "output-available"
  ) {
    return [];
  }

  const candidates = extractSearchResultCandidates(part.output);
  return dedupeSearchResults(candidates);
}

function getAnalysisDetails(
  toolName: string,
  part: Extract<UIMessagePart<UIDataTypes, UITools>, { state: string }>,
): AssistantTimelineAnalysisDetails | undefined {
  if (toolName.toLowerCase() !== "analysis_workspace") {
    return undefined;
  }

  const input = getToolInput(part);
  const output = part.state === "output-available" ? part.output : undefined;

  const code =
    isRecord(input) && typeof input.code === "string" ? input.code : undefined;
  const stdout = readStringArray(output, "logs", "stdout");
  const stderr = readStringArray(output, "logs", "stderr");
  const text =
    isRecord(output) && typeof output.text === "string"
      ? output.text
      : undefined;
  const uploadedFiles = readUploadedFiles(output);

  if (!code && !text && stdout.length === 0 && stderr.length === 0) {
    return undefined;
  }

  return {
    code,
    stderr,
    stdout,
    text,
    uploadedFiles,
  };
}

function extractSearchResultCandidates(
  value: unknown,
): AssistantTimelineSearchResult[] {
  if (Array.isArray(value)) {
    return value.flatMap(extractSearchResultCandidates);
  }

  if (!isRecord(value)) {
    return [];
  }

  const directResult = toSearchResult(value);
  if (directResult) {
    return [directResult];
  }

  return Object.values(value).flatMap(extractSearchResultCandidates);
}

function toSearchResult(value: Record<string, unknown>) {
  if (typeof value.url !== "string") {
    return null;
  }

  const title =
    typeof value.title === "string" && value.title.trim()
      ? value.title.trim()
      : formatSourceUrlLabel(value.url);

  return {
    title,
    url: value.url,
  };
}

function dedupeSearchResults(results: AssistantTimelineSearchResult[]) {
  const unique = new Map<string, AssistantTimelineSearchResult>();

  for (const result of results) {
    if (!result.url) {
      continue;
    }

    unique.set(result.url, result);
  }

  return Array.from(unique.values());
}

function attachSearchResultToCurrentStep(
  steps: AssistantTimelineStep[],
  currentStepIndex: number,
  result: AssistantTimelineSearchResult,
  rawPartId: string,
) {
  const targetStep = steps[currentStepIndex];

  if (!targetStep) {
    return null;
  }

  targetStep.searchResults = dedupeSearchResults([
    ...(targetStep.searchResults ?? []),
    result,
  ]);
  targetStep.rawPartIds.push(rawPartId);

  return currentStepIndex;
}

function summarizeUnknown(value: unknown): string | undefined {
  if (value == null) {
    return undefined;
  }

  if (typeof value === "string") {
    return summarizeText(value);
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return undefined;
    }

    const preview: string = value
      .slice(0, 3)
      .map((item) => summarizeUnknown(item))
      .filter(Boolean)
      .join(" | ");

    return summarizeText(preview);
  }

  if (isRecord(value)) {
    const preferredKeys = [
      "query",
      "prompt",
      "summary",
      "title",
      "text",
      "message",
    ];
    for (const key of preferredKeys) {
      const candidate = value[key];
      if (typeof candidate === "string" && candidate.trim()) {
        return summarizeText(candidate);
      }
    }

    try {
      return summarizeText(JSON.stringify(value));
    } catch {
      return undefined;
    }
  }

  return undefined;
}

function summarizeText(value: string, maxLength = 180) {
  const normalized = value.replace(/\s+/g, " ").trim();

  if (!normalized) {
    return undefined;
  }

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 1).trimEnd()}...`;
}

function appendDescription(existing: string | undefined, next: string) {
  return existing ? `${existing}\n${next}` : next;
}

function formatSourceUrlLabel(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function formatInlineQuery(query: string) {
  return `"${summarizeText(query, 80) ?? query}"`;
}

function getGeneratedImageDescription(
  prompt: string | undefined,
  isGenerating: boolean,
) {
  const action = isGenerating ? "Generating image" : "Generated image";
  return prompt
    ? `${action} with prompt ${formatInlineQuery(prompt)}.`
    : `${action}.`;
}

interface GeneratedImageTimelinePart {
  type: "data-generated-image";
  modelId?: string;
  prompt?: string;
  status?: "generating" | "generated";
}

function normalizeGeneratedImagePart(
  part: unknown,
): GeneratedImageTimelinePart | null {
  if (
    typeof part === "object" &&
    part !== null &&
    "type" in part &&
    part.type === "data-generated-image"
  ) {
    if ("data" in part) {
      return normalizeGeneratedImagePart(part.data);
    }

    return part as GeneratedImageTimelinePart;
  }

  return null;
}

function getCompletedGeneratedImageKeys(
  parts: UIMessagePart<UIDataTypes, UITools>[],
) {
  const keys = new Set<string>();

  for (const part of parts) {
    const generatedImage = normalizeGeneratedImagePart(part);
    if (generatedImage && generatedImage.status !== "generating") {
      keys.add(getGeneratedImageKey(generatedImage));
    }
  }

  return keys;
}

function getGeneratedImageKey(image: GeneratedImageTimelinePart) {
  return `${image.modelId ?? ""}:${image.prompt ?? ""}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readStringArray(
  value: unknown,
  firstKey: string,
  secondKey: string,
): string[] {
  if (!isRecord(value)) {
    return [];
  }

  const firstLevel = value[firstKey];
  if (!isRecord(firstLevel)) {
    return [];
  }

  const candidate = firstLevel[secondKey];
  if (!Array.isArray(candidate)) {
    return [];
  }

  return candidate.filter((item): item is string => typeof item === "string");
}

function readUploadedFiles(value: unknown) {
  if (!isRecord(value) || !Array.isArray(value.uploadedFiles)) {
    return [];
  }

  return value.uploadedFiles.flatMap((file) => {
    if (!isRecord(file)) {
      return [];
    }

    if (typeof file.fileName !== "string" || typeof file.path !== "string") {
      return [];
    }

    return [
      {
        fileName: file.fileName,
        path: file.path,
      },
    ];
  });
}
