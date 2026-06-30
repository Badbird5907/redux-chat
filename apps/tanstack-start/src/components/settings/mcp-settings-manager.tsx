"use client";

import { useCallback, useMemo, useState } from "react";
import { useMutation } from "convex/react";
import {
  AlertCircle,
  ArrowLeft,
  Check,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@redux/ui/components/select";
import { Switch } from "@redux/ui/components/switch";
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
  icon: typeof ShieldCheck;
  activeColor: string;
  activeBg: string;
}[] = [
  {
    value: "allow",
    label: "Allow",
    icon: ShieldCheck,
    activeColor: "text-emerald-500",
    activeBg: "bg-emerald-500/10",
  },
  {
    value: "ask",
    label: "Ask",
    icon: ShieldQuestion,
    activeColor: "text-yellow-500",
    activeBg: "bg-yellow-500/10",
  },
  {
    value: "deny",
    label: "Deny",
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
  const bulkSetToolPermissionsMutation = useMutation(
    api.functions.mcpServers.bulkSetToolPermissions,
  );

  const [selectedServerId, setSelectedServerId] = useReducerState<
    string | null
  >(null);
  const [drafts, setDrafts] = useReducerState<Record<string, McpServerDraft>>(
    {},
  );
  const [editingIds, setEditingIds] = useReducerState<Record<string, boolean>>(
    {},
  );
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

  const selectedServer = useMemo(
    () => servers.find((s) => s.mcpServerId === selectedServerId) ?? null,
    [servers, selectedServerId],
  );

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
      const result = await createServer({
        name: newServerName,
        url: newServerUrl,
        authHeaders: compactAuthHeaders(newAuthHeaders),
      });
      setNewServerName("");
      setNewServerUrl("");
      setNewAuthHeaders([]);
      setShowAddServer(false);
      setSelectedServerId(result.mcpServerId);
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
      if (selectedServerId === mcpServerId) {
        setSelectedServerId(null);
      }
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

  // Determine what the "current bulk value" is — only defined if all tools share the same permission
  const selectedToolState = selectedServerId
    ? toolStates[selectedServerId]
    : null;
  const bulkPermissionValue = useMemo(() => {
    if (
      !selectedServer ||
      !selectedToolState?.tools ||
      selectedToolState.tools.length === 0
    )
      return undefined;
    const perms = selectedServer.toolPermissions;
    const values = selectedToolState.tools.map((t) => perms[t.name] ?? "allow");
    return values.every((v) => v === values[0]) ? values[0] : undefined;
  }, [selectedServer, selectedToolState]);

  return (
    <div className="flex w-full flex-col gap-6">
      {/* Page header */}
      <div className="flex items-center gap-2">
        <MobileSidebarTrigger />
        <h1 className="text-2xl font-semibold tracking-tight">MCP Servers</h1>
      </div>

      {/* Enable / disable */}
      <div className="divide-border/60 border-border/60 bg-card/40 divide-y rounded-lg border">
        <div className="flex items-center justify-between gap-4 px-4 py-3">
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

      {mcpEnabled ? (
        <div className="border-border/60 bg-card/40 flex min-h-[420px] overflow-hidden rounded-lg border max-md:flex-col md:h-[540px]">
          {/* Left panel: server list */}
          <div
            className={cn(
              "border-border/60 flex flex-col md:w-64 md:shrink-0 md:border-r",
              selectedServer && "max-md:hidden",
            )}
          >
            <div className="border-border/60 flex items-center justify-between border-b px-4 py-3">
              <span className="text-xs font-semibold tracking-wider uppercase">
                Servers
              </span>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => {
                  setShowAddServer(!showAddServer);
                  setSelectedServerId(null);
                }}
                aria-label={showAddServer ? "Cancel" : "Add server"}
              >
                {showAddServer ? (
                  <X className="size-4" />
                ) : (
                  <Plus className="size-4" />
                )}
              </Button>
            </div>

            <div className="flex-1 overflow-y-auto">
              {servers.map((server) => {
                const isActive = server.mcpServerId === selectedServerId;
                const toolState = toolStates[server.mcpServerId];
                const isConnected = toolState?.lastFetched && !toolState.error;

                return (
                  <button
                    key={server.mcpServerId}
                    type="button"
                    className={cn(
                      "border-border/60 flex w-full items-center gap-3 border-b px-4 py-3 text-left transition-colors",
                      isActive ? "bg-muted/60" : "hover:bg-muted/30",
                    )}
                    onClick={() => {
                      setSelectedServerId(server.mcpServerId);
                      setShowAddServer(false);
                    }}
                  >
                    <div
                      className={cn(
                        "size-2 shrink-0 rounded-full",
                        isConnected
                          ? "bg-emerald-500"
                          : toolState?.error
                            ? "bg-red-500"
                            : "bg-muted-foreground/30",
                      )}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {server.name}
                      </p>
                    </div>
                  </button>
                );
              })}

              {servers.length === 0 && !showAddServer ? (
                <div className="text-muted-foreground flex flex-col items-center gap-2 px-4 py-8 text-center">
                  <McpLogo className="text-muted-foreground/40 size-6" />
                  <p className="text-xs">No servers configured</p>
                </div>
              ) : null}
            </div>
          </div>

          {/* Right panel: detail or add form */}
          <div
            className={cn(
              "flex min-w-0 flex-1 flex-col overflow-y-auto",
              !selectedServer && !showAddServer && "max-md:hidden",
            )}
          >
            {showAddServer ? (
              <AddServerForm
                name={newServerName}
                url={newServerUrl}
                authHeaders={newAuthHeaders}
                creating={creating}
                onNameChange={setNewServerName}
                onUrlChange={setNewServerUrl}
                onAuthHeadersChange={setNewAuthHeaders}
                onSubmit={() => void handleCreate()}
                onCancel={() => setShowAddServer(false)}
              />
            ) : selectedServer ? (
              <ServerDetail
                server={selectedServer}
                draft={
                  mergedDrafts[selectedServer.mcpServerId] ??
                  createDraft(selectedServer)
                }
                isEditing={editingIds[selectedServer.mcpServerId] === true}
                isDirty={dirtyIds.has(selectedServer.mcpServerId)}
                isSaving={savingId === selectedServer.mcpServerId}
                isDeleting={deletingId === selectedServer.mcpServerId}
                toolState={toolStates[selectedServer.mcpServerId] ?? null}
                savingPermissions={
                  savingPermissions[selectedServer.mcpServerId] ?? false
                }
                bulkPermissionValue={bulkPermissionValue}
                onBack={() => setSelectedServerId(null)}
                onToggleEdit={() =>
                  setEditingIds((current) => ({
                    ...current,
                    [selectedServer.mcpServerId]:
                      !current[selectedServer.mcpServerId],
                  }))
                }
                onDraftChange={(patch) =>
                  setDrafts((current) => ({
                    ...current,
                    [selectedServer.mcpServerId]: {
                      ...(current[selectedServer.mcpServerId] ??
                        createDraft(selectedServer)),
                      ...patch,
                    },
                  }))
                }
                onSave={() => void handleSave(selectedServer.mcpServerId)}
                onDelete={() =>
                  void handleDelete(
                    selectedServer.mcpServerId,
                    selectedServer.name,
                  )
                }
                onDiscover={() =>
                  void discoverTools(selectedServer.mcpServerId)
                }
                onPermissionChange={(toolName, permission) =>
                  void handlePermissionChange(
                    selectedServer.mcpServerId,
                    toolName,
                    permission,
                  )
                }
                onBulkPermission={(permission, toolNames) =>
                  void handleBulkPermission(
                    selectedServer.mcpServerId,
                    permission,
                    toolNames,
                  )
                }
              />
            ) : (
              <div className="text-muted-foreground flex flex-1 flex-col items-center justify-center gap-3 p-8">
                <McpLogo className="text-muted-foreground/30 size-10" />
                <p className="text-sm">Select a server to view details</p>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="border-border/60 text-muted-foreground flex items-center gap-3 rounded-lg border px-4 py-6 text-sm">
          <McpLogo className="size-4 shrink-0" />
          MCP servers are disabled. Turn them on to add or manage servers.
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Add Server Form
// ---------------------------------------------------------------------------

function AddServerForm({
  name,
  url,
  authHeaders,
  creating,
  onNameChange,
  onUrlChange,
  onAuthHeadersChange,
  onSubmit,
  onCancel,
}: {
  name: string;
  url: string;
  authHeaders: AuthHeaderDraft[];
  creating: boolean;
  onNameChange: (value: string) => void;
  onUrlChange: (value: string) => void;
  onAuthHeadersChange: (headers: AuthHeaderDraft[]) => void;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground md:hidden"
          onClick={onCancel}
        >
          <ArrowLeft className="size-4" />
        </button>
        <h2 className="text-sm font-semibold">Add MCP Server</h2>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="new-server-name" className="text-xs font-medium">
            Name
          </Label>
          <Input
            id="new-server-name"
            value={name}
            placeholder="My MCP Server"
            onChange={(e) => onNameChange(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="new-server-url" className="text-xs font-medium">
            Endpoint URL
          </Label>
          <Input
            id="new-server-url"
            value={url}
            placeholder="https://example.com/mcp"
            onChange={(e) => onUrlChange(e.target.value)}
          />
        </div>

        <AuthHeadersEditor
          authHeaders={authHeaders}
          disabled={creating}
          idPrefix="new-mcp-server"
          onChange={onAuthHeadersChange}
        />

        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={
              creating || name.trim().length === 0 || url.trim().length === 0
            }
            onClick={onSubmit}
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
  );
}

// ---------------------------------------------------------------------------
// Server Detail Panel
// ---------------------------------------------------------------------------

function ServerDetail({
  server,
  draft,
  isEditing,
  isDirty,
  isSaving,
  isDeleting,
  toolState,
  savingPermissions,
  bulkPermissionValue,
  onBack,
  onToggleEdit,
  onDraftChange,
  onSave,
  onDelete,
  onDiscover,
  onPermissionChange,
  onBulkPermission,
}: {
  server: {
    mcpServerId: string;
    name: string;
    url: string;
    authHeaders?: AuthHeaderDraft[];
    toolPermissions: Record<string, McpToolPermission>;
  };
  draft: McpServerDraft;
  isEditing: boolean;
  isDirty: boolean;
  isSaving: boolean;
  isDeleting: boolean;
  toolState: ServerToolState | null;
  savingPermissions: boolean;
  bulkPermissionValue: McpToolPermission | undefined;
  onBack: () => void;
  onToggleEdit: () => void;
  onDraftChange: (patch: Partial<McpServerDraft>) => void;
  onSave: () => void;
  onDelete: () => void;
  onDiscover: () => void;
  onPermissionChange: (toolName: string, permission: McpToolPermission) => void;
  onBulkPermission: (
    permission: McpToolPermission,
    toolNames: string[],
  ) => void;
}) {
  const isConnected = toolState?.lastFetched && !toolState.error;
  const hasTools = toolState?.tools && toolState.tools.length > 0;

  return (
    <div className="flex flex-col">
      {/* Server header */}
      <div className="border-border/60 flex items-center gap-3 border-b px-4 py-3">
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground md:hidden"
          onClick={onBack}
        >
          <ArrowLeft className="size-4" />
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="truncate text-sm font-semibold">{server.name}</h2>
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
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={isSaving || isDeleting || toolState?.loading}
            aria-label="Test connection"
            onClick={onDiscover}
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
            onClick={onToggleEdit}
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
            onClick={onDelete}
          >
            {isDeleting ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Trash2 className="size-4" />
            )}
          </Button>
        </div>
      </div>

      {/* Server info */}
      <div className="border-border/60 border-b px-4 py-3">
        <p className="text-muted-foreground text-xs break-all">{server.url}</p>
      </div>

      {/* Error state */}
      {toolState?.error ? (
        <div className="border-border/60 border-b px-4 py-3">
          <div className="flex items-start gap-2 rounded-md border border-red-500/20 bg-red-500/5 p-3 text-red-500">
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            <div className="min-w-0">
              <p className="text-xs font-medium">Connection failed</p>
              <p className="text-muted-foreground mt-0.5 text-xs">
                {toolState.error}
              </p>
            </div>
          </div>
        </div>
      ) : null}

      {/* Edit mode */}
      {isEditing ? (
        <div className="border-border/60 flex flex-col gap-3 border-b p-4">
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
              onChange={(e) => onDraftChange({ name: e.target.value })}
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
              onChange={(e) => onDraftChange({ url: e.target.value })}
            />
          </div>
          <AuthHeadersEditor
            authHeaders={draft.authHeaders}
            disabled={isSaving || isDeleting}
            idPrefix={server.mcpServerId}
            onChange={(authHeaders) => onDraftChange({ authHeaders })}
          />
          <div className="flex justify-end">
            <Button
              size="sm"
              disabled={!isDirty || isSaving || isDeleting}
              onClick={onSave}
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

      {/* Tool permissions */}
      {hasTools ? (
        <div className="flex flex-1 flex-col">
          {/* Tools header with bulk dropdown */}
          <div className="border-border/60 flex items-center justify-between border-b px-4 py-2.5">
            <span className="text-xs font-semibold tracking-wider uppercase">
              Tool permissions
            </span>
            <Select
              value={bulkPermissionValue ?? ""}
              onValueChange={(value) => {
                onBulkPermission(
                  value as McpToolPermission,
                  toolState.tools.map((t) => t.name),
                );
              }}
            >
              <SelectTrigger
                size="sm"
                className="h-7 w-auto gap-1 text-xs"
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

          {/* Permission column labels */}
          <div className="bg-muted/20 flex items-center px-4 py-1.5">
            <span className="text-muted-foreground flex-1 text-[11px] font-medium">
              Tool
            </span>
            <div className="flex shrink-0">
              {PERMISSION_OPTIONS.map((perm) => (
                <span
                  key={perm.value}
                  className="text-muted-foreground w-9 text-center text-[11px] font-medium"
                >
                  {perm.label}
                </span>
              ))}
            </div>
          </div>

          {/* Tool rows */}
          <div className="divide-border/40 flex-1 divide-y overflow-y-auto">
            {toolState.tools.map((tool) => (
              <ToolPermissionRow
                key={tool.name}
                tool={tool}
                permission={server.toolPermissions[tool.name] ?? "allow"}
                saving={savingPermissions}
                onPermissionChange={(permission) =>
                  onPermissionChange(tool.name, permission)
                }
              />
            ))}
          </div>
        </div>
      ) : !toolState ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8">
          <Button
            variant="outline"
            size="sm"
            disabled={isSaving || isDeleting}
            onClick={onDiscover}
          >
            <Plug className="size-4" />
            Test connection & discover tools
          </Button>
          <p className="text-muted-foreground text-xs">
            Connect to this server to see available tools.
          </p>
        </div>
      ) : toolState.loading ? (
        <div className="flex flex-1 items-center justify-center p-8">
          <Loader2 className="text-muted-foreground size-5 animate-spin" />
        </div>
      ) : (
        <div className="text-muted-foreground flex flex-1 items-center justify-center p-8 text-center text-xs">
          No tools available on this server.
        </div>
      )}
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
    <div className="flex items-center gap-3 px-4 py-2">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm">{tool.name}</p>
        {tool.description ? (
          <p className="text-muted-foreground mt-0.5 truncate text-xs">
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
                "flex w-9 cursor-pointer items-center justify-center rounded-md py-1 transition-colors",
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
                  isActive ? perm.activeColor : "text-muted-foreground/40",
                )}
              />
            </Label>
          );
        })}
      </RadioGroup>
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
