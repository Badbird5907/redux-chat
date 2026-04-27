"use client";

import { memo, useMemo } from "react";
import ReactMarkdown from "react-markdown";

import { cn } from "@redux/ui/lib/utils";

import {
  createMarkdownComponents,
  rehypePlugins,
  remarkPlugins,
} from "./markdown-components";
import { parseMarkdownIntoBlocks } from "./parse-markdown-into-blocks";
import { useFrameBufferedValue } from "./use-frame-buffered-value";

interface StreamingMarkdownProps {
  content: string;
  isStreaming?: boolean;
  className?: string;
}

interface MarkdownBlockProps {
  content: string;
  isStreaming?: boolean;
}

const MemoizedMarkdownBlock = memo(
  ({ content, isStreaming = false }: MarkdownBlockProps) => {
    const components = useMemo(
      () => createMarkdownComponents({ isStreaming }),
      [isStreaming],
    );

    return (
      <div className="chat-markdown">
        <ReactMarkdown
          components={components}
          rehypePlugins={rehypePlugins}
          remarkPlugins={remarkPlugins}
        >
          {content}
        </ReactMarkdown>
      </div>
    );
  },
  (prevProps, nextProps) => {
    // Keep completed blocks frozen once their markdown text stops changing.
    // The streaming hint is only relevant while the block content is still
    // updating, so we intentionally ignore it here.
    return prevProps.content === nextProps.content;
  },
);

MemoizedMarkdownBlock.displayName = "MemoizedMarkdownBlock";

export function StreamingMarkdown({
  content,
  isStreaming = false,
  className,
}: StreamingMarkdownProps) {
  const renderedContent = useFrameBufferedValue(content, isStreaming);
  const blocks = useMemo(
    () => parseMarkdownIntoBlocks(renderedContent),
    [renderedContent],
  );

  if (!renderedContent) {
    return null;
  }

  return (
    <div className={cn("flex flex-col", className)}>
      {blocks.map((block, index) => {
        const isLastBlock = index === blocks.length - 1;

        return (
          <MemoizedMarkdownBlock
            content={block}
            isStreaming={isStreaming && isLastBlock}
            key={index}
          />
        );
      })}
    </div>
  );
}
