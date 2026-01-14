import { Link, useRouterState } from "@tanstack/react-router";
import { Ellipsis, Pencil, Trash } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@redux/ui/components/dropdown-menu";
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

  const handleDelete = () => {
    // TODO: Implement delete functionality
    console.log("Delete thread:", threadId);
  };

  return (
    <SidebarMenuItem style={style}>
      <SidebarMenuButton
        isActive={isActive}
        className="w-full"
        render={
          <Link to={`/chat/${threadId}`} preload="intent" />
        }
      >
        <span className="flex-1 truncate">{threadName}</span>
      </SidebarMenuButton>
      {status === "generating" && (
        <div
          className="text-sidebar-foreground ring-sidebar-ring absolute top-1.5 right-1 flex aspect-square w-5 items-center justify-center rounded-md p-0 outline-hidden transition-opacity group-hover/menu-item:opacity-0 peer-data-[size=sm]/menu-button:top-1 peer-data-[size=default]/menu-button:top-1.5 peer-data-[size=lg]/menu-button:top-2.5 group-data-[collapsible=icon]:hidden after:absolute after:-inset-2 md:after:hidden"
        >
          <Spinner />
        </div>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <SidebarMenuAction
              showOnHover={status === "completed"}
              className={
                status === "generating"
                  ? "group-hover/menu-item:opacity-100 md:opacity-0"
                  : undefined
              }
            />
          }
        >
          <Ellipsis />
          <span className="sr-only">Settings</span>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem>
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
