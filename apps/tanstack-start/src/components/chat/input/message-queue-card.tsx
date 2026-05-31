import type { DraftAttachment } from "@/components/chat/use-chat-draft";
import type { QueuedMessage } from "@/components/chat/use-message-queue";
import { useRef } from "react";
import {
  ArrowUpIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  PaperclipIcon,
  PencilIcon,
  Trash2Icon,
} from "lucide-react";

import { Button } from "@redux/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@redux/ui/components/dialog";
import { Textarea } from "@redux/ui/components/textarea";
import { cn } from "@redux/ui/lib/utils";

import type { PreviewableFile } from "./types";
import { useReducerState } from "@/lib/hooks/use-reducer-state";
import { ChatInputAttachmentsBar } from "./attachments-bar";
import { isAttachmentExpired } from "./utils";

interface MessageQueueCardProps {
  queue: QueuedMessage[];
  onDiscard: (message: QueuedMessage) => void | Promise<void>;
  /** Load into composer (no attachment deletes unless user later discards composer). */
  onEditInComposer: (message: QueuedMessage) => void;
  /** When busy: move to front. When idle: send immediately without composer. */
  onPromote: (message: QueuedMessage) => void | Promise<void>;
  onPreviewAttachment: (file: PreviewableFile) => void;
  onSaveEdit: (
    messageId: string,
    draft: Pick<QueuedMessage, "text" | "attachments">,
  ) => void | Promise<void>;
}

function truncate(text: string, max: number): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t.length > 0 ? t : "(empty)";
  return `${t.slice(0, Math.max(0, max - 1))}…`;
}

