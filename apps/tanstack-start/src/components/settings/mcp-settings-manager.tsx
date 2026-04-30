"use client";

import { useMemo, useState } from "react";
import { useMutation } from "convex/react";
import { Pencil, PlugZap, Save, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { api } from "@redux/backend/convex/_generated/api";
import { Button } from "@redux/ui/components/button";
import { Card, CardContent, CardHeader } from "@redux/ui/components/card";
import { Input } from "@redux/ui/components/input";

import { useQuery } from "@/lib/hooks/convex";

interface McpServerDraft {
  name: string;
  url: string;
}

function createDraft(server: { name: string; url: string }): McpServerDraft {
  return {
    name: server.name,
    url: server.url,
  };
}

export function McpSettingsManager() {
  const servers =
    useQuery(api.functions.mcpServers.list, {}, { default: [] }) ?? [];
  const createServer = useMutation(api.functions.mcpServers.create);
  const updateServer = useMutation(api.functions.mcpServers.update);
  const removeServer = useMutation(api.functions.mcpServers.remove);

  const [drafts, setDrafts] = useState<Record<string, McpServerDraft>>({});
  const [editingIds, setEditingIds] = useState<Record<string, boolean>>({});
  const [newServerName, setNewServerName] = useState("");
  const [newServerUrl, setNewServerUrl] = useState("");
  const [creating, setCreating] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

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
        servers
          .filter((server) => {
            const draft = mergedDrafts[server.mcpServerId];
            return draft?.name !== server.name || draft.url !== server.url;
          })
          .map((server) => server.mcpServerId),
      ),
    [mergedDrafts, servers],
  );

  const handleCreate = async () => {
    setCreating(true);
    try {
      await createServer({
        name: newServerName,
        url: newServerUrl,
      });
      setNewServerName("");
      setNewServerUrl("");
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
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">MCP Servers</h1>
        <p className="text-muted-foreground max-w-3xl text-sm">
          Register HTTP-based MCP servers once, then enable them per chat from
          the composer menu.
        </p>
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-1">
          <div className="text-sm font-medium">Add server</div>
          <div className="text-muted-foreground text-sm">
            Use a full `http://` or `https://` MCP endpoint URL.
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
              <PlugZap className="size-4" />
              No MCP servers configured yet.
            </CardContent>
          </Card>
        ) : null}

        {servers.map((server) => {
          const draft = mergedDrafts[server.mcpServerId] ?? createDraft(server);
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
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={isSaving || isDeleting}
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
                    {isEditing ? "Close" : "Edit"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={isDeleting || isSaving}
                    onClick={() =>
                      void handleDelete(server.mcpServerId, server.name)
                    }
                  >
                    <Trash2 className="size-4" />
                    {isDeleting ? "Deleting..." : "Delete"}
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
    </div>
  );
}
