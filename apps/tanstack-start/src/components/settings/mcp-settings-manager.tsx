"use client";

import { useCallback, useMemo, useState } from "react";
import { useMutation } from "convex/react";
import {
  AlertCircle,
  Check,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  KeyRound,
  Loader2,
  Pencil,
  Plug,
  Plus,
  Save,
  ShieldAlert,
  ShieldCheck,
  ShieldQuestion,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { api } from "@redux/backend/convex/_generated/api";
import { Badge } from "@redux/ui/components/badge";
import { Button } from "@redux/ui/components/button";
import { Input } from "@redux/ui/components/input";
import { Label } from "@redux/ui/components/label";
import { RadioGroup, RadioGroupItem } from "@redux/ui/components/radio-group";
import { Switch } from "@redux/ui/components/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@redux/ui/components/tooltip";
import { cn } from "@redux/ui/lib/utils";

import { MobileSidebarTrigger } from "@/components/layout/mobile-sidebar-trigger";
import McpLogo from "@/components/logos/mcp";
import { useQuery } from "@/lib/hooks/convex";
import { useReducerState } from "@/lib/hooks/use-reducer-state";

type McpToolPermission = "allow" | "ask" | "deny";

interface McpServerDraft {
  name: string;
  url: string;
  authHeaders: AuthHeaderDraft[];
}

interface AuthHeaderDraft {
  name: string;
  value: string;
}

interface DiscoveredTool {
  name: string;
  description: string;
}

interface ServerToolState {
  tools: DiscoveredTool[];
  loading: boolean;
  error: string | null;
  lastFetched: number | null;
}

function createDraft(server: {
  name: string;
  url: string;
  authHeaders?: AuthHeaderDraft[];
}): McpServerDraft {
  return {
    name: server.name,
    url: server.url,
    authHeaders: server.authHeaders ?? [],
  };
}

function compactAuthHeaders(authHeaders: AuthHeaderDraft[]) {
  return authHeaders.flatMap((header) => {
    const compacted = {
      name: header.name.trim(),
      value: header.value.trim(),
    };
    return compacted.name.length > 0 || compacted.value.length > 0
      ? [compacted]
      : [];
  });
}

function serializeAuthHeaders(authHeaders: AuthHeaderDraft[]) {
  return JSON.stringify(compactAuthHeaders(authHeaders));
}

const PERMISSION_OPTIONS: {
  value: McpToolPermission;
  label: string;
  description: string;
  icon: typeof ShieldCheck;
  activeColor: string;
  activeBg: string;
}[] = [
  {
    value: "allow",
    label: "Allow",
    description: "Runs automatically",
    icon: ShieldCheck,
    activeColor: "text-emerald-500",
    activeBg: "bg-emerald-500/10",
  },
  {
    value: "ask",
    label: "Ask",
    description: "Requires confirmation",
    icon: ShieldQuestion,
    activeColor: "text-yellow-500",
    activeBg: "bg-yellow-500/10",
  },
  {
    value: "deny",
    label: "Deny",
    description: "Blocked from use",
    icon: ShieldAlert,
    activeColor: "text-red-500",
    activeBg: "bg-red-500/10",
  },
];

export function McpSettingsManager() {
  const mcpSettings = useQuery(
    api.functions.mcpServers.getSettings,
    {},
    { default: { enabled: true } },
  );
  const mcpEnabled = mcpSettings?.enabled !== false;
  const configuredServers = useQuery(
    api.functions.mcpServers.listConfigured,
    {},
    { default: [] },
  );
  const servers = useMemo(() => configuredServers ?? [], [configuredServers]);
  const createServer = useMutation(api.functions.mcpServers.create);
  const updateServer = useMutation(api.functions.mcpServers.update);
  const removeServer = useMutation(api.functions.mcpServers.remove);
  const setMcpEnabled = useMutation(api.functions.mcpServers.setEnabled);
  const updateToolPermissionsMutation = useMutation(
    api.functions.mcpServers.updateToolPermissions,
  );

  const [drafts, setDrafts] = useReducerState<Record<string, McpServerDraft>>(
    {},
  );
  const [editingIds, setEditingIds] = useReducerState<Record<string, boolean>>(
    {},
  );
  const [expandedIds, setExpandedIds] = useReducerState<
    Record<string, boolean>
  >({});
  const [newServerName, setNewServerName] = useReducerState("");
  const [newServerUrl, setNewServerUrl] = useReducerState("");
  const [newAuthHeaders, setNewAuthHeaders] = useReducerState<
    AuthHeaderDraft[]
  >([]);
  const [showAddServer, setShowAddServer] = useReducerState(false);
  const [savingEnabled, setSavingEnabled] = useReducerState(false);
  const [creating, setCreating] = useReducerState(false);
  const [savingId, setSavingId] = useReducerState<string | null>(null);
  const [deletingId, setDeletingId] = useReducerState<string | null>(null);
  const [toolStates, setToolStates] = useState<Record<string, ServerToolState>>(
    {},
  );
  const [savingPermissions, setSavingPermissions] = useState<
    Record<string, boolean>
  >({});

  const mergedDrafts = useMemo(
    () =>
      Object.fromEntries(
        servers.map((server) => [
          server.mcpServerId,
          drafts[server.mcpServerId] ?? createDraft(server),
        ]),
      ),
    [drafts, servers],
  );

  const dirtyIds = useMemo(
    () =>
      new Set(
        servers.flatMap((server) => {
          const draft = mergedDrafts[server.mcpServerId];
          const authHeaders = server.authHeaders ?? [];
          return draft?.name !== server.name ||
            draft.url !== server.url ||
            serializeAuthHeaders(draft.authHeaders) !==
              serializeAuthHeaders(authHeaders)
            ? [server.mcpServerId]
            : [];
        }),
      ),
    [mergedDrafts, servers],
  );

  const handleCreate = async () => {
    setCreating(true);
    try {
      await createServer({
        name: newServerName,
        url: newServerUrl,
        authHeaders: compactAuthHeaders(newAuthHeaders),
      });
      setNewServerName("");
      setNewServerUrl("");
      setNewAuthHeaders([]);
      setShowAddServer(false);
      toast.success("MCP server added");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to add MCP server",
      );
    } finally {
      setCreating(false);
    }
  };

  const handleSave = async (mcpServerId: string) => {
    const draft = mergedDrafts[mcpServerId];
    if (!draft) return;

    setSavingId(mcpServerId);
    try {
      await updateServer({
        mcpServerId,
        patch: {
          name: draft.name,
          url: draft.url,
          authHeaders: compactAuthHeaders(draft.authHeaders),
        },
      });
      setEditingIds((current) => ({ ...current, [mcpServerId]: false }));
      toast.success("MCP server updated");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to update MCP server",
      );
    } finally {
      setSavingId(null);
    }
  };

  const handleEnabledChange = async (enabled: boolean) => {
    setSavingEnabled(true);
    try {
      await setMcpEnabled({ enabled });
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to update MCP settings",
      );
    } finally {
      setSavingEnabled(false);
    }
  };

  const handleDelete = async (mcpServerId: string, name: string) => {
    if (!window.confirm(`Delete "${name}"?`)) return;

    setDeletingId(mcpServerId);
    try {
      await removeServer({ mcpServerId });
      setDrafts((current) => {
        const next = { ...current };
        delete next[mcpServerId];
        return next;
      });
      setEditingIds((current) => {
        const next = { ...current };
        delete next[mcpServerId];
        return next;
      });
      setToolStates((current) => {
        const next = { ...current };
        delete next[mcpServerId];
        return next;
      });
      toast.success("MCP server removed");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to remove MCP server",
      );
    } finally {
      setDeletingId(null);
    }
  };

  const discoverTools = useCallback(
    async (mcpServerId: string) => {
      setToolStates((current) => ({
        ...current,
        [mcpServerId]: {
          tools: current[mcpServerId]?.tools ?? [],
          loading: true,
          error: null,
          lastFetched: current[mcpServerId]?.lastFetched ?? null,
        },
      }));

      try {
        const response = await fetch("/api/mcp/discover-tools", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mcpServerId }),
        });

        const data = (await response.json()) as {
          tools?: DiscoveredTool[];
          error?: string;
        };

        if (!response.ok || !data.tools) {
          setToolStates((current) => ({
            ...current,
            [mcpServerId]: {
              tools: [],
              loading: false,
              error: data.error ?? "Failed to connect",
              lastFetched: null,
            },
          }));
          return;
        }

        setToolStates((current) => ({
          ...current,
          [mcpServerId]: {
            tools: data.tools ?? [],
            loading: false,
            error: null,
            lastFetched: Date.now(),
          },
        }));

        setExpandedIds((current) => ({
          ...current,
          [mcpServerId]: true,
        }));
      } catch (error) {
        setToolStates((current) => ({
          ...current,
          [mcpServerId]: {
            tools: [],
            loading: false,
            error: error instanceof Error ? error.message : "Connection failed",
            lastFetched: null,
          },
        }));
      }
    },
    [setExpandedIds],
  );

  const handlePermissionChange = useCallback(
    async (
      mcpServerId: string,
      toolName: string,
      permission: McpToolPermission,
    ) => {
      setSavingPermissions((current) => ({ ...current, [mcpServerId]: true }));
      try {
        await updateToolPermissionsMutation({
          mcpServerId,
          toolName,
          permission,
        });
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : "Failed to update permission",
        );
      } finally {
        setSavingPermissions((current) => ({
          ...current,
          [mcpServerId]: false,
        }));
      }
    },
    [updateToolPermissionsMutation],
  );

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8">
      {/* Page header */}
      <div className="flex flex-row flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-2">
          <MobileSidebarTrigger />
          <h1 className="min-w-0 text-2xl font-semibold tracking-tight">
            MCP Servers
          </h1>
        </div>
      </div>

      {/* Enable / disable section */}
      <section className="flex flex-col gap-2">
        <div>
          <h2 className="text-sm font-semibold">General</h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Connect external tools and data sources via the Model Context
            Protocol.
          </p>
        </div>

        <div className="divide-border/60 border-border/60 bg-card/40 divide-y rounded-lg border">
          <div className="flex flex-col gap-2 px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">Enable MCP servers</p>
              <p className="text-muted-foreground mt-0.5 text-xs">
                Allow connected MCP servers to provide tools in your chats.
              </p>
            </div>
            <Switch
              checked={mcpEnabled}
              disabled={savingEnabled}
              onCheckedChange={(checked) => void handleEnabledChange(checked)}
              aria-label="Enable MCP servers"
            />
          </div>
        </div>
      </section>

      {mcpEnabled ? (
        <>
          {/* Servers section */}
          <section className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold">Servers</h2>
                <p className="text-muted-foreground mt-1 text-sm">
                  Manage your MCP server connections and per-tool permissions.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowAddServer(!showAddServer)}
              >
                {showAddServer ? (
                  <X className="size-4" />
                ) : (
                  <Plus className="size-4" />
                )}
                {showAddServer ? "Cancel" : "Add server"}
              </Button>
            </div>

            {/* Add server form */}
            {showAddServer ? (
              <div className="border-border/60 bg-card/40 rounded-lg border p-4">
                <div className="flex flex-col gap-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="flex flex-col gap-1.5">
                      <Label
                        htmlFor="new-server-name"
                        className="text-xs font-medium"
                      >
                        Name
                      </Label>
                      <Input
                        id="new-server-name"
                        value={newServerName}
                        placeholder="My MCP Server"
                        onChange={(e) => setNewServerName(e.target.value)}
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label
                        htmlFor="new-server-url"
                        className="text-xs font-medium"
                      >
                        Endpoint URL
                      </Label>
                      <Input
                        id="new-server-url"
                        value={newServerUrl}
                        placeholder="https://example.com/mcp"
                        onChange={(e) => setNewServerUrl(e.target.value)}
                      />
                    </div>
                  </div>

                  <AuthHeadersEditor
                    authHeaders={newAuthHeaders}
                    disabled={creating}
                    idPrefix="new-mcp-server"
                    onChange={setNewAuthHeaders}
                  />

                  <div className="flex justify-end">
                    <Button
                      size="sm"
                      disabled={
                        creating ||
                        newServerName.trim().length === 0 ||
                        newServerUrl.trim().length === 0
                      }
                      onClick={() => void handleCreate()}
                    >
                      {creating ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Plus className="size-4" />
                      )}
                      {creating ? "Adding..." : "Add server"}
                    </Button>
                  </div>
                </div>
              </div>
            ) : null}

            {/* Server list */}
            {servers.length === 0 && !showAddServer ? (
              <div className="border-border/60 text-muted-foreground flex flex-col items-center gap-3 rounded-lg border border-dashed px-6 py-10 text-center">
                <McpLogo className="text-muted-foreground/60 size-8" />
                <div>
                  <p className="text-sm font-medium">No servers configured</p>
                  <p className="mt-1 text-xs">
                    Add an MCP server to connect external tools to your chats.
                  </p>
                </div>
              </div>
            ) : null}

            {servers.map((server) => {
              const draft =
                mergedDrafts[server.mcpServerId] ?? createDraft(server);
              const isEditing = editingIds[server.mcpServerId] === true;
              const isExpanded = expandedIds[server.mcpServerId] === true;
              const isDirty = dirtyIds.has(server.mcpServerId);
              const isSaving = savingId === server.mcpServerId;
              const isDeleting = deletingId === server.mcpServerId;
              const toolState = toolStates[server.mcpServerId];
              const permissions = server.toolPermissions;
              const hasTools = toolState?.tools && toolState.tools.length > 0;
              const isConnected = toolState?.lastFetched && !toolState.error;

              return (
                <div
                  key={server.mcpServerId}
                  className="border-border/60 bg-card/40 overflow-hidden rounded-lg border"
                >
                  {/* Server header row */}
                  <div className="flex items-center gap-3 px-3 py-3">
                    <button
                      type="button"
                      className="text-muted-foreground hover:text-foreground shrink-0 transition-colors"
                      disabled={!hasTools}
                      onClick={() =>
                        hasTools &&
                        setExpandedIds((current) => ({
                          ...current,
                          [server.mcpServerId]: !isExpanded,
                        }))
                      }
                      aria-label={
                        isExpanded ? "Collapse tools" : "Expand tools"
                      }
                    >
                      {hasTools ? (
                        <ChevronDown
                          className={cn(
                            "size-4 transition-transform duration-200",
                            isExpanded && "rotate-180",
                          )}
                        />
                      ) : (
                        <ChevronRight className="size-4 opacity-30" />
                      )}
                    </button>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium">
                          {server.name}
                        </span>
                        {isConnected ? (
                          <Badge variant="outline" color="green">
                            <Check className="size-3" />
                            Connected
                          </Badge>
                        ) : null}
                        {toolState?.error ? (
                          <Badge variant="outline" color="red">
                            <AlertCircle className="size-3" />
                            Error
                          </Badge>
                        ) : null}
                        {hasTools ? (
                          <Badge variant="outline" color="muted">
                            {toolState.tools.length} tool
                            {toolState.tools.length !== 1 ? "s" : ""}
                          </Badge>
                        ) : null}
                      </div>
                      <p className="text-muted-foreground mt-0.5 truncate text-xs">
                        {server.url}
                      </p>
                    </div>

                    <div className="flex shrink-0 items-center gap-0.5">
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              disabled={
                                isSaving || isDeleting || toolState?.loading
                              }
                              aria-label="Test connection"
                              onClick={() =>
                                void discoverTools(server.mcpServerId)
                              }
                            />
                          }
                        >
                          {toolState?.loading ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : (
                            <Plug className="size-4" />
                          )}
                        </TooltipTrigger>
                        <TooltipContent>
                          Test connection & discover tools
                        </TooltipContent>
                      </Tooltip>

                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              disabled={isSaving || isDeleting}
                              aria-label={
                                isEditing ? "Close editor" : "Edit server"
                              }
                              onClick={() =>
                                setEditingIds((current) => ({
                                  ...current,
                                  [server.mcpServerId]: !isEditing,
                                }))
                              }
                            />
                          }
                        >
                          {isEditing ? (
                            <X className="size-4" />
                          ) : (
                            <Pencil className="size-4" />
                          )}
                        </TooltipTrigger>
                        <TooltipContent>
                          {isEditing ? "Cancel editing" : "Edit server"}
                        </TooltipContent>
                      </Tooltip>

                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              disabled={isDeleting || isSaving}
                              aria-label="Delete server"
                              onClick={() =>
                                void handleDelete(
                                  server.mcpServerId,
                                  server.name,
                                )
                              }
                            />
                          }
                        >
                          {isDeleting ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : (
                            <Trash2 className="size-4" />
                          )}
                        </TooltipTrigger>
                        <TooltipContent>Delete server</TooltipContent>
                      </Tooltip>
                    </div>
                  </div>

                  {/* Error state */}
                  {toolState?.error ? (
                    <div className="border-border/60 mx-3 mb-3 flex items-start gap-2 rounded-md border border-red-500/20 bg-red-500/5 p-3 text-sm text-red-500">
                      <AlertCircle className="mt-0.5 size-4 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-xs font-medium">Connection failed</p>
                        <p className="text-muted-foreground mt-0.5 text-xs">
                          {toolState.error}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="ml-auto shrink-0"
                        disabled={toolState.loading}
                        onClick={() => void discoverTools(server.mcpServerId)}
                      >
                        <ExternalLink className="size-3.5" />
                      </Button>
                    </div>
                  ) : null}

                  {/* Prompt to discover tools */}
                  {!toolState && !isEditing ? (
                    <div className="border-border/60 mx-3 mb-3 border-t pt-3">
                      <button
                        type="button"
                        className="text-muted-foreground hover:text-foreground hover:border-border flex w-full items-center justify-center gap-2 rounded-md border border-dashed border-transparent py-2 text-xs transition-colors"
                        disabled={isSaving || isDeleting}
                        onClick={() => void discoverTools(server.mcpServerId)}
                      >
                        <Plug className="size-3.5" />
                        Test connection & discover tools
                      </button>
                    </div>
                  ) : null}

                  {/* Tools permissions panel */}
                  {isExpanded && hasTools ? (
                    <div className="border-border/60 border-t">
                      {/* Permission column headers */}
                      <div className="bg-muted/30 flex items-center gap-3 px-3 py-2">
                        <span className="text-muted-foreground flex-1 text-xs font-medium">
                          Tool
                        </span>
                        <div className="flex shrink-0">
                          {PERMISSION_OPTIONS.map((perm) => (
                            <span
                              key={perm.value}
                              className="text-muted-foreground w-16 text-center text-xs font-medium"
                            >
                              {perm.label}
                            </span>
                          ))}
                        </div>
                      </div>

                      {/* Tool rows */}
                      <div className="divide-border/40 divide-y">
                        {toolState.tools.map((tool) => (
                          <ToolPermissionRow
                            key={tool.name}
                            tool={tool}
                            permission={permissions[tool.name] ?? "allow"}
                            saving={
                              savingPermissions[server.mcpServerId] ?? false
                            }
                            onPermissionChange={(permission) =>
                              void handlePermissionChange(
                                server.mcpServerId,
                                tool.name,
                                permission,
                              )
                            }
                          />
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {/* Edit mode */}
                  {isEditing ? (
                    <div className="border-border/60 flex flex-col gap-3 border-t p-3">
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="flex flex-col gap-1.5">
                          <Label
                            htmlFor={`edit-name-${server.mcpServerId}`}
                            className="text-xs font-medium"
                          >
                            Name
                          </Label>
                          <Input
                            id={`edit-name-${server.mcpServerId}`}
                            value={draft.name}
                            onChange={(e) =>
                              setDrafts((current) => ({
                                ...current,
                                [server.mcpServerId]: {
                                  ...(current[server.mcpServerId] ?? draft),
                                  name: e.target.value,
                                },
                              }))
                            }
                          />
                        </div>
                        <div className="flex flex-col gap-1.5">
                          <Label
                            htmlFor={`edit-url-${server.mcpServerId}`}
                            className="text-xs font-medium"
                          >
                            Endpoint URL
                          </Label>
                          <Input
                            id={`edit-url-${server.mcpServerId}`}
                            value={draft.url}
                            onChange={(e) =>
                              setDrafts((current) => ({
                                ...current,
                                [server.mcpServerId]: {
                                  ...(current[server.mcpServerId] ?? draft),
                                  url: e.target.value,
                                },
                              }))
                            }
                          />
                        </div>
                      </div>
                      <AuthHeadersEditor
                        authHeaders={draft.authHeaders}
                        disabled={isSaving || isDeleting}
                        idPrefix={server.mcpServerId}
                        onChange={(authHeaders) =>
                          setDrafts((current) => ({
                            ...current,
                            [server.mcpServerId]: {
                              ...(current[server.mcpServerId] ?? draft),
                              authHeaders,
                            },
                          }))
                        }
                      />
                      <div className="flex justify-end">
                        <Button
                          size="sm"
                          disabled={!isDirty || isSaving || isDeleting}
                          onClick={() => void handleSave(server.mcpServerId)}
                        >
                          {isSaving ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : (
                            <Save className="size-4" />
                          )}
                          {isSaving ? "Saving..." : "Save changes"}
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </section>
        </>
      ) : (
        <div className="border-border/60 text-muted-foreground flex items-center gap-3 rounded-lg border px-3 py-6 text-sm">
          <McpLogo className="size-4 shrink-0" />
          MCP servers are disabled. Turn them on to add or manage servers.
        </div>
      )}
    </div>
  );
}

function ToolPermissionRow({
  tool,
  permission,
  saving,
  onPermissionChange,
}: {
  tool: DiscoveredTool;
  permission: McpToolPermission;
  saving: boolean;
  onPermissionChange: (permission: McpToolPermission) => void;
}) {
  return (
    <div className="flex items-center gap-3 px-3 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{tool.name}</p>
        {tool.description ? (
          <p className="text-muted-foreground mt-0.5 line-clamp-1 text-xs">
            {tool.description}
          </p>
        ) : null}
      </div>
      <RadioGroup
        value={permission}
        onValueChange={(value) =>
          onPermissionChange(value as McpToolPermission)
        }
        orientation="horizontal"
        className="flex w-auto shrink-0"
        disabled={saving}
      >
        {PERMISSION_OPTIONS.map((perm) => {
          const isActive = permission === perm.value;
          return (
            <Label
              key={perm.value}
              className={cn(
                "flex w-16 cursor-pointer items-center justify-center rounded-md py-1.5 transition-colors",
                isActive ? perm.activeBg : "hover:bg-muted/50",
                saving && "cursor-not-allowed opacity-50",
              )}
            >
              <RadioGroupItem
                value={perm.value}
                className="sr-only"
                aria-label={`${perm.label} ${tool.name}`}
              />
              <perm.icon
                className={cn(
                  "size-4 transition-colors",
                  isActive ? perm.activeColor : "text-muted-foreground/50",
                )}
              />
            </Label>
          );
        })}
      </RadioGroup>
    </div>
  );
}

function AuthHeadersEditor({
  authHeaders,
  disabled,
  idPrefix,
  onChange,
}: {
  authHeaders: AuthHeaderDraft[];
  disabled: boolean;
  idPrefix: string;
  onChange: (authHeaders: AuthHeaderDraft[]) => void;
}) {
  const updateHeader = (
    index: number,
    field: keyof AuthHeaderDraft,
    value: string,
  ) => {
    onChange(
      authHeaders.map((header, headerIndex) =>
        headerIndex === index ? { ...header, [field]: value } : header,
      ),
    );
  };

  const removeHeader = (index: number) => {
    onChange(authHeaders.filter((_, headerIndex) => headerIndex !== index));
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <KeyRound className="text-muted-foreground size-3.5" />
          <span className="text-xs font-medium">Auth headers</span>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs"
          disabled={disabled}
          onClick={() => onChange([...authHeaders, { name: "", value: "" }])}
        >
          <Plus className="size-3.5" />
          Add
        </Button>
      </div>

      {authHeaders.length > 0 ? (
        <div className="flex flex-col gap-2">
          {authHeaders.map((header, index) => (
            <div
              key={`${idPrefix}-auth-header-${index}`}
              className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)_auto]"
            >
              <Input
                aria-label="Header name"
                disabled={disabled}
                placeholder="Authorization"
                value={header.name}
                className="h-8 text-xs"
                onChange={(e) => updateHeader(index, "name", e.target.value)}
              />
              <Input
                aria-label="Header value"
                disabled={disabled}
                placeholder="Bearer token"
                type="password"
                value={header.value}
                className="h-8 text-xs"
                onChange={(e) => updateHeader(index, "value", e.target.value)}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                disabled={disabled}
                onClick={() => removeHeader(index)}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-muted-foreground text-xs">No auth headers.</p>
      )}
    </div>
  );
}
