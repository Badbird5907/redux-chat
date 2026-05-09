"use client";

import type {
  AssistantTimelineAnalysisDetails,
  AssistantTimelineStep,
} from "@/components/chat/assistant-message-timeline";
import type { ComponentType, ReactNode } from "react";
import { useState } from "react";
import { Code2Icon, FileTextIcon, TerminalSquareIcon } from "lucide-react";

import { Button } from "@redux/ui/components/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@redux/ui/components/sheet";
import { cn } from "@redux/ui/lib/utils";

import { ShikiCodeBlock } from "@/components/markdown/shiki-code-block";

export function AnalysisDetailsButton({
  details,
  status,
}: {
  details: AssistantTimelineAnalysisDetails;
  status: AssistantTimelineStep["status"];
}) {
  const [open, setOpen] = useState(false);
  const hasOutput =
    Boolean(details.text) ||
    details.stdout.length > 0 ||
    details.stderr.length > 0;

  return (
    <>
      <Button
        className="h-auto justify-start gap-3 rounded-2xl px-3 py-2"
        onClick={() => setOpen(true)}
        size="sm"
        variant="outline"
      >
        <div className="bg-muted flex size-8 items-center justify-center rounded-xl">
          <Code2Icon className="size-4" />
        </div>
        <div className="min-w-0 text-left">
          <div className="text-sm leading-none font-medium">Code</div>
          <div className="text-muted-foreground mt-1 text-xs">
            {status === "active"
              ? "Open the generated code"
              : hasOutput
                ? "Open code and output"
                : "Open the generated code"}
          </div>
        </div>
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          className="w-full gap-0 data-[side=right]:sm:max-w-4xl"
          side="right"
        >
          <SheetHeader className="border-border border-b">
            <SheetTitle>Analysis</SheetTitle>
            <SheetDescription>
              Review the generated Python code and the tool output.
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 space-y-6 overflow-y-auto p-4">
            <AnalysisSection icon={Code2Icon} title="Code">
              <div className="analysis-code-block chat-markdown">
                <ShikiCodeBlock
                  code={
                    details.code?.trim() ??
                    "# No code was captured for this step."
                  }
                  info="python"
                />
              </div>
            </AnalysisSection>

            <AnalysisSection icon={TerminalSquareIcon} title="Output">
              <div className="space-y-4">
                {details.text ? (
                  <OutputBlock label="Result">{details.text}</OutputBlock>
                ) : null}

                {details.stdout.length > 0 ? (
                  <OutputBlock label="Stdout">
                    {details.stdout.join("\n")}
                  </OutputBlock>
                ) : null}

                {details.stderr.length > 0 ? (
                  <OutputBlock label="Stderr" tone="error">
                    {details.stderr.join("\n")}
                  </OutputBlock>
                ) : null}

                {details.uploadedFiles.length > 0 ? (
                  <div className="space-y-2">
                    <div className="text-muted-foreground text-xs font-medium tracking-[0.14em] uppercase">
                      Uploaded Files
                    </div>
                    <div className="space-y-2">
                      {details.uploadedFiles.map((file) => (
                        <div
                          className="border-border bg-muted/20 rounded-xl border px-3 py-2"
                          key={`${file.path}:${file.fileName}`}
                        >
                          <div className="flex items-center gap-2 text-sm font-medium">
                            <FileTextIcon className="size-4" />
                            {file.fileName}
                          </div>
                          <div className="text-muted-foreground mt-1 font-mono text-xs">
                            {file.path}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {!details.text &&
                details.stdout.length === 0 &&
                details.stderr.length === 0 ? (
                  <div className="text-muted-foreground rounded-xl border border-dashed p-4 text-sm">
                    No output was captured for this analysis step yet.
                  </div>
                ) : null}
              </div>
            </AnalysisSection>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

function AnalysisSection({
  children,
  icon: Icon,
  title,
}: {
  children: ReactNode;
  icon: ComponentType<{ className?: string }>;
  title: string;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <Icon className="text-muted-foreground size-4" />
        <h3 className="text-sm font-medium">{title}</h3>
      </div>
      {children}
    </section>
  );
}

function OutputBlock({
  children,
  label,
  tone = "default",
}: {
  children: string;
  label: string;
  tone?: "default" | "error";
}) {
  return (
    <div className="space-y-2">
      <div className="text-muted-foreground text-xs font-medium tracking-[0.14em] uppercase">
        {label}
      </div>
      <pre
        className={cn(
          "border-border overflow-x-auto rounded-2xl border p-4 text-sm leading-6 whitespace-pre-wrap",
          tone === "error"
            ? "bg-destructive/5 border-destructive/20 text-destructive"
            : "bg-muted/40",
        )}
      >
        <code className="font-mono">{children}</code>
      </pre>
    </div>
  );
}
