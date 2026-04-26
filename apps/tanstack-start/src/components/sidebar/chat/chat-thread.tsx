import * as React from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { Ellipsis, Pencil, Trash } from "lucide-react";
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

interface ChatThreadSidebarItemProps {
  threadId: string;
  threadName: string;
  status: "generating" | "completed";
  timestamp?: number;
  style?: React.CSSProperties;
}

export default function ChatThreadSidebarItem({
  threadId,
  threadName,
  status,
  style,
}: ChatThreadSidebarItemProps) {
  const routerState = useRouterState();
  const isActive = routerState.location.pathname === `/chat/${threadId}`;
  const renameThread = useMutation(api.functions.threads.updateThreadName);
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [isRenaming, setIsRenaming] = React.useState(false);
  const [draftName, setDraftName] = React.useState(threadName);
  const [isSaving, setIsSaving] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (!isRenaming) {
      return;
    }

    queueMicrotask(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
  }, [isRenaming]);

  const handleDelete = () => {
    // TODO: Implement delete functionality
    console.log("Delete thread:", threadId);
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
      setIsRenaming(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to rename thread");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <SidebarMenuItem style={style}>
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
          <span className="flex-1 truncate">{threadName}</span>
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
              disabled={isRenaming}
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
        <DropdownMenuContent>
          <DropdownMenuItem onClick={startRenaming}>
            <Pencil className="size-4" />
            <span>Rename</span>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleDelete} variant="destructive">
            <Trash className="size-4" />
            <span>Delete</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </SidebarMenuItem>
  );
}
