"use client";

import {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { useTheme } from "@redux/ui/components/theme";
import { cn } from "@redux/ui/lib/utils";

import {
  ensureShikiLanguage,
  getShikiHighlighter,
  getShikiTheme,
  normalizeMarkdownLanguage,
} from "./shiki-highlighter";
import { useFrameBufferedValue } from "./use-frame-buffered-value";

interface ShikiCodeBlockProps {
  code: string;
  info?: string;
  isStreaming?: boolean;
}

interface HighlightRequest {
  cacheKey: string;
  code: string;
  normalizedLanguage: string;
  theme: ReturnType<typeof getShikiTheme>;
}

interface HighlightedCodeState {
  cacheKey: string;
  html: string;
}

const STREAMING_HIGHLIGHT_DELAY_MS = 150;
const STREAMING_HIGHLIGHT_MAX_CODE_LENGTH = 12000;

function scheduleHighlightWork(callback: () => void, delay: number) {
  let idleId: number | null = null;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  const requestCallback = () => {
    if (
      typeof window !== "undefined" &&
      "requestIdleCallback" in window &&
      typeof window.requestIdleCallback === "function"
    ) {
      idleId = window.requestIdleCallback(callback, {
        timeout: STREAMING_HIGHLIGHT_DELAY_MS,
      });
      return;
    }

    callback();
  };

  if (delay > 0) {
    timeoutId = setTimeout(requestCallback, delay);
  } else {
    requestCallback();
  }

  return () => {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }

    if (idleId !== null && typeof window !== "undefined") {
      window.cancelIdleCallback(idleId);
    }
  };
}

function isPlainTextLanguage(language: string) {
  return language === "text" || language === "math";
}

export function ShikiCodeBlock({
  code,
  info,
  isStreaming = false,
}: ShikiCodeBlockProps) {
  const { resolvedTheme } = useTheme();
  const normalizedLanguage = useMemo(
    () => normalizeMarkdownLanguage(info),
    [info],
  );
  const renderedCode = useFrameBufferedValue(code, isStreaming);
  const shikiTheme = getShikiTheme(resolvedTheme);
  const request = useMemo<HighlightRequest>(
    () => ({
      cacheKey: `${shikiTheme}:${normalizedLanguage}:${renderedCode}`,
      code: renderedCode,
      normalizedLanguage,
      theme: shikiTheme,
    }),
    [normalizedLanguage, renderedCode, shikiTheme],
  );

  const [highlightedCode, setHighlightedCode] =
    useState<HighlightedCodeState | null>(null);

  const latestRequestRef = useRef(request);
  const highlightedCodeRef = useRef<HighlightedCodeState | null>(null);
  const isMountedRef = useRef(true);
  const isStreamingRef = useRef(isStreaming);
  const isHighlightRunningRef = useRef(false);
  const lastHighlightAtRef = useRef(0);
  const cancelScheduledHighlightRef = useRef<(() => void) | null>(null);
  const runHighlightRef = useRef<(() => Promise<void>) | null>(null);
  const scheduleNextHighlightRef = useRef<(() => void) | null>(null);

  const clearScheduledHighlight = useCallback(() => {
    cancelScheduledHighlightRef.current?.();
    cancelScheduledHighlightRef.current = null;
  }, []);

  useEffect(() => {
    latestRequestRef.current = request;
    isStreamingRef.current = isStreaming;
  }, [isStreaming, request]);

  useEffect(() => {
    highlightedCodeRef.current = highlightedCode;
  }, [highlightedCode]);

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
      clearScheduledHighlight();
    };
  }, [clearScheduledHighlight]);

  useEffect(() => {
    runHighlightRef.current = async () => {
      if (isHighlightRunningRef.current) {
        return;
      }

      const nextRequest = latestRequestRef.current;

      if (isPlainTextLanguage(nextRequest.normalizedLanguage)) {
        return;
      }

      isHighlightRunningRef.current = true;

      try {
        const shikiLanguage = await ensureShikiLanguage(
          nextRequest.normalizedLanguage,
        );

        if (!shikiLanguage || !isMountedRef.current) {
          return;
        }

        const highlighter = await getShikiHighlighter();
        const html = highlighter.codeToHtml(nextRequest.code, {
          lang: shikiLanguage,
          theme: nextRequest.theme,
        });

        const nextHighlightedCode = {
          cacheKey: nextRequest.cacheKey,
          html,
        };

        lastHighlightAtRef.current = performance.now();

        startTransition(() => {
          setHighlightedCode((previousHighlight) => {
            if (
              previousHighlight?.cacheKey === nextHighlightedCode.cacheKey &&
              previousHighlight.html === nextHighlightedCode.html
            ) {
              return previousHighlight;
            }

            return nextHighlightedCode;
          });
        });
      } catch {
        if (!isMountedRef.current) {
          return;
        }

        const shouldKeepPreviousHighlight =
          isStreamingRef.current && highlightedCodeRef.current !== null;

        if (!shouldKeepPreviousHighlight) {
          startTransition(() => {
            setHighlightedCode(null);
          });
        }
      } finally {
        isHighlightRunningRef.current = false;
      }

      if (latestRequestRef.current.cacheKey !== nextRequest.cacheKey) {
        scheduleNextHighlightRef.current?.();
      }
    };

    scheduleNextHighlightRef.current = () => {
      const nextRequest = latestRequestRef.current;

      if (isPlainTextLanguage(nextRequest.normalizedLanguage)) {
        return;
      }

      if (
        cancelScheduledHighlightRef.current !== null ||
        isHighlightRunningRef.current
      ) {
        return;
      }

      const highlightInterval = isStreamingRef.current
        ? nextRequest.code.length > STREAMING_HIGHLIGHT_MAX_CODE_LENGTH
          ? STREAMING_HIGHLIGHT_DELAY_MS * 2
          : STREAMING_HIGHLIGHT_DELAY_MS
        : 0;
      const elapsedSinceLastHighlight =
        performance.now() - lastHighlightAtRef.current;
      const delay = Math.max(0, highlightInterval - elapsedSinceLastHighlight);

      cancelScheduledHighlightRef.current = scheduleHighlightWork(() => {
        cancelScheduledHighlightRef.current = null;
        void runHighlightRef.current?.();
      }, delay);
    };

    return () => {
      runHighlightRef.current = null;
      scheduleNextHighlightRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (isPlainTextLanguage(normalizedLanguage)) {
      clearScheduledHighlight();

      if (highlightedCodeRef.current !== null) {
        startTransition(() => {
          setHighlightedCode(null);
        });
      }

      return;
    }

    scheduleNextHighlightRef.current?.();
  }, [clearScheduledHighlight, normalizedLanguage, request]);

  const shouldRenderHighlighted =
    highlightedCode !== null && !isPlainTextLanguage(normalizedLanguage);

  return (
    <div className="chat-markdown__code-block">
      {shouldRenderHighlighted ? (
        <div dangerouslySetInnerHTML={{ __html: highlightedCode.html }} />
      ) : (
        <pre className="chat-markdown__pre">
          <code
            className={cn(
              "font-mono text-[13px]",
              normalizedLanguage !== "text" &&
                "language-" + normalizedLanguage,
            )}
          >
            {renderedCode}
          </code>
        </pre>
      )}
    </div>
  );
}
