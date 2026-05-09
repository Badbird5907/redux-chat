"use client";

import { useState } from "react";
import { useRouter } from "@tanstack/react-router";
import {
  BookText,
  FolderKanban,
  Keyboard,
  MessageSquare,
  Plus,
  Search,
  SlidersHorizontal,
} from "lucide-react";

import { api } from "@redux/backend/convex/_generated/api";
import {
  Command,
  CommandDialog,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@redux/ui/components/command";

import { requestChatReset } from "@/components/chat/reset-chat";
import { setStoredChatDraft } from "@/components/chat/use-chat-draft";
import { authClient } from "@/lib/auth/client";
import { useQuery } from "@/lib/hooks/convex";
import { useAppHotkey } from "@/lib/hotkeys";
import {
  COMMAND_THREAD_RESULT_LIMIT,
  SETTINGS_NAV_ITEMS,
  settingsNavMatches,
} from "./settings-nav";

interface CommandPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CommandPanel({ open, onOpenChange }: CommandPanelProps) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const { data: session, isPending } = authClient.useSession();
  const hasSession = session != null;

  const normalizedSearch = search.trim();

  useAppHotkey("command.open", () => onOpenChange(true));

  const recentThreads = useQuery(
    api.functions.threads.searchThreads,
    {
      search: "",
      limit: COMMAND_THREAD_RESULT_LIMIT,
    },
    {
      skip: !open || normalizedSearch.length > 0,
    },
  );

  const matchingThreads = useQuery(
    api.functions.threads.searchThreads,
    {
      search: normalizedSearch,
      limit: COMMAND_THREAD_RESULT_LIMIT,
    },
    {
      skip: !open || normalizedSearch.length === 0,
    },
  );

  const recentProjects = useQuery(
    api.functions.projects.searchProjects,
    {
      search: "",
      limit: COMMAND_THREAD_RESULT_LIMIT,
    },
    {
      skip: !open || normalizedSearch.length > 0,
    },
  );

  const matchingProjects = useQuery(
    api.functions.projects.searchProjects,
    {
      search: normalizedSearch,
      limit: COMMAND_THREAD_RESULT_LIMIT,
    },
    {
      skip: !open || normalizedSearch.length === 0,
    },
  );

  const visibleThreads =
    normalizedSearch.length > 0
      ? (matchingThreads ?? [])
      : (recentThreads ?? []);
  const visibleProjects =
    normalizedSearch.length > 0
      ? (matchingProjects ?? [])
      : (recentProjects ?? []);

  const visibleSettingsNav = SETTINGS_NAV_ITEMS.filter((item) =>
    settingsNavMatches(normalizedSearch, item.searchBlob),
  );

  /** With no query, Actions leads; once you're filtering and settings rows match, Settings leads. */
  const settingsFirst =
    normalizedSearch.length > 0 && visibleSettingsNav.length > 0;

  const showThreadsGroup = hasSession && visibleThreads.length > 0;
  const showProjectsGroup = hasSession && visibleProjects.length > 0;
  const showNoMatchingResults =
    hasSession &&
    normalizedSearch.length > 0 &&
    matchingProjects?.length === 0 &&
    matchingThreads?.length === 0;

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setSearch("");
    }
    onOpenChange(nextOpen);
  };

  const handleOpenNewChat = async (prefill?: string) => {
    requestChatReset();

    if (prefill !== undefined) {
      setStoredChatDraft({
        text: prefill,
      });
    }

    onOpenChange(false);
    await router.navigate({ to: "/" });
  };

  const handleOpenThread = async (threadId: string) => {
    onOpenChange(false);
    await router.navigate({
      to: "/chat/$id",
      params: { id: threadId },
    });
  };

  const handleOpenProject = async (projectId: string) => {
    onOpenChange(false);
    await router.navigate({
      to: "/projects/$id",
      params: { id: projectId },
    });
  };

  const settingsNavGroup =
    visibleSettingsNav.length > 0 ? (
      <CommandGroup heading="Settings">
        {visibleSettingsNav.map((item) => (
          <CommandItem
            key={item.value}
            className="min-h-13"
            value={item.value}
            onSelect={() => {
              handleOpenChange(false);
              void router.navigate({ to: item.to });
            }}
          >
            <div className="bg-muted text-muted-foreground flex size-9 items-center justify-center rounded-lg">
              {item.value === "settings-general" ? (
                <SlidersHorizontal className="size-4" />
              ) : item.value === "settings-instructions" ? (
                <BookText className="size-4" />
              ) : (
                <Keyboard className="size-4" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div>{item.title}</div>
              <div className="text-muted-foreground text-xs font-normal">
                {item.subtitle}
              </div>
            </div>
          </CommandItem>
        ))}
      </CommandGroup>
    ) : null;

  return (
    <CommandDialog
      open={open}
      onOpenChange={handleOpenChange}
      className="bg-card/98 overflow-hidden p-0"
    >
      <Command shouldFilter={false} loop className="bg-card/98">
        <CommandInput
          value={search}
          onValueChange={setSearch}
          placeholder="Search threads, projects, settings, and more..."
        />
        <CommandList>
          {settingsFirst ? (
            <>
              {settingsNavGroup}
              <CommandSeparator />
            </>
          ) : null}

          <CommandGroup heading="Actions">
            {normalizedSearch.length > 0 && (
              <CommandItem
                className="min-h-13"
                value={`new-chat-with-${normalizedSearch}`}
                onSelect={() => void handleOpenNewChat(normalizedSearch)}
              >
                <div className="bg-primary/10 text-primary flex size-9 items-center justify-center rounded-lg">
                  <Search className="size-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate">
                    New chat with &quot;{normalizedSearch}&quot;
                  </div>
                  <div className="text-muted-foreground text-xs font-normal">
                    Start a fresh thread using this prompt
                  </div>
                </div>
                <CommandShortcut>Enter</CommandShortcut>
              </CommandItem>
            )}
            <CommandItem
              className="min-h-13"
              value="new-chat"
              onSelect={() => void handleOpenNewChat()}
            >
              <div className="bg-primary/10 text-primary flex size-9 items-center justify-center rounded-lg">
                <Plus className="size-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div>New Chat</div>
                <div className="text-muted-foreground text-xs font-normal">
                  Open a blank conversation
                </div>
              </div>
            </CommandItem>
          </CommandGroup>

          {!settingsFirst && settingsNavGroup !== null ? (
            <>
              <CommandSeparator />
              {settingsNavGroup}
            </>
          ) : null}

          {(showProjectsGroup ||
            showThreadsGroup ||
            showNoMatchingResults ||
            (!hasSession && !isPending)) && <CommandSeparator />}

          {showProjectsGroup && (
            <CommandGroup
              heading={
                normalizedSearch.length > 0
                  ? "Matching Projects"
                  : "Projects"
              }
            >
              {visibleProjects.map((project) => (
                <CommandItem
                  className="min-h-13"
                  key={project.projectId}
                  value={`project-${project.projectId}`}
                  onSelect={() => void handleOpenProject(project.projectId)}
                >
                  <div className="bg-muted text-muted-foreground flex size-9 items-center justify-center rounded-lg">
                    <FolderKanban className="size-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate">{project.name}</div>
                    <div className="text-muted-foreground truncate text-xs font-normal">
                      {project.description ?? "Open project"}
                    </div>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {showProjectsGroup && showThreadsGroup && <CommandSeparator />}

          {showThreadsGroup && (
            <CommandGroup
              heading={
                normalizedSearch.length > 0
                  ? "Matching Threads"
                  : "Recent Threads"
              }
            >
              {visibleThreads.map((thread) => (
                <CommandItem
                  className="min-h-13"
                  key={thread.threadId}
                  value={`thread-${thread.threadId}`}
                  onSelect={() => void handleOpenThread(thread.threadId)}
                >
                  <div className="bg-muted text-muted-foreground flex size-9 items-center justify-center rounded-lg">
                    <MessageSquare className="size-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate">{thread.name}</div>
                    <div className="text-muted-foreground text-xs font-normal">
                      Open thread
                    </div>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {showNoMatchingResults && (
            <div className="text-muted-foreground px-5 py-6 text-sm">
              No projects or thread names match &quot;{normalizedSearch}&quot;.
            </div>
          )}

          {!hasSession && !isPending && (
            <div className="text-muted-foreground px-5 py-6 text-sm">
              Sign in to search your threads.
            </div>
          )}
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
