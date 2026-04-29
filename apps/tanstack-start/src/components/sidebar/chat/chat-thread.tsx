import * as React from "react";
import { Link, useRouter, useRouterState } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { Ellipsis, Pencil, RotateCw, Trash } from "lucide-react";
import { toast } from "sonner";

import { api } from "@redux/backend/convex/_generated/api";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@redux/ui/components/dropdown-menu";
import { Input } from "@redux/ui/components/input";
import {
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@redux/ui/components/sidebar";
import Spinner from "@redux/ui/components/spinner";

/** Must match `packages/backend/convex/functions/threads.ts` default thread name. */
const THREAD_PLACEHOLDER_NAME = "New Thread";

/** ms per revealed character — similar cadence to token/stream UI elsewhere. */
const REMOTE_TITLE_REVEAL_MS_PER_CHAR = 22;

interface ChatThreadSidebarItemProps {
  threadId: string;
  threadName: string;
  /** From Convex `threads.titleSource`; drives typewriter for generated titles. */
  titleSource?: "user" | "generated";
  titleGeneratedAt?: number;
  status: "generating" | "completed";
  timestamp?: number;
  style?: React.CSSProperties;
}

export default function ChatThreadSidebarItem({
  threadId,
  threadName,
  titleSource,
  titleGeneratedAt,
  status,
  style,
}: ChatThreadSidebarItemProps) {
  const router = useRouter();
  const routerState = useRouterState();
  const isActive = routerState.location.pathname === `/chat/${threadId}`;
  const renameThread = useMutation(api.functions.threads.updateThreadName);
  const regenerateThreadTitle = useMutation(api.functions.threads.regenerateThreadTitle);
  const deleteThread = useMutation(api.functions.threads.deleteThread);
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [isRenaming, setIsRenaming] = React.useState(false);
  const [draftName, setDraftName] = React.useState(threadName);
  const [displayedTitle, setDisplayedTitle] = React.useState(threadName);
  const [isSaving, setIsSaving] = React.useState(false);
  const [isDeleting, setIsDeleting] = React.useState(false);
  const [isRegeneratingTitle, setIsRegeneratingTitle] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const lastThreadIdRef = React.useRef(threadId);
  const prevThreadNameRef = React.useRef(threadName);
  const prevTitleGeneratedAtRef = React.useRef<number | undefined>(
    titleGeneratedAt,
  );
  const skipRemoteTitleRevealRef = React.useRef(false);

  React.useEffect(() => {
    if (lastThreadIdRef.current !== threadId) {
      lastThreadIdRef.current = threadId;
      prevThreadNameRef.current = threadName;
      prevTitleGeneratedAtRef.current = titleGeneratedAt;
      skipRemoteTitleRevealRef.current = false;
      setDisplayedTitle(threadName);
      return;
    }

    const prev = prevThreadNameRef.current;
    const skipReveal = skipRemoteTitleRevealRef.current;

    const prevGen = prevTitleGeneratedAtRef.current;

    const revealFromStoredMetadata =
      titleSource === "generated" &&
      titleGeneratedAt !== undefined &&
      prevGen !== titleGeneratedAt;

    const legacyPlaceholderReveal =
      titleSource === undefined &&
      titleGeneratedAt === undefined &&
      prev === THREAD_PLACEHOLDER_NAME &&
      threadName !== THREAD_PLACEHOLDER_NAME &&
      threadName.length > 0;

    const shouldRevealLikeAi =
      !skipReveal && (revealFromStoredMetadata || legacyPlaceholderReveal);

    if (skipReveal) {
      skipRemoteTitleRevealRef.current = false;
    }

    prevThreadNameRef.current = threadName;
    prevTitleGeneratedAtRef.current = titleGeneratedAt;

    if (!shouldRevealLikeAi) {
      setDisplayedTitle(threadName);
      return;
    }

    const target = threadName;
    setDisplayedTitle(target.slice(0, 1));
    let revealed = 1;
    if (revealed >= target.length) {
      return;
    }

    const id = window.setInterval(() => {
      revealed += 1;
      setDisplayedTitle(target.slice(0, revealed));
      if (revealed >= target.length) {
        window.clearInterval(id);
      }
    }, REMOTE_TITLE_REVEAL_MS_PER_CHAR);

    return () => window.clearInterval(id);
  }, [threadId, threadName, titleSource, titleGeneratedAt]);

  const handleContextMenu = (event: React.MouseEvent<HTMLLIElement>) => {
    if (isRenaming || isDeleting || isRegeneratingTitle) {
      return;
    }

    event.preventDefault();
    setMenuOpen(true);
  };

  React.useEffect(() => {
    if (!isRenaming) {
      return;
    }

    queueMicrotask(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
  }, [isRenaming]);

  const handleRegenerateTitle = async () => {
    setMenuOpen(false);
    setIsRegeneratingTitle(true);

    try {
      await regenerateThreadTitle({ threadId });
      toast.success("Regenerating title…");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to regenerate title",
      );
    } finally {
      setIsRegeneratingTitle(false);
    }
  };

  const handleDelete = async () => {
    setMenuOpen(false);
    setIsDeleting(true);

    try {
      await deleteThread({ threadId });
      toast.success("Thread deleted");

      if (isActive) {
        await router.navigate({ to: "/" });
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete thread");
    } finally {
      setIsDeleting(false);
    }
  };

  const startRenaming = () => {
    setMenuOpen(false);
    setDraftName(threadName);
    setIsRenaming(true);
  };

  const cancelRenaming = () => {
    setDraftName(threadName);
    setIsRenaming(false);
  };

  const submitRename = async () => {
    const nextName = draftName.trim();

    if (!nextName) {
      toast.error("Thread name cannot be empty");
      setDraftName(threadName);
      setIsRenaming(false);
      return;
    }

    if (nextName === threadName) {
      setIsRenaming(false);
      return;
    }

    setIsSaving(true);

    try {
      await renameThread({
        threadId,
        name: nextName,
      });
      skipRemoteTitleRevealRef.current = true;
      setIsRenaming(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to rename thread");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <SidebarMenuItem style={style} onContextMenu={handleContextMenu}>
      {isRenaming ? (
        <div className="flex w-full items-center gap-2 rounded-md px-2 py-1">
          <Input
            ref={inputRef}
            value={draftName}
            disabled={isSaving}
            maxLength={80}
            className="h-7"
            onChange={(event) => setDraftName(event.target.value)}
            onBlur={() => {
              if (!isSaving) {
                void submitRename();
              }
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void submitRename();
              }

              if (event.key === "Escape") {
                event.preventDefault();
                cancelRenaming();
              }
            }}
          />
        </div>
      ) : (
        <SidebarMenuButton
          isActive={isActive}
          className="w-full data-active:bg-muted data-active:text-foreground hover:data-active:bg-muted"
          render={
            <Link to={`/chat/$id`} params={{ id: threadId }} preload="intent" />
          }
        >
          <span className="flex-1 truncate">{displayedTitle}</span>
        </SidebarMenuButton>
      )}
      {status === "generating" && (
        <div
          className="text-sidebar-foreground ring-sidebar-ring absolute top-1.5 right-1 flex aspect-square w-5 items-center justify-center rounded-md p-0 outline-hidden transition-opacity group-hover/menu-item:opacity-0 peer-data-[size=sm]/menu-button:top-1 peer-data-[size=default]/menu-button:top-1.5 peer-data-[size=lg]/menu-button:top-2.5 group-data-[collapsible=icon]:hidden after:absolute after:-inset-2 md:after:hidden"
        >
          <Spinner />
        </div>
      )}
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger
          render={
            <SidebarMenuAction
              disabled={isRenaming || isDeleting || isRegeneratingTitle}
              showOnHover={status === "completed"}
              className={
                status === "generating"
                  ? "group-hover/menu-item:opacity-100 peer-data-active/menu-button:text-foreground md:opacity-0"
                  : "peer-data-active/menu-button:text-foreground"
              }
            />
          }
          className="group-hover/menu-item:cursor-pointer"
        >
          <Ellipsis />
          <span className="sr-only">Settings</span>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-48">
          <DropdownMenuItem
            onClick={startRenaming}
            disabled={isDeleting || isRegeneratingTitle}
          >
            <Pencil className="size-4" />
            <span>Rename</span>
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => {
              void handleRegenerateTitle();
            }}
            disabled={isDeleting || isRegeneratingTitle}
          >
            <RotateCw className="size-4" />
            <span>{isRegeneratingTitle ? "Regenerating…" : "Regenerate title"}</span>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => {
              void handleDelete();
            }}
            disabled={isDeleting || isRegeneratingTitle}
            variant="destructive"
          >
            <Trash className="size-4" />
            <span>{isDeleting ? "Deleting..." : "Delete"}</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </SidebarMenuItem>
  );
}
