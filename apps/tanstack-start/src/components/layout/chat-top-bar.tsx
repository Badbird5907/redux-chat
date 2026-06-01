import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { FolderKanban, FolderOpen, Share2 } from "lucide-react";

import { api } from "@redux/backend/convex/_generated/api";
import { Badge } from "@redux/ui/components/badge";
import { SidebarTrigger, useSidebar } from "@redux/ui/components/sidebar";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@redux/ui/components/tooltip";

import { FilesSheet } from "@/components/files/files-sheet";
import { ThreadShareDialog } from "@/components/share/thread-share-dialog";
import { useQuery } from "@/lib/hooks/convex";

export function ChatTopBar({ threadId }: { threadId: string }) {
  const { open: sidebarOpen, openMobile, isMobile } = useSidebar();
  const [shareOpen, setShareOpen] = useState(false);
  const [filesOpen, setFilesOpen] = useState(false);

  const thread = useQuery(api.functions.threads.getThread, { threadId });
  const projectId = thread?.chatProjectId;
  const project = useQuery(
    api.functions.projects.getProject,
    { projectId: projectId ?? "" },
    { skip: !projectId },
  );

  const showSidebarTrigger = isMobile ? !openMobile : !sidebarOpen;
  const threadName = thread?.name ?? "New chat";

  return (
    <header className="border-border/60 -mx-4 -mt-4 mb-3 flex h-12 shrink-0 items-center gap-2 border-b px-4">
      {showSidebarTrigger ? <SidebarTrigger className="shrink-0" /> : null}

      <div className="flex min-w-0 flex-1 items-center gap-2">
        <span className="text-foreground min-w-0 truncate text-sm font-medium">
          {threadName}
        </span>
        {project ? (
          <Tooltip>
            <TooltipTrigger
              render={
                <Link
                  to="/projects/$id"
                  params={{ id: project.projectId }}
                  aria-label={`Go to project ${project.name}`}
                />
              }
            >
              <Badge
                variant="outline"
                className="max-w-[12rem] cursor-pointer gap-1"
              >
                <FolderKanban className="size-3 shrink-0" />
                <span className="truncate">{project.name}</span>
              </Badge>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              Go to project {project.name}
            </TooltipContent>
          </Tooltip>
        ) : null}
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                type="button"
                aria-label="View files"
                className="hover:bg-muted text-muted-foreground hover:text-foreground inline-flex size-8 items-center justify-center rounded-md transition-colors"
                onClick={() => setFilesOpen(true)}
              />
            }
          >
            <FolderOpen className="size-4" />
          </TooltipTrigger>
          <TooltipContent side="bottom">View files</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                type="button"
                aria-label="Share thread"
                className="hover:bg-muted text-muted-foreground hover:text-foreground inline-flex size-8 items-center justify-center rounded-md transition-colors"
                onClick={() => setShareOpen(true)}
              />
            }
          >
            <Share2 className="size-4" />
          </TooltipTrigger>
          <TooltipContent side="bottom">Share thread</TooltipContent>
        </Tooltip>
      </div>

      <ThreadShareDialog
        open={shareOpen}
        threadId={threadId}
        onOpenChange={setShareOpen}
      />
      <FilesSheet
        open={filesOpen}
        threadId={threadId}
        onOpenChange={setFilesOpen}
      />
    </header>
  );
}
