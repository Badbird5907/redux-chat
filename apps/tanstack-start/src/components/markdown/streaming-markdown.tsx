"use client";

import { memo, useMemo } from "react";
import ReactMarkdown from "react-markdown";

import { cn } from "@redux/ui/lib/utils";

import {
  createMarkdownComponents,
  rehypePlugins,
  remarkPlugins,
} from "./markdown-components";
import { ShikiCodeBlock } from "./shiki-code-block";
import { useFrameBufferedValue } from "./use-frame-buffered-value";
import { useMarkdownWorker } from "./use-markdown-worker";

interface StreamingMarkdownProps {
  content: string;
  isStreaming?: boolean;
  reasoning?: boolean;
  className?: string;
}

interface MarkdownBlockProps {
  content: string;
  isStreaming?: boolean;
  reasoning?: boolean;
}

interface CodeBlockProps {
  raw: string;
  code: string;
  info?: string;
  isClosed: boolean;
  isStreaming?: boolean;
  reasoning?: boolean;
}

const MemoizedMarkdownBlock = memo(
  ({ content, isStreaming = false, reasoning = false }: MarkdownBlockProps) => {
    const components = useMemo(
      () => createMarkdownComponents({ isStreaming }),
      [isStreaming],
    );

    return (
      <div
        className={cn("chat-markdown", reasoning && "chat-markdown--reasoning")}
      >
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
    return (
      prevProps.content === nextProps.content &&
      prevProps.reasoning === nextProps.reasoning
    );
  },
);

MemoizedMarkdownBlock.displayName = "MemoizedMarkdownBlock";

const MemoizedCodeBlock = memo(
  ({
    code,
    info,
    isClosed,
    isStreaming = false,
    reasoning = false,
  }: CodeBlockProps) => {
    if (isStreaming && !isClosed && code.length === 0) {
      return null;
    }

    return (
      <div
        className={cn("chat-markdown", reasoning && "chat-markdown--reasoning")}
      >
        <ShikiCodeBlock code={code} info={info} isStreaming={isStreaming} />
      </div>
    );
  },
  (prevProps, nextProps) => {
    return (
      prevProps.raw === nextProps.raw &&
      prevProps.isStreaming === nextProps.isStreaming &&
      prevProps.reasoning === nextProps.reasoning
    );
  },
);

MemoizedCodeBlock.displayName = "MemoizedCodeBlock";

export function StreamingMarkdown({
  content,
  isStreaming = false,
  reasoning = false,
  className,
}: StreamingMarkdownProps) {
  // if (false) {
  //   return (
  //     <StaticMarkdown
  //       content={content}
  //       className={className}
  //     />
  //   )
  // }
  const renderedContent = useFrameBufferedValue(content, isStreaming);
  const { normalizedContent, blocks } = useMarkdownWorker(renderedContent, true);

  if (!normalizedContent) {
    return null;
  }

  return (
    <div className={cn("flex flex-col", className)}>
      {blocks.map((block, index) => {
        const isLastBlock = index === blocks.length - 1;
        const isStreamingBlock = isStreaming && isLastBlock;

        if (block.type === "code") {
          return (
            <MemoizedCodeBlock
              code={block.code}
              info={block.info}
              isClosed={block.isClosed}
              isStreaming={isStreamingBlock}
              key={index}
              raw={block.raw}
              reasoning={reasoning}
            />
          );
        }

        return (
          <MemoizedMarkdownBlock
            content={block.raw}
            isStreaming={isStreamingBlock}
            key={index}
            reasoning={reasoning}
          />
        );
      })}
    </div>
  );
}
