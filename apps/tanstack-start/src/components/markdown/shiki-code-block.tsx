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
  getShikiTheme,
  isPlainTextLanguage,
  normalizeMarkdownLanguage,
} from "./shiki-highlighter";
import {
  getHighlightedHtmlFromCache,
  highlightCodeInWorker,
  prewarmShikiWorker,
} from "./shiki-worker-client";

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

const STREAMING_CODE_TEXT_DELAY_MS = 64;

let hasPrewarmedShikiWorker = false;

function scheduleCodeFlush(callback: () => void, delay: number) {
  const timeoutId = setTimeout(callback, delay);

  return () => {
    clearTimeout(timeoutId);
  };
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
  const [displayedCode, setDisplayedCode] = useState(code);
  const shikiTheme = getShikiTheme(resolvedTheme);
  const request = useMemo<HighlightRequest>(
    () => ({
      cacheKey: `${shikiTheme}:${normalizedLanguage}:${displayedCode}`,
      code: displayedCode,
      normalizedLanguage,
      theme: shikiTheme,
    }),
    [displayedCode, normalizedLanguage, shikiTheme],
  );

  const [highlightedCode, setHighlightedCode] =
    useState<HighlightedCodeState | null>(null);

  const latestCodeRef = useRef(code);
  const latestRequestRef = useRef(request);
  const highlightedCodeRef = useRef<HighlightedCodeState | null>(null);
  const isMountedRef = useRef(true);
  const cancelCodeFlushRef = useRef<(() => void) | null>(null);
  const inFlightRequestRef = useRef<HighlightRequest | null>(null);
  const queuedRequestRef = useRef<HighlightRequest | null>(null);
  const latestIssuedCacheKeyRef = useRef(request.cacheKey);
  const latestResolvedCacheKeyRef = useRef<string | null>(null);

  const clearScheduledCodeFlush = useCallback(() => {
    cancelCodeFlushRef.current?.();
    cancelCodeFlushRef.current = null;
  }, []);

  // Ref used to break the circular self-reference inside processHighlightRequest's useCallback
  const processHighlightRequestRef = useRef<
    ((nextRequest: HighlightRequest) => void) | null
  >(null);

  const applyHighlightedCode = useCallback(
    (nextHighlightedCode: HighlightedCodeState) => {
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
    },
    [],
  );

  const processHighlightRequest = useCallback(
    (nextRequest: HighlightRequest) => {
      if (isPlainTextLanguage(nextRequest.normalizedLanguage)) {
        return;
      }

      const cachedHtml = getHighlightedHtmlFromCache(nextRequest.cacheKey);
      if (cachedHtml !== null) {
        latestResolvedCacheKeyRef.current = nextRequest.cacheKey;
        applyHighlightedCode({
          cacheKey: nextRequest.cacheKey,
          html: cachedHtml,
        });
        return;
      }

      if (inFlightRequestRef.current !== null) {
        queuedRequestRef.current = nextRequest;
        latestIssuedCacheKeyRef.current = nextRequest.cacheKey;
        return;
      }

      inFlightRequestRef.current = nextRequest;
      latestIssuedCacheKeyRef.current = nextRequest.cacheKey;

      void highlightCodeInWorker({
        cacheKey: nextRequest.cacheKey,
        code: nextRequest.code,
        language: nextRequest.normalizedLanguage,
        theme: nextRequest.theme,
      })
        .then((result) => {
          if (!isMountedRef.current) {
            return;
          }

          inFlightRequestRef.current = null;
          latestResolvedCacheKeyRef.current = result.cacheKey;

          if (latestRequestRef.current.cacheKey === result.cacheKey) {
            applyHighlightedCode(result);
          }

          const queuedRequest = queuedRequestRef.current;
          queuedRequestRef.current = null;

          if (
            queuedRequest !== null &&
            queuedRequest.cacheKey !== result.cacheKey
          ) {
            processHighlightRequestRef.current?.(queuedRequest);
          }
        })
        .catch(() => {
          if (!isMountedRef.current) {
            return;
          }

          inFlightRequestRef.current = null;

          const queuedRequest = queuedRequestRef.current;
          queuedRequestRef.current = null;

          if (queuedRequest !== null) {
            processHighlightRequestRef.current?.(queuedRequest);
            return;
          }

          if (latestRequestRef.current.cacheKey !== nextRequest.cacheKey) {
            return;
          }

          latestResolvedCacheKeyRef.current = null;
          startTransition(() => {
            setHighlightedCode(null);
          });
        });
    },
    [applyHighlightedCode],
  );

  // Keep the ref pointing at the latest stable callback so recursive calls
  // inside the callback body don't form a self-referential const initializer.
  useEffect(() => {
    processHighlightRequestRef.current = processHighlightRequest;
  }, [processHighlightRequest]);

  useEffect(() => {
    latestCodeRef.current = code;

    if (!isStreaming) {
      clearScheduledCodeFlush();
      startTransition(() => {
        setDisplayedCode((previousCode) =>
          previousCode === code ? previousCode : code,
        );
      });
      return;
    }

    if (
      cancelCodeFlushRef.current !== null ||
      displayedCode === latestCodeRef.current
    ) {
      return;
    }

    cancelCodeFlushRef.current = scheduleCodeFlush(() => {
      cancelCodeFlushRef.current = null;
      const nextCode = latestCodeRef.current;

      setDisplayedCode((previousCode) =>
        previousCode === nextCode ? previousCode : nextCode,
      );
    }, STREAMING_CODE_TEXT_DELAY_MS);
  }, [clearScheduledCodeFlush, code, displayedCode, isStreaming]);

  useEffect(() => {
    latestRequestRef.current = request;
  }, [request]);

  useEffect(() => {
    highlightedCodeRef.current = highlightedCode;
  }, [highlightedCode]);

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
      clearScheduledCodeFlush();
      queuedRequestRef.current = null;
    };
  }, [clearScheduledCodeFlush]);

  useEffect(() => {
    if (
      hasPrewarmedShikiWorker ||
      isPlainTextLanguage(normalizedLanguage) ||
      displayedCode.length === 0
    ) {
      return;
    }

    hasPrewarmedShikiWorker = true;
    prewarmShikiWorker();
  }, [displayedCode.length, normalizedLanguage]);

  useEffect(() => {
    if (isPlainTextLanguage(request.normalizedLanguage)) {
      queuedRequestRef.current = null;
      latestResolvedCacheKeyRef.current = null;

      if (highlightedCodeRef.current !== null) {
        startTransition(() => {
          setHighlightedCode(null);
        });
      }
      return;
    }

    const cachedHtml = getHighlightedHtmlFromCache(request.cacheKey);
    if (cachedHtml !== null) {
      latestResolvedCacheKeyRef.current = request.cacheKey;
      applyHighlightedCode({
        cacheKey: request.cacheKey,
        html: cachedHtml,
      });
      return;
    }

    if (
      latestResolvedCacheKeyRef.current === request.cacheKey ||
      inFlightRequestRef.current?.cacheKey === request.cacheKey ||
      queuedRequestRef.current?.cacheKey === request.cacheKey
    ) {
      return;
    }

    processHighlightRequest(request);
  }, [applyHighlightedCode, processHighlightRequest, request]);

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
            {displayedCode}
          </code>
        </pre>
      )}
    </div>
  );
}
