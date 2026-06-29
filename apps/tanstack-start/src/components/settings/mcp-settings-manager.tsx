"use client";

import { useMemo } from "react";
import { useMutation } from "convex/react";
import { KeyRound, Loader2, Pencil, Plus, Save, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { api } from "@redux/backend/convex/_generated/api";
import { Button } from "@redux/ui/components/button";
import { Card, CardContent, CardHeader } from "@redux/ui/components/card";
import { Input } from "@redux/ui/components/input";
import { Switch } from "@redux/ui/components/switch";

import McpLogo from "@/components/logos/mcp";
import { useQuery } from "@/lib/hooks/convex";
import { useReducerState } from "@/lib/hooks/use-reducer-state";

interface McpServerDraft {
  name: string;
  url: string;
  authHeaders: AuthHeaderDraft[];
}

interface AuthHeaderDraft {
  name: string;
  value: string;
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
  const [savingEnabled, setSavingEnabled] = useReducerState(false);
  const [creating, setCreating] = useReducerState(false);
  const [savingId, setSavingId] = useReducerState<string | null>(null);
  const [deletingId, setDeletingId] = useReducerState<string | null>(null);

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
      toast.success("MCP server removed");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to remove MCP server",
      );
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <h1 className="min-w-0 text-2xl font-semibold tracking-tight">
            MCP Servers
          </h1>
          <p className="text-muted-foreground max-w-3xl text-sm">
            Connect external tools and data sources to use in your chats.
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
              const isDirty = dirtyIds.has(server.mcpServerId);
              const isSaving = savingId === server.mcpServerId;
              const isDeleting = deletingId === server.mcpServerId;

              return (
                <Card key={server.mcpServerId}>
                  <CardHeader className="flex flex-row items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="text-sm font-medium">{server.name}</div>
                      <div className="text-muted-foreground mt-1 text-sm break-all">
                        {server.url}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        disabled={isSaving || isDeleting}
                        aria-label={isEditing ? "Close editor" : "Edit server"}
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
                  </CardHeader>

                  {isEditing ? (
                    <CardContent className="flex flex-col gap-3">
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
