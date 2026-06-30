"use client";

import { useCallback, useMemo, useState } from "react";
import { useMutation } from "convex/react";
import {
  AlertCircle,
  Check,
  ChevronDown,
  ChevronUp,
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
import { Button } from "@redux/ui/components/button";
import { Card, CardContent, CardHeader } from "@redux/ui/components/card";
import { Input } from "@redux/ui/components/input";
import { Label } from "@redux/ui/components/label";
import { RadioGroup, RadioGroupItem } from "@redux/ui/components/radio-group";
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

const PERMISSION_CONFIG: {
  value: McpToolPermission;
  label: string;
  icon: typeof ShieldCheck;
  color: string;
  activeColor: string;
}[] = [
  {
    value: "allow",
    label: "Allow",
    icon: ShieldCheck,
    color: "text-muted-foreground",
    activeColor: "text-green-500",
  },
  {
    value: "ask",
    label: "Ask",
    icon: ShieldQuestion,
    color: "text-muted-foreground",
    activeColor: "text-yellow-500",
  },
  {
    value: "deny",
    label: "Deny",
    icon: ShieldAlert,
    color: "text-muted-foreground",
    activeColor: "text-red-500",
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

    if (!draft) {
      return;
    }

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
      toast.success(enabled ? "MCP servers enabled" : "MCP servers disabled");
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
    if (!window.confirm(`Delete "${name}"?`)) {
      return;
    }

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

        // Auto-expand the server card to show tools
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
      currentPermissions: Record<string, McpToolPermission>,
    ) => {
      const next = { ...currentPermissions, [toolName]: permission };

      // Remove entries that are "allow" (the default) to keep it clean
      const cleaned = Object.fromEntries(
        Object.entries(next).filter(([, p]) => p !== "allow"),
      );

      setSavingPermissions((current) => ({ ...current, [mcpServerId]: true }));
      try {
        await updateToolPermissionsMutation({
          mcpServerId,
          toolPermissions: cleaned,
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
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="flex items-start gap-2">
            <MobileSidebarTrigger className="mt-1" />
            <h1 className="min-w-0 text-2xl font-semibold tracking-tight">
              MCP Servers
            </h1>
          </div>
          <p className="text-muted-foreground max-w-3xl text-sm">
            Connect external tools and data sources to use in your chats.
            Configure per-tool permissions to control how each tool is used.
          </p>
        </div>
        <Switch
          checked={mcpEnabled}
          disabled={savingEnabled}
          aria-label="Enable MCP servers"
          className="mt-1"
          onCheckedChange={(enabled) => void handleEnabledChange(enabled)}
        />
      </div>

      {!mcpEnabled ? (
        <Card>
          <CardContent className="text-muted-foreground flex items-center gap-3 py-6 text-sm">
            <McpLogo className="size-4" />
            MCP servers are disabled. Turn them on to add or manage servers.
          </CardContent>
        </Card>
      ) : null}

      {mcpEnabled ? (
        <>
          <Card>
            <CardHeader className="flex flex-col gap-1">
              <div className="text-sm font-medium">Add server</div>
              <div className="text-muted-foreground text-sm">
                Use a full `http://` or `https://` MCP endpoint URL. Optional
                auth headers will be sent with every MCP request.
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <Input
                value={newServerName}
                placeholder="Server name"
                onChange={(event) => setNewServerName(event.target.value)}
              />
              <Input
                value={newServerUrl}
                placeholder="https://example.com/mcp"
                onChange={(event) => setNewServerUrl(event.target.value)}
              />
              <AuthHeadersEditor
                authHeaders={newAuthHeaders}
                disabled={creating}
                idPrefix="new-mcp-server"
                onChange={setNewAuthHeaders}
              />
              <div className="flex justify-end">
                <Button
                  disabled={
                    creating ||
                    newServerName.trim().length === 0 ||
                    newServerUrl.trim().length === 0
                  }
                  onClick={() => void handleCreate()}
                >
                  {creating ? "Adding..." : "Add MCP server"}
                </Button>
              </div>
            </CardContent>
          </Card>

          <div className="flex flex-col gap-4">
            {servers.length === 0 ? (
              <Card>
                <CardContent className="text-muted-foreground flex items-center gap-3 py-6 text-sm">
                  <McpLogo className="size-4" />
                  No MCP servers configured yet.
                </CardContent>
              </Card>
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

              return (
                <Card key={server.mcpServerId}>
                  <CardHeader className="flex flex-col gap-3">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">
                            {server.name}
                          </span>
                          {toolState?.lastFetched && !toolState.error ? (
                            <span className="text-muted-foreground inline-flex items-center gap-1 text-xs">
                              <Check className="size-3 text-green-500" />
                              Connected
                            </span>
                          ) : null}
                          {toolState?.error ? (
                            <span className="inline-flex items-center gap-1 text-xs text-red-500">
                              <AlertCircle className="size-3" />
                              Error
                            </span>
                          ) : null}
                        </div>
                        <div className="text-muted-foreground mt-1 text-sm break-all">
                          {server.url}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          disabled={
                            isSaving || isDeleting || toolState?.loading
                          }
                          aria-label="Test connection"
                          title="Test connection and discover tools"
                          onClick={() => void discoverTools(server.mcpServerId)}
                        >
                          {toolState?.loading ? (
                            <Loader2
                              className="size-4 animate-spin"
                              aria-hidden
                            />
                          ) : (
                            <Plug className="size-4" aria-hidden />
                          )}
                        </Button>
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
                        >
                          {isEditing ? (
                            <X className="size-4" />
                          ) : (
                            <Pencil className="size-4" />
                          )}
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          disabled={isDeleting || isSaving}
                          aria-label={
                            isDeleting ? "Deleting server" : "Delete server"
                          }
                          aria-busy={isDeleting}
                          onClick={() =>
                            void handleDelete(server.mcpServerId, server.name)
                          }
                        >
                          {isDeleting ? (
                            <Loader2
                              className="size-4 animate-spin"
                              aria-hidden
                            />
                          ) : (
                            <Trash2 className="size-4" aria-hidden />
                          )}
                        </Button>
                      </div>
                    </div>

                    {/* Expandable tools section toggle */}
                    {toolState?.tools && toolState.tools.length > 0 ? (
                      <button
                        type="button"
                        className="text-muted-foreground hover:text-foreground flex items-center gap-1.5 text-xs transition-colors"
                        onClick={() =>
                          setExpandedIds((current) => ({
                            ...current,
                            [server.mcpServerId]: !isExpanded,
                          }))
                        }
                      >
                        {isExpanded ? (
                          <ChevronUp className="size-3.5" />
                        ) : (
                          <ChevronDown className="size-3.5" />
                        )}
                        {toolState.tools.length} tool
                        {toolState.tools.length !== 1 ? "s" : ""} available
                      </button>
                    ) : null}
                  </CardHeader>

                  {/* Error state */}
                  {toolState?.error ? (
                    <CardContent className="pt-0">
                      <div className="flex items-start gap-2 rounded-md border border-red-500/20 bg-red-500/5 p-3 text-sm text-red-500">
                        <AlertCircle className="mt-0.5 size-4 shrink-0" />
                        <div>
                          <div className="font-medium">Connection failed</div>
                          <div className="text-muted-foreground mt-0.5 text-xs">
                            {toolState.error}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  ) : null}

                  {/* Tools permission list */}
                  {isExpanded &&
                  toolState?.tools &&
                  toolState.tools.length > 0 ? (
                    <CardContent className="pt-0">
                      <div className="border-border/70 bg-muted/20 rounded-lg border">
                        <div className="border-border/70 flex items-center justify-between border-b px-4 py-2.5">
                          <span className="text-xs font-medium">Tool</span>
                          <div className="flex gap-6 pr-1">
                            {PERMISSION_CONFIG.map((perm) => (
                              <span
                                key={perm.value}
                                className="text-muted-foreground w-12 text-center text-xs"
                              >
                                {perm.label}
                              </span>
                            ))}
                          </div>
                        </div>
                        <div className="divide-border/50 divide-y">
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
                                  permissions,
                                )
                              }
                            />
                          ))}
                        </div>
                      </div>
                    </CardContent>
                  ) : null}

                  {/* No tools discovered yet - prompt to test */}
                  {!toolState && !isEditing ? (
                    <CardContent className="pt-0">
                      <button
                        type="button"
                        className="text-muted-foreground hover:text-foreground hover:bg-muted/50 flex w-full items-center justify-center gap-2 rounded-md border border-dashed p-3 text-sm transition-colors"
                        disabled={isSaving || isDeleting}
                        onClick={() => void discoverTools(server.mcpServerId)}
                      >
                        <Plug className="size-4" />
                        Test connection & discover tools
                      </button>
                    </CardContent>
                  ) : null}

                  {/* Edit mode */}
                  {isEditing ? (
                    <CardContent className="flex flex-col gap-3 pt-0">
                      <Input
                        value={draft.name}
                        onChange={(event) =>
                          setDrafts((current) => ({
                            ...current,
                            [server.mcpServerId]: {
                              ...(current[server.mcpServerId] ?? draft),
                              name: event.target.value,
                            },
                          }))
                        }
                      />
                      <Input
                        value={draft.url}
                        onChange={(event) =>
                          setDrafts((current) => ({
                            ...current,
                            [server.mcpServerId]: {
                              ...(current[server.mcpServerId] ?? draft),
                              url: event.target.value,
                            },
                          }))
                        }
                      />
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
                          <Save className="size-4" />
                          {isSaving ? "Saving..." : "Save changes"}
                        </Button>
                      </div>
                    </CardContent>
                  ) : null}
                </Card>
              );
            })}
          </div>
        </>
      ) : null}
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
    <div className="flex items-center justify-between gap-3 px-4 py-2.5">
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{tool.name}</div>
        {tool.description ? (
          <div className="text-muted-foreground mt-0.5 line-clamp-1 text-xs">
            {tool.description}
          </div>
        ) : null}
      </div>
      <RadioGroup
        value={permission}
        onValueChange={(value) =>
          onPermissionChange(value as McpToolPermission)
        }
        orientation="horizontal"
        className="flex w-auto shrink-0 gap-6"
        disabled={saving}
      >
        {PERMISSION_CONFIG.map((perm) => (
          <Label
            key={perm.value}
            className={cn(
              "flex w-12 cursor-pointer items-center justify-center gap-1",
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
                "size-5 transition-colors",
                permission === perm.value ? perm.activeColor : perm.color,
              )}
            />
          </Label>
        ))}
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
    <div className="border-border/70 bg-muted/20 flex flex-col gap-3 rounded-lg border p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-medium">
            <KeyRound className="size-4" />
            Auth headers
          </div>
          <div className="text-muted-foreground mt-1 text-xs">
            Add headers like Authorization or x-api-key for protected MCP
            endpoints.
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          onClick={() => onChange([...authHeaders, { name: "", value: "" }])}
        >
          <Plus className="size-4" />
          Add header
        </Button>
      </div>

      {authHeaders.length > 0 ? (
        <div className="flex flex-col gap-2">
          {authHeaders.map((header, index) => (
            <div
              key={`${idPrefix}-auth-header-${header.name}-${header.value}-${index}`}
              className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)_auto]"
            >
              <Input
                aria-label="Auth header name"
                disabled={disabled}
                placeholder="Authorization"
                value={header.name}
                onChange={(event) =>
                  updateHeader(index, "name", event.target.value)
                }
              />
              <Input
                aria-label="Auth header value"
                disabled={disabled}
                placeholder="Bearer token"
                type="password"
                value={header.value}
                onChange={(event) =>
                  updateHeader(index, "value", event.target.value)
                }
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={disabled}
                onClick={() => removeHeader(index)}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-muted-foreground text-xs">
          No custom auth headers.
        </div>
      )}
    </div>
  );
}
