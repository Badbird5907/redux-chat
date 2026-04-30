import { normalizeMarkdownMathDelimiters } from "./normalize-markdown-math";
import {
  parseMarkdownIntoBlocks,
} from "./parse-markdown-into-blocks";
import type { MarkdownBlock } from "./parse-markdown-into-blocks";

interface MarkdownWorkerRequest {
  id: number;
  content: string;
}

interface MarkdownWorkerResponse {
  id: number;
  normalizedContent: string;
  blocks: MarkdownBlock[];
}

self.onmessage = (event: MessageEvent<MarkdownWorkerRequest>) => {
  const { id, content } = event.data;
  const normalizedContent = normalizeMarkdownMathDelimiters(content);
  const blocks = parseMarkdownIntoBlocks(normalizedContent);

  const payload: MarkdownWorkerResponse = {
    id,
    normalizedContent,
    blocks,
  };

  self.postMessage(payload);
};

export {};
