"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation } from "convex/react";
import {
  AlertCircle,
  ChevronDown,
  ChevronRight,
  KeyRound,
  Link2,
  Link2Off,
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
import { Button } from "@redux/ui/components/button";
import { Card, CardContent, CardHeader } from "@redux/ui/components/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@redux/ui/components/dialog";
import { Input } from "@redux/ui/components/input";
import { Label } from "@redux/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@redux/ui/components/select";
import { Switch } from "@redux/ui/components/switch";

import { MobileSidebarTrigger } from "@/components/layout/mobile-sidebar-trigger";
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
  const bulkSetToolPermissionsMutation = useMutation(
    api.functions.mcpServers.bulkSetToolPermissions,
  );
  const clearOAuthTokensMutation = useMutation(
    api.functions.mcpServers.clearOAuthTokens,
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
  const [showAddForm, setShowAddForm] = useReducerState(false);
  const [savingEnabled, setSavingEnabled] = useReducerState(false);
  const [creating, setCreating] = useReducerState(false);
  const [savingId, setSavingId] = useReducerState<string | null>(null);
  const [deletingId, setDeletingId] = useReducerState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{
    mcpServerId: string;
    name: string;
  } | null>(null);
  const [toolStates, setToolStates] = useState<Record<string, ServerToolState>>(
    {},
  );
  const [savingPermissions, setSavingPermissions] = useState<
    Record<string, boolean>
  >({});
  const [connectingOAuth, setConnectingOAuth] = useState<
    Record<string, boolean>
  >({});
  const [disconnectingOAuth, setDisconnectingOAuth] = useState<
    Record<string, boolean>
  >({});

  // Listen for OAuth popup completion messages
  useEffect(() => {
    const handler = (event: MessageEvent<unknown>) => {
      const data = event.data as
        | { type?: string; success?: boolean }
        | null
        | undefined;
      if (
        data &&
        typeof data === "object" &&
        data.type === "mcp-oauth-complete"
      ) {
        setConnectingOAuth({});
        if (data.success) {
          toast.success("OAuth connected");
        }
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

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
      setShowAddForm(false);
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

  const handleDeleteConfirm = async () => {
    if (!deleteConfirm) return;
    const { mcpServerId } = deleteConfirm;
    setDeleteConfirm(null);
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

  const discoverTools = useCallback(async (mcpServerId: string) => {
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
  }, []);

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

  const handleOAuthConnect = useCallback((mcpServerId: string) => {
    setConnectingOAuth((current) => ({ ...current, [mcpServerId]: true }));
    const popup = window.open(
      `/api/mcp/oauth/authorize?mcpServerId=${encodeURIComponent(mcpServerId)}`,
      "mcp-oauth",
      "width=600,height=700,popup=yes",
    );
    if (!popup) {
      toast.error("Failed to open OAuth popup. Please allow popups.");
      setConnectingOAuth((current) => ({ ...current, [mcpServerId]: false }));
      return;
    }
    // Poll for popup close in case the message event doesn't fire
    const interval = setInterval(() => {
      if (popup.closed) {
        clearInterval(interval);
        setConnectingOAuth((current) => ({
          ...current,
          [mcpServerId]: false,
        }));
      }
    }, 500);
  }, []);

  const handleOAuthDisconnect = useCallback(
    async (mcpServerId: string) => {
      setDisconnectingOAuth((current) => ({ ...current, [mcpServerId]: true }));
      try {
        await clearOAuthTokensMutation({ mcpServerId });
        toast.success("OAuth disconnected");
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Failed to disconnect OAuth",
        );
      } finally {
        setDisconnectingOAuth((current) => ({
          ...current,
          [mcpServerId]: false,
        }));
      }
    },
    [clearOAuthTokensMutation],
  );

  const handleBulkPermission = useCallback(
    async (
      mcpServerId: string,
      permission: McpToolPermission,
      toolNames: string[],
    ) => {
      setSavingPermissions((current) => ({ ...current, [mcpServerId]: true }));
      try {
        await bulkSetToolPermissionsMutation({
          mcpServerId,
          permission,
          toolNames,
        });
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : "Failed to update permissions",
        );
      } finally {
        setSavingPermissions((current) => ({
          ...current,
          [mcpServerId]: false,
        }));
      }
    },
    [bulkSetToolPermissionsMutation],
  );

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      {/* Page header */}
      <div className="flex flex-col gap-2">
        <div className="flex items-start gap-2">
          <MobileSidebarTrigger className="mt-1" />
          <h1 className="min-w-0 text-2xl font-semibold tracking-tight">
            MCP Servers
          </h1>
        </div>
        <p className="text-muted-foreground text-sm">
          Connect external tools and data sources to your chats.
        </p>
      </div>

      {/* Enable / disable */}
      <Card>
        <CardContent className="flex items-center justify-between gap-4">
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
        </CardContent>
      </Card>

      {mcpEnabled ? (
        <>
          {/* Add server */}
          {showAddForm ? (
            <Card>
              <CardHeader className="flex flex-col gap-1">
                <div className="text-sm font-medium">Add MCP server</div>
                <div className="text-muted-foreground text-sm">
                  Connect a new MCP-compatible server.
                </div>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="new-server-name" className="text-xs">
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
                  <Label htmlFor="new-server-url" className="text-xs">
                    Endpoint URL
                  </Label>
                  <Input
                    id="new-server-url"
                    value={newServerUrl}
                    placeholder="https://example.com/mcp"
                    onChange={(e) => setNewServerUrl(e.target.value)}
                  />
                </div>
                <AuthHeadersEditor
                  authHeaders={newAuthHeaders}
                  disabled={creating}
                  idPrefix="new-mcp-server"
                  onChange={setNewAuthHeaders}
                />
                <div className="flex justify-end gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowAddForm(false)}
                  >
                    Cancel
                  </Button>
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
              </CardContent>
            </Card>
          ) : (
            <Button
              variant="outline"
              className="w-full border-dashed"
              onClick={() => setShowAddForm(true)}
            >
              <Plus className="size-4" />
              Add MCP server
            </Button>
          )}

          {/* Server cards */}
          {servers.map((server) => {
            const mcpServerId = server.mcpServerId;
            const isEditing = editingIds[mcpServerId] === true;
            const isExpanded = expandedIds[mcpServerId] === true;
            const isDirty = dirtyIds.has(mcpServerId);
            const isSaving = savingId === mcpServerId;
            const isDeleting = deletingId === mcpServerId;
            const draft = mergedDrafts[mcpServerId] ?? createDraft(server);
            const toolState = toolStates[mcpServerId] ?? null;
            const hasTools =
              toolState !== null &&
              toolState.tools.length > 0 &&
              !toolState.error;
            const isConnected =
              toolState?.lastFetched !== null &&
              toolState?.lastFetched !== undefined &&
              !toolState.error;
            const isSavingPerm = savingPermissions[mcpServerId] ?? false;
            const isConnectingOAuth = connectingOAuth[mcpServerId] ?? false;
            const isDisconnectingOAuth =
              disconnectingOAuth[mcpServerId] ?? false;

            const bulkValue = (() => {
              if (!toolState || toolState.tools.length === 0) return undefined;
              const values = toolState.tools.map(
                (t) => server.toolPermissions[t.name] ?? "allow",
              );
              return values.every((v) => v === values[0])
                ? values[0]
                : undefined;
            })();

            return (
              <Card key={mcpServerId}>
                {/* Server header row */}
                <CardHeader className="flex flex-row items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">
                        {server.name}
                      </span>
                      {server.hasOAuth ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/10 px-1.5 py-0.5 text-[10px] font-medium text-blue-500">
                          <Link2 className="size-2.5" />
                          OAuth
                        </span>
                      ) : null}
                      {isConnected ? (
                        <span className="size-2 shrink-0 rounded-full bg-emerald-500" />
                      ) : toolState?.error ? (
                        <span className="size-2 shrink-0 rounded-full bg-red-500" />
                      ) : null}
                    </div>
                    <p className="text-muted-foreground mt-0.5 truncate text-xs">
                      {server.url}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      disabled={isSaving || isDeleting || toolState?.loading}
                      aria-label="Test connection"
                      onClick={() => void discoverTools(mcpServerId)}
                    >
                      {toolState?.loading ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Plug className="size-4" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      disabled={isSaving || isDeleting}
                      aria-label={isEditing ? "Close editor" : "Edit server"}
                      onClick={() =>
                        setEditingIds((current) => ({
                          ...current,
                          [mcpServerId]: !current[mcpServerId],
                        }))
                      }
                    >
                      {isEditing ? (
                        <X className="size-4" />
                      ) : (
                        <Pencil className="size-4" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      disabled={isDeleting || isSaving}
                      aria-label="Delete server"
                      onClick={() =>
                        setDeleteConfirm({ mcpServerId, name: server.name })
                      }
                    >
                      {isDeleting ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Trash2 className="size-4" />
                      )}
                    </Button>
                  </div>
                </CardHeader>

                <CardContent className="flex flex-col gap-4 pt-0">
                  {/* Error */}
                  {toolState?.error ? (
                    <div className="flex items-start gap-2 rounded-md border border-red-500/20 bg-red-500/5 p-3 text-red-500">
                      <AlertCircle className="mt-0.5 size-4 shrink-0" />
                      <p className="text-xs">{toolState.error}</p>
                    </div>
                  ) : null}

                  {/* Edit mode */}
                  {isEditing ? (
                    <div className="border-border flex flex-col gap-3 rounded-md border p-3">
                      <div className="flex flex-col gap-1.5">
                        <Label
                          htmlFor={`edit-name-${mcpServerId}`}
                          className="text-xs"
                        >
                          Name
                        </Label>
                        <Input
                          id={`edit-name-${mcpServerId}`}
                          value={draft.name}
                          onChange={(e) =>
                            setDrafts((current) => ({
                              ...current,
                              [mcpServerId]: {
                                ...(current[mcpServerId] ??
                                  createDraft(server)),
                                name: e.target.value,
                              },
                            }))
                          }
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <Label
                          htmlFor={`edit-url-${mcpServerId}`}
                          className="text-xs"
                        >
                          Endpoint URL
                        </Label>
                        <Input
                          id={`edit-url-${mcpServerId}`}
                          value={draft.url}
                          onChange={(e) =>
                            setDrafts((current) => ({
                              ...current,
                              [mcpServerId]: {
                                ...(current[mcpServerId] ??
                                  createDraft(server)),
                                url: e.target.value,
                              },
                            }))
                          }
                        />
                      </div>
                      <AuthHeadersEditor
                        authHeaders={draft.authHeaders}
                        disabled={isSaving || isDeleting}
                        idPrefix={mcpServerId}
                        onChange={(authHeaders) =>
                          setDrafts((current) => ({
                            ...current,
                            [mcpServerId]: {
                              ...(current[mcpServerId] ?? createDraft(server)),
                              authHeaders,
                            },
                          }))
                        }
                      />
                      {/* OAuth section */}
                      <div className="border-border flex flex-col gap-2 border-t pt-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <Link2 className="text-muted-foreground size-3.5" />
                            <span className="text-xs font-medium">OAuth</span>
                          </div>
                          {server.hasOAuth ? (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs text-red-500 hover:text-red-600"
                              disabled={isDisconnectingOAuth}
                              onClick={() =>
                                void handleOAuthDisconnect(mcpServerId)
                              }
                            >
                              {isDisconnectingOAuth ? (
                                <Loader2 className="size-3.5 animate-spin" />
                              ) : (
                                <Link2Off className="size-3.5" />
                              )}
                              Disconnect
                            </Button>
                          ) : (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs"
                              disabled={isConnectingOAuth}
                              onClick={() => handleOAuthConnect(mcpServerId)}
                            >
                              {isConnectingOAuth ? (
                                <Loader2 className="size-3.5 animate-spin" />
                              ) : (
                                <Link2 className="size-3.5" />
                              )}
                              Connect with OAuth
                            </Button>
                          )}
                        </div>
                        <p className="text-muted-foreground text-xs">
                          {server.hasOAuth
                            ? "OAuth tokens are configured for this server."
                            : "Connect via OAuth if the server requires authorization."}
                        </p>
                      </div>

                      <div className="flex justify-end">
                        <Button
                          size="sm"
                          disabled={!isDirty || isSaving || isDeleting}
                          onClick={() => void handleSave(mcpServerId)}
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

                  {/* Tools section */}
                  {hasTools ? (
                    <div className="flex flex-col">
                      {/* Toggle to expand/collapse tools */}
                      <button
                        type="button"
                        className="hover:bg-muted/50 -mx-1 flex items-center gap-2 rounded-md px-1 py-1.5 transition-colors"
                        onClick={() =>
                          setExpandedIds((current) => ({
                            ...current,
                            [mcpServerId]: !current[mcpServerId],
                          }))
                        }
                      >
                        {isExpanded ? (
                          <ChevronDown className="text-muted-foreground size-4 shrink-0" />
                        ) : (
                          <ChevronRight className="text-muted-foreground size-4 shrink-0" />
                        )}
                        <span className="text-xs font-medium">
                          {toolState.tools.length} tool
                          {toolState.tools.length !== 1 ? "s" : ""}
                        </span>

                        {/* Bulk permission dropdown */}
                        {isExpanded ? (
                          <div
                            className="ml-auto"
                            onClick={(e) => e.stopPropagation()}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ")
                                e.stopPropagation();
                            }}
                          >
                            <Select
                              value={bulkValue ?? ""}
                              onValueChange={(value) => {
                                void handleBulkPermission(
                                  mcpServerId,
                                  value as McpToolPermission,
                                  toolState.tools.map((t) => t.name),
                                );
                              }}
                            >
                              <SelectTrigger
                                size="sm"
                                className="h-6 gap-1 text-xs"
                                aria-label="Set all tool permissions"
                              >
                                <SelectValue placeholder="Set all" />
                              </SelectTrigger>
                              <SelectContent position="popper" align="end">
                                <SelectItem value="allow">
                                  <ShieldCheck className="text-emerald-500" />
                                  Allow all
                                </SelectItem>
                                <SelectItem value="ask">
                                  <ShieldQuestion className="text-yellow-500" />
                                  Ask all
                                </SelectItem>
                                <SelectItem value="deny">
                                  <ShieldAlert className="text-red-500" />
                                  Deny all
                                </SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        ) : null}
                      </button>

                      {/* Tool rows */}
                      {isExpanded ? (
                        <div className="mt-1 flex flex-col gap-1">
                          {toolState.tools.map((tool) => (
                            <ToolPermissionRow
                              key={tool.name}
                              tool={tool}
                              permission={
                                server.toolPermissions[tool.name] ?? "allow"
                              }
                              saving={isSavingPerm}
                              onPermissionChange={(permission) =>
                                void handlePermissionChange(
                                  mcpServerId,
                                  tool.name,
                                  permission,
                                )
                              }
                            />
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ) : !toolState ? (
                    <div className="flex flex-col items-center gap-2 py-4">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={isSaving || isDeleting}
                        onClick={() => void discoverTools(mcpServerId)}
                      >
                        <Plug className="size-4" />
                        Test connection
                      </Button>
                      <p className="text-muted-foreground text-xs">
                        Connect to discover available tools.
                      </p>
                    </div>
                  ) : toolState.loading ? (
                    <div className="flex items-center justify-center py-4">
                      <Loader2 className="text-muted-foreground size-5 animate-spin" />
                    </div>
                  ) : !toolState.error ? (
                    <p className="text-muted-foreground py-2 text-center text-xs">
                      No tools available on this server.
                    </p>
                  ) : null}
                </CardContent>
              </Card>
            );
          })}

          {servers.length === 0 && !showAddForm ? (
            <p className="text-muted-foreground py-8 text-center text-sm">
              No servers configured. Add one to get started.
            </p>
          ) : null}
        </>
      ) : null}

      {/* Delete confirmation dialog */}
      <Dialog
        open={deleteConfirm !== null}
        onOpenChange={(next) => {
          if (!next) setDeleteConfirm(null);
        }}
      >
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Delete server</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete{" "}
              <strong>{deleteConfirm?.name}</strong>? This action cannot be
              undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => void handleDeleteConfirm()}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tool Permission Row
// ---------------------------------------------------------------------------

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
    <div className="bg-muted/30 flex items-center gap-3 rounded-md px-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm">{tool.name}</p>
        {tool.description ? (
          <p className="text-muted-foreground mt-0.5 truncate text-xs">
            {tool.description}
          </p>
        ) : null}
      </div>
      <Select
        value={permission}
        disabled={saving}
        onValueChange={(value) =>
          onPermissionChange(value as McpToolPermission)
        }
      >
        <SelectTrigger
          size="sm"
          className="h-7 w-auto shrink-0 gap-1.5 text-xs"
          aria-label={`Permission for ${tool.name}`}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent position="popper" align="end">
          <SelectItem value="allow">
            <ShieldCheck className="text-emerald-500" />
            Allow
          </SelectItem>
          <SelectItem value="ask">
            <ShieldQuestion className="text-yellow-500" />
            Ask
          </SelectItem>
          <SelectItem value="deny">
            <ShieldAlert className="text-red-500" />
            Deny
          </SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Auth Headers Editor
// ---------------------------------------------------------------------------

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
