"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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

interface ChatThreadSidebarItemProps {
  threadId: string;
  threadName: string;
  timestamp?: number;
  style?: React.CSSProperties;
}

export default function ChatThreadSidebarItem({
  threadId,
  threadName,
  style,
}: ChatThreadSidebarItemProps) {
  const pathname = usePathname();
  const isActive = pathname === `/chat/${threadId}`;

  const handleDelete = () => {
    // TODO: Implement delete functionality
    console.log("Delete thread:", threadId);
  };

  return (
    <SidebarMenuItem style={style}>
      <SidebarMenuButton asChild isActive={isActive} className="w-full">
        <Link href={`/chat/${threadId}`}>
          <span className="flex-1 truncate">{threadName}</span>
        </Link>
      </SidebarMenuButton>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <SidebarMenuAction showOnHover>
            <Ellipsis />
            <span className="sr-only">Settings</span>
          </SidebarMenuAction>
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