export function MessageQueueCard({
  queue,
  onDiscard,
  onEditInComposer,
  onPromote,
  onPreviewAttachment,
  onSaveEdit,
}: MessageQueueCardProps) {
  const [expanded, setExpanded] = useReducerState(true);
  const [editorOpen, setEditorOpen] = useReducerState(false);
  const [discardOpen, setDiscardOpen] = useReducerState(false);
  const discardTargetRef = useRef<QueuedMessage | null>(null);
  const editingRef = useRef<QueuedMessage | null>(null);
  const [draftText, setDraftText] = useReducerState("");
  const [draftAttachments, setDraftAttachments] = useReducerState<
    DraftAttachment[]
  >([]);

  function openInlineEditor(message: QueuedMessage) {
    editingRef.current = message;
    setDraftText(message.text);
    setDraftAttachments(message.attachments);
    setEditorOpen(true);
  }

  async function persistEditor() {
    const editing = editingRef.current;
    if (!editing) return;

    await onSaveEdit(editing.id, {
      text: draftText,
      attachments: draftAttachments,
    });

    setEditorOpen(false);
    editingRef.current = null;
  }

  return (
    <div
      className={cn(
        "border-border bg-card/95 mb-[-8px] max-h-[min(40vh,12rem)] translate-y-4 overflow-hidden rounded-t-2xl border border-b-0 pb-7 shadow-inner",
      )}
    >
      <button
        type="button"
        className="text-muted-foreground hover:bg-muted/50 flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium"
        onClick={() => setExpanded((value) => !value)}
      >
        {expanded ? (
          <ChevronDownIcon className="size-3.5 shrink-0" />
        ) : (
          <ChevronRightIcon className="size-3.5 shrink-0" />
        )}
        <span>{queue.length} Queued</span>
      </button>

      {expanded && (
        <ul className="max-h-[min(36vh,10rem)] space-y-0.5 overflow-y-auto px-2 pb-1">
          {queue.map((message) => {
            const attachmentCount = message.attachments.filter(
              (file) => !file.uploading && !isAttachmentExpired(file.expiresAt),
            ).length;

            return (
              <li key={message.id}>
                <div className="hover:bg-muted/40 flex items-center gap-2 rounded-lg px-2 py-1.5">
                  <span
                    className="border-muted-foreground/40 size-2 shrink-0 rounded-full border"
                    aria-hidden
                  />

                  <div className="min-w-0 flex-1">
                    <span className="text-foreground block text-xs leading-snug wrap-break-word">
                      {truncate(message.text || "", 280)}
                    </span>
                  </div>

                  <div className="flex shrink-0 items-center gap-0.5">
                    {attachmentCount > 0 ? (
                      <span
                        className="text-muted-foreground mr-1 inline-flex items-center gap-0.5 text-[10px]"
                        title={`${attachmentCount} attachment${attachmentCount === 1 ? "" : "s"}`}
                      >
                        <PaperclipIcon className="size-3" aria-hidden />
                        {attachmentCount}
                      </span>
                    ) : null}

                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="text-muted-foreground size-7"
                      title="Edit in queue"
                      onClick={() => openInlineEditor(message)}
                    >
                      <PencilIcon className="size-3.5" />
                      <span className="sr-only">Edit queued message</span>
                    </Button>

                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="text-muted-foreground size-7"
                      title="Prioritize next or send now"
                      onClick={() => void onPromote(message)}
                    >
                      <ArrowUpIcon className="size-3.5" />
                      <span className="sr-only">Promote queued message</span>
                    </Button>

                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="text-muted-foreground hover:text-destructive size-7"
                      title="Discard"
                      onClick={() => {
                        discardTargetRef.current = message;
                        setDiscardOpen(true);
                      }}
                    >
                      <Trash2Icon className="size-3.5" />
                      <span className="sr-only">Remove from queue</span>
                    </Button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Dialog
        open={editorOpen}
        onOpenChange={(open) => {
          setEditorOpen(open);
          if (!open) {
            editingRef.current = null;
          }
        }}
      >
        <DialogContent className="max-w-lg gap-4">
          <DialogHeader>
            <DialogTitle>Edit queued message</DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-3">
            <Textarea
              value={draftText}
              onChange={(event) => setDraftText(event.target.value)}
              placeholder="Message"
              aria-label="Queued message text"
              rows={4}
              className="min-h-[5rem]"
            />

            {draftAttachments.length > 0 ? (
              <ChatInputAttachmentsBar
                attachments={draftAttachments}
                onPreview={onPreviewAttachment}
                onRemove={(attachmentId) => {
                  setDraftAttachments((previous) =>
                    previous.filter(
                      (file) => file.attachmentId !== attachmentId,
                    ),
                  );
                }}
              />
            ) : null}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => {
                setEditorOpen(false);
                editingRef.current = null;
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={() => void persistEditor()}
              disabled={
                !draftText.trim() &&
                draftAttachments.filter((file) => !file.uploading).length === 0
              }
            >
              Save
            </Button>
          </DialogFooter>

          <div className="border-border border-t pt-3">
            <Button
              variant="ghost"
              className="text-muted-foreground w-full justify-center text-xs"
              onClick={() => {
                const editing = editingRef.current;
                if (!editing) return;
                onEditInComposer(editing);
                setEditorOpen(false);
                editingRef.current = null;
              }}
            >
              Move to composer to edit attachments further
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={discardOpen}
        onOpenChange={(open) => {
          setDiscardOpen(open);
          if (!open) discardTargetRef.current = null;
        }}
      >
        <DialogContent className="max-w-md gap-4">
          <DialogHeader>
            <DialogTitle>Discard this queued message?</DialogTitle>
          </DialogHeader>
          <DialogFooter className="flex flex-row gap-4 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => {
                setDiscardOpen(false);
                discardTargetRef.current = null;
              }}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() =>
                void (async () => {
                  const discardTarget = discardTargetRef.current;
                  if (discardTarget) {
                    await onDiscard(discardTarget);
                  }
                  setDiscardOpen(false);
                  discardTargetRef.current = null;
                })()
              }
            >
              Discard
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
