"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { normalizeMarkdownMathDelimiters } from "./normalize-markdown-math";
import { parseMarkdownIntoBlocks } from "./parse-markdown-into-blocks";
import type { MarkdownBlock } from "./parse-markdown-into-blocks";

interface MarkdownWorkerResponse {
  id: number;
  normalizedContent: string;
  blocks: MarkdownBlock[];
}

interface MarkdownWorkerState {
  normalizedContent: string;
  blocks: MarkdownBlock[];
}

function parseOnMainThread(content: string): MarkdownWorkerState {
  const normalizedContent = normalizeMarkdownMathDelimiters(content);

  return {
    normalizedContent,
    blocks: parseMarkdownIntoBlocks(normalizedContent),
  };
}

export function useMarkdownWorker(content: string, enabled = true) {
  const workerRef = useRef<Worker | null>(null);
  const requestIdRef = useRef(0);
  const [state, setState] = useState<MarkdownWorkerState>(() =>
    parseOnMainThread(content),
  );

  const fallbackState = useMemo(() => parseOnMainThread(content), [content]);
  const canUseWorker = enabled && typeof Worker !== "undefined";

  useEffect(() => {
    if (!canUseWorker) {
      return;
    }

    workerRef.current ??= new Worker(
      new URL("./markdown-worker.ts", import.meta.url),
      {
        type: "module",
      },
    );

    const worker = workerRef.current;

    const currentRequestId = requestIdRef.current + 1;
    requestIdRef.current = currentRequestId;

    const handleMessage = (event: MessageEvent<MarkdownWorkerResponse>) => {
      const { id, normalizedContent, blocks } = event.data;
      if (id !== requestIdRef.current) {
        return;
      }

      setState({ normalizedContent, blocks });
    };

    const handleError = () => {
      setState(fallbackState);
    };

    worker.addEventListener("message", handleMessage);
    worker.addEventListener("error", handleError);
    worker.postMessage({ id: currentRequestId, content });

    return () => {
      worker.removeEventListener("message", handleMessage);
      worker.removeEventListener("error", handleError);
    };
  }, [canUseWorker, content, fallbackState]);

  useEffect(() => {
    return () => {
      if (workerRef.current) {
        workerRef.current.terminate();
        workerRef.current = null;
      }
    };
  }, []);

  return canUseWorker ? state : fallbackState;
}
