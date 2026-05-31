"use client";

import type React from "react";

import type { ThreadExportInput } from "./thread-export-utils";
import { StaticMarkdown } from "@/components/markdown/static-markdown";
import {
  getAttachmentLinks,
  getImageUrlsForMessage,
  getMessageText,
} from "./thread-export-utils";

export function ThreadPrintExport({
  input,
  printRootRef,
}: {
  input: ThreadExportInput;
  printRootRef: React.RefObject<HTMLDivElement | null>;
}) {
  const resolvedAttachments = input.resolvedAttachments ?? {};

  return (
    <div
      ref={printRootRef}
      className="thread-print-root hidden bg-white text-[#1f1726] print:block print:p-0"
    >
      <article className="mx-auto max-w-[7.25in] px-8 py-8 text-[12px] leading-relaxed print:max-w-none print:px-0 print:py-0">
        <header className="mb-6 border-b border-[#e5e1ea] pb-3">
          <h1 className="m-0 text-[22px] leading-tight font-semibold">
            {input.threadName}
          </h1>
          <div className="mt-2 text-[10px] text-[#6f6478]">
            Thread ID: {input.threadId}
          </div>
          <div className="text-[10px] text-[#6f6478]" suppressHydrationWarning>
            Exported: {new Date().toLocaleString()}
          </div>
        </header>

        <div>
          {input.messages.map((message) => {
            const label =
              message.role === "assistant"
                ? "Assistant"
                : message.role === "user"
                  ? "User"
                  : "System";
            const text = getMessageText(message).trim();
            const imageUrls = getImageUrlsForMessage(
              message,
              resolvedAttachments,
            );
            const attachmentLinks = getAttachmentLinks(
              message,
              resolvedAttachments,
            );

            return (
              <section className="mb-6" key={`${message.id}:print`}>
                <h2 className="mb-2 text-[12px] font-semibold tracking-normal text-[#5b456d] uppercase">
                  {label}
                </h2>
                {text ? (
                  message.role === "assistant" ? (
                    <StaticMarkdown
                      className="thread-print-markdown"
                      content={text}
                      controls={false}
                    />
                  ) : (
                    <div className="whitespace-pre-wrap">{text}</div>
                  )
                ) : null}

                {imageUrls.length > 0 ? (
                  <div className="mt-3 space-y-3">
                    {imageUrls.map((image) => (
                      <figure
                        className="[break-inside:avoid-page]"
                        key={`${message.id}:${image.url}`}
                      >
                        <img
                          alt={image.alt}
                          className="max-h-[7in] max-w-full rounded-md border border-[#e5e1ea] object-contain"
                          src={image.url}
                        />
                        <figcaption className="mt-1 text-[10px] break-words text-[#6f6478]">
                          {image.alt}
                        </figcaption>
                      </figure>
                    ))}
                  </div>
                ) : null}

                {attachmentLinks.length > 0 ? (
                  <ul className="mt-3 list-disc pl-5">
                    {attachmentLinks.map((attachment) => (
                      <li key={`${message.id}:${attachment.url}`}>
                        <a
                          className="break-words text-[#4f3d75] underline"
                          href={attachment.url}
                        >
                          {attachment.label}
                        </a>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </section>
            );
          })}
        </div>
      </article>
    </div>
  );
}
