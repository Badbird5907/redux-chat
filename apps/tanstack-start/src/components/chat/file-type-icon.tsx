"use client";

import { FileIcon } from "lucide-react";
import { DEFAULT_FILE, getIconForFile } from "vscode-icons-js";

import { cn } from "@redux/ui/lib/utils";

const VSCODE_ICONS_CDN =
  "https://cdn.jsdelivr.net/gh/vscode-icons/vscode-icons/icons";

export function FileTypeIcon({
  className,
  fileName,
}: {
  className?: string;
  fileName?: string;
}) {
  const iconName = fileName
    ? (getIconForFile(fileName) ?? DEFAULT_FILE)
    : undefined;

  if (!iconName) {
    return (
      <FileIcon
        aria-hidden
        className={cn("text-muted-foreground size-5 shrink-0", className)}
      />
    );
  }

  return (
    <img
      src={`${VSCODE_ICONS_CDN}/${iconName}`}
      alt=""
      aria-hidden
      className={cn("size-5 shrink-0", className)}
    />
  );
}
