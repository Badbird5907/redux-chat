"use client";

import type { ChangeEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery } from "convex/react";
import {
  Bot,
  ChevronRight,
  Download,
  File,
  FileCode2,
  Folder,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
  Upload,
} from "lucide-react";
import { usePostHog } from "posthog-js/react";
import { toast } from "sonner";

import type { SkillFileSummary, SkillSummary } from "@redux/types";
import { api } from "@redux/backend/convex/_generated/api";
import { Badge } from "@redux/ui/components/badge";
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
import { Switch } from "@redux/ui/components/switch";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@redux/ui/components/tabs";
import { Textarea } from "@redux/ui/components/textarea";
import GithubIcon from "@redux/ui/icons/github";
import { cn } from "@redux/ui/lib/utils";

import { MobileSidebarTrigger } from "@/components/layout/mobile-sidebar-trigger";
import { MarkdownRenderer } from "@/components/markdown/markdown-renderer";
import { ShikiCodeBlock } from "@/components/markdown/shiki-code-block";
import {
  importGitHubSkill,
  importMarkdownSkill,
} from "@/server/skills/actions";
import { useSkillActions } from "./use-skill-actions";

type SkillRecord = SkillSummary;
type SkillFileRecord = SkillFileSummary;

interface TreeNode {
  name: string;
  path: string;
  children: TreeNode[];
  file?: SkillFileRecord;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function buildTree(files: SkillFileRecord[]) {
  const root: TreeNode = { name: "", path: "", children: [] };
  for (const file of files) {
    const segments = file.path.split("/");
    let current = root;
    for (const [index, segment] of segments.entries()) {
      const path = segments.slice(0, index + 1).join("/");
      let child = current.children.find((node) => node.name === segment);
      if (!child) {
        child = { name: segment, path, children: [] };
        current.children.push(child);
      }
      if (index === segments.length - 1) child.file = file;
      current = child;
    }
  }
  const sort = (node: TreeNode) => {
    node.children.sort((a, b) => {
      const aFolder = a.children.length > 0;
      const bFolder = b.children.length > 0;
      return aFolder === bFolder
        ? a.name.localeCompare(b.name)
        : aFolder
          ? -1
          : 1;
    });
    node.children.forEach(sort);
  };
  sort(root);
  return root.children;
}

function languageForPath(path: string) {
  return path.split(".").pop()?.toLowerCase() ?? "text";
}

function FileTree({
  nodes,
  selectedPath,
  onSelect,
}: {
  nodes: TreeNode[];
  selectedPath?: string;
  onSelect: (file: SkillFileRecord) => void;
}) {
  return (
    <ul className="space-y-0.5">
      {nodes.map((node) =>
        node.children.length > 0 ? (
          <li key={node.path}>
            <details open className="group">
              <summary className="hover:bg-muted flex cursor-pointer list-none items-center gap-1.5 rounded-md px-2 py-1.5 text-sm">
                <ChevronRight className="size-3.5 transition-transform group-open:rotate-90" />
                <Folder className="text-muted-foreground size-4" />
                <span className="truncate">{node.name}</span>
              </summary>
              <div className="ml-3 border-l pl-2">
                <FileTree
                  nodes={node.children}
                  selectedPath={selectedPath}
                  onSelect={onSelect}
                />
              </div>
            </details>
          </li>
        ) : node.file ? (
          <li key={node.path}>
            <button
              type="button"
              className={cn(
                "hover:bg-muted flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm",
                selectedPath === node.path && "bg-muted font-medium",
              )}
              onClick={() => {
                const file = node.file;
                if (file) onSelect(file);
              }}
            >
              {node.file.isText ? (
                <FileCode2 className="text-muted-foreground size-4 shrink-0" />
              ) : (
                <File className="text-muted-foreground size-4 shrink-0" />
              )}
              <span className="truncate">{node.name}</span>
            </button>
          </li>
        ) : null,
      )}
    </ul>
  );
}

function SkillFilePreview({ file }: { file: SkillFileRecord }) {
  const [text, setText] = useState<string>();
  const [loading, setLoading] = useState(file.isText);
  const url = `/api/skills/files/${encodeURIComponent(file.skillFileId)}`;

  useEffect(() => {
    let cancelled = false;
    if (!file.isText) return;
    const loadFile = async () => {
      try {
        const response = await fetch(url, { credentials: "same-origin" });
        if (!response.ok) throw new Error("Failed to load file");
        const content = await response.text();
        if (!cancelled) setText(content);
      } catch (error) {
        if (!cancelled) {
          toast.error(
            error instanceof Error ? error.message : "Failed to load file",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void loadFile();
    return () => {
      cancelled = true;
    };
  }, [file.isText, file.skillFileId, url]);

  const isMarkdown = file.path.toLowerCase().endsWith(".md");
  const isImage = file.mimeType.startsWith("image/");
  const isPdf = file.mimeType === "application/pdf";

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{file.path}</div>
          <div className="text-muted-foreground text-xs">
            {file.mimeType} · {formatBytes(file.size)}
            {file.lfsPointer ? " · Git LFS pointer" : ""}
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          render={
            <a
              href={`${url}?download=1`}
              aria-label={`Download ${file.path}`}
            />
          }
        >
          <Download className="size-4" />
          Download
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto rounded-lg border p-4">
        {loading ? (
          <div className="text-muted-foreground flex items-center gap-2 text-sm">
            <Loader2 className="size-4 animate-spin" /> Loading file…
          </div>
        ) : file.isText && text !== undefined ? (
          isMarkdown ? (
            <Tabs defaultValue="preview">
              <TabsList className="w-fit">
                <TabsTrigger value="preview">Preview</TabsTrigger>
                <TabsTrigger value="raw">Raw</TabsTrigger>
              </TabsList>
              <TabsContent value="preview" className="pt-3">
                <MarkdownRenderer content={text} mode="static" />
              </TabsContent>
              <TabsContent value="raw" className="pt-3">
                <ShikiCodeBlock code={text} info="markdown" />
              </TabsContent>
            </Tabs>
          ) : (
            <ShikiCodeBlock code={text} info={languageForPath(file.path)} />
          )
        ) : isImage ? (
          <img
            src={url}
            alt={file.path}
            className="mx-auto max-h-[60vh] max-w-full rounded-md object-contain"
          />
        ) : isPdf ? (
          <iframe
            src={url}
            title={file.path}
            sandbox=""
            className="h-[60vh] w-full rounded-md"
          />
        ) : (
          <div className="text-muted-foreground flex h-40 flex-col items-center justify-center gap-3 text-center text-sm">
            <File className="size-8" />
            Preview is not available for this file type.
          </div>
        )}
      </div>
    </div>
  );
}

function SkillViewerDialog({
  skill,
  open,
  onOpenChange,
}: {
  skill?: SkillRecord;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const files = useQuery(
    api.functions.skills.listFiles,
    skill ? { skillId: skill.skillId } : "skip",
  ) as SkillFileRecord[] | undefined;
  const [selectedFile, setSelectedFile] = useState<SkillFileRecord>();
  const [fileSearch, setFileSearch] = useState("");
  const visibleSelectedFile =
    selectedFile ??
    files?.find((file) => file.path === "SKILL.md") ??
    files?.[0];

  const filteredFiles = useMemo(
    () =>
      (files ?? []).filter((file) =>
        file.path.toLowerCase().includes(fileSearch.trim().toLowerCase()),
      ),
    [fileSearch, files],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[min(88vh,850px)] max-w-[min(96vw,1100px)] grid-rows-[auto_minmax(0,1fr)]">
        <DialogHeader>
          <DialogTitle>{skill?.name ?? "Skill files"}</DialogTitle>
          <DialogDescription>
            Browse the complete read-only package for this skill.
          </DialogDescription>
        </DialogHeader>
        <div className="grid min-h-0 gap-4 md:grid-cols-[260px_minmax(0,1fr)]">
          <div className="flex min-h-0 flex-col gap-3 rounded-lg border p-3">
            <div className="relative">
              <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
              <Input
                value={fileSearch}
                onChange={(event) => setFileSearch(event.target.value)}
                className="pl-8"
                placeholder="Search files"
              />
            </div>
            <div className="min-h-32 flex-1 overflow-auto">
              {files === undefined ? (
                <Loader2 className="text-muted-foreground size-4 animate-spin" />
              ) : (
                <FileTree
                  nodes={buildTree(filteredFiles)}
                  selectedPath={visibleSelectedFile?.path}
                  onSelect={setSelectedFile}
                />
              )}
            </div>
          </div>
          {visibleSelectedFile ? (
            <SkillFilePreview
              key={visibleSelectedFile.skillFileId}
              file={visibleSelectedFile}
            />
          ) : (
            <div className="text-muted-foreground flex items-center justify-center rounded-lg border text-sm">
              Select a file to preview it.
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AddSkillDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const importMarkdown = useServerFn(importMarkdownSkill);
  const importGitHub = useServerFn(importGitHubSkill);
  const posthog = usePostHog();
  const [markdownFile, setMarkdownFile] = useState<File>();
  const [githubUrl, setGithubUrl] = useState("");
  const [busy, setBusy] = useState(false);

  const handleMarkdown = async () => {
    if (!markdownFile) return;
    setBusy(true);
    try {
      await importMarkdown({
        data: {
          fileName: markdownFile.name,
          content: await markdownFile.text(),
        },
      });
      posthog.capture("skill_imported", { source_type: "upload" });
      toast.success("Skill imported");
      setMarkdownFile(undefined);
      onOpenChange(false);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to import skill",
      );
    } finally {
      setBusy(false);
    }
  };

  const handleGitHub = async () => {
    setBusy(true);
    try {
      await importGitHub({ data: { url: githubUrl } });
      posthog.capture("skill_imported", { source_type: "github" });
      toast.success("GitHub skill imported");
      setGithubUrl("");
      onOpenChange(false);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to import GitHub skill",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Add skill</DialogTitle>
          <DialogDescription>
            Import a Markdown skill, snapshot a public GitHub folder, or ask a
            model to create one.
          </DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="markdown">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="markdown">Markdown</TabsTrigger>
            <TabsTrigger value="github">GitHub</TabsTrigger>
            <TabsTrigger value="ai">Create with AI</TabsTrigger>
          </TabsList>
          <TabsContent value="markdown" className="space-y-4 pt-4">
            <div className="rounded-lg border border-dashed p-6 text-center">
              <Upload className="text-muted-foreground mx-auto mb-3 size-7" />
              <Input
                type="file"
                accept=".md,text/markdown,text/plain"
                onChange={(event: ChangeEvent<HTMLInputElement>) =>
                  setMarkdownFile(event.target.files?.[0])
                }
              />
              <p className="text-muted-foreground mt-2 text-xs">
                Any Markdown filename is normalized into a root SKILL.md.
              </p>
            </div>
            <Button
              className="w-full"
              disabled={!markdownFile || busy}
              onClick={() => void handleMarkdown()}
            >
              {busy ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Upload className="size-4" />
              )}
              Import Markdown
            </Button>
          </TabsContent>
          <TabsContent value="github" className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label htmlFor="skill-github-url">Public GitHub URL</Label>
              <Input
                id="skill-github-url"
                value={githubUrl}
                onChange={(event) => setGithubUrl(event.target.value)}
                placeholder="https://github.com/owner/repo/tree/main/skill"
              />
              <p className="text-muted-foreground text-xs">
                Repository roots, folders, and direct SKILL.md links are
                supported. Imports are pinned to a commit.
              </p>
            </div>
            <Button
              className="w-full"
              disabled={!githubUrl.trim() || busy}
              onClick={() => void handleGitHub()}
            >
              {busy ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <GithubIcon className="size-4" />
              )}
              Import GitHub snapshot
            </Button>
          </TabsContent>
          <TabsContent value="ai" className="pt-4">
            <div className="flex flex-col items-center gap-4 rounded-lg border p-6 text-center">
              <Bot className="text-primary size-9" />
              <div>
                <div className="font-medium">Create a skill in chat</div>
                <p className="text-muted-foreground mt-1 text-sm">
                  Ask a tool-capable model to create a reusable skill. You will
                  review its full file tree before approving it.
                </p>
              </div>
              <Button
                render={<Link to="/" />}
                onClick={() => onOpenChange(false)}
              >
                <Sparkles className="size-4" /> Start a chat
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function EditSkillDialog({
  skill,
  open,
  onOpenChange,
}: {
  skill?: SkillRecord;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const updateMetadata = useMutation(api.functions.skills.updateMetadata);
  const [name, setName] = useState(skill?.name ?? "");
  const [description, setDescription] = useState(skill?.description ?? "");
  const [slug, setSlug] = useState(skill?.slug ?? "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!skill) return;
    setSaving(true);
    try {
      await updateMetadata({ skillId: skill.skillId, name, description, slug });
      toast.success("Skill metadata updated");
      onOpenChange(false);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to update skill",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit skill metadata</DialogTitle>
          <DialogDescription>File contents remain read-only.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="skill-name">Name</Label>
            <Input
              id="skill-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="skill-description">Description</Label>
            <Textarea
              id="skill-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={4}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="skill-slug">Slash command</Label>
            <div className="flex items-center gap-1">
              <span className="text-muted-foreground">/</span>
              <Input
                id="skill-slug"
                value={slug}
                onChange={(event) => setSlug(event.target.value)}
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={
              saving || !name.trim() || !description.trim() || !slug.trim()
            }
            onClick={() => void save()}
          >
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function SkillsManager() {
  const queriedSkills = useQuery(api.functions.skills.list, {});
  const skills = useMemo(
    () => (queriedSkills ?? []) as SkillRecord[],
    [queriedSkills],
  );
  const activationScope = useQuery(api.functions.skills.getActivationScope, {});
  const {
    handleAutoLoadChange,
    handleDelete,
    handleEnabledChange,
    handleRefresh,
    handleScopeChange,
    refreshingId,
  } = useSkillActions();
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [viewSkill, setViewSkill] = useState<SkillRecord>();
  const [editSkill, setEditSkill] = useState<SkillRecord>();

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return query
      ? skills.filter((skill) =>
          `${skill.name} ${skill.description} ${skill.slug}`
            .toLowerCase()
            .includes(query),
        )
      : skills;
  }, [search, skills]);

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-2">
          <div className="flex items-start gap-2">
            <MobileSidebarTrigger className="mt-1" />
            <h1 className="text-2xl font-semibold tracking-tight">Skills</h1>
          </div>
          <p className="text-muted-foreground max-w-2xl text-sm">
            Give models reusable, read-only instruction packages with supporting
            files.
          </p>
        </div>
        <Button onClick={() => setAddOpen(true)}>
          <Plus className="size-4" /> Add skill
        </Button>
      </div>

      <Card>
        <CardHeader className="space-y-1">
          <div className="text-sm font-medium">Slash command activation</div>
          <div className="text-muted-foreground text-sm">
            This changes future invocations. Existing thread skills stay active
            until removed.
          </div>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          {(
            [
              [
                "thread",
                "Keep active for this thread",
                "The default for reusable workflows.",
              ],
              [
                "message",
                "Use for one message",
                "Clear the selected skill after sending.",
              ],
            ] as const
          ).map(([scope, title, description]) => (
            <button
              key={scope}
              type="button"
              className={cn(
                "rounded-lg border p-4 text-left transition-colors",
                activationScope === scope
                  ? "border-primary bg-primary/5"
                  : "hover:bg-muted/50",
              )}
              onClick={() => void handleScopeChange(scope)}
            >
              <div className="text-sm font-medium">{title}</div>
              <div className="text-muted-foreground mt-1 text-xs">
                {description}
              </div>
            </button>
          ))}
        </CardContent>
      </Card>

      <div className="relative">
        <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="pl-9"
          placeholder="Search skills"
        />
      </div>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="text-muted-foreground flex flex-col items-center gap-3 py-12 text-center text-sm">
            <Sparkles className="size-8" />
            {skills.length === 0
              ? "No skills yet. Import one or ask a model to create it."
              : "No skills match your search."}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {filtered.map((skill) => (
            <Card key={skill.skillId}>
              <CardContent className="flex flex-col gap-4 p-5">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{skill.name}</span>
                      <Badge variant="secondary">/{skill.slug}</Badge>
                      <Badge variant="outline" className="capitalize">
                        {skill.sourceType}
                      </Badge>
                      {!skill.enabled ? (
                        <Badge variant="secondary">Disabled</Badge>
                      ) : null}
                    </div>
                    <p className="text-muted-foreground text-sm">
                      {skill.description}
                    </p>
                    <div className="text-muted-foreground flex flex-wrap gap-x-3 gap-y-1 text-xs">
                      <span>
                        {skill.fileCount} file{skill.fileCount === 1 ? "" : "s"}
                      </span>
                      <span>{formatBytes(skill.totalBytes)}</span>
                      {skill.github ? (
                        <span>Commit {skill.github.commitSha.slice(0, 7)}</span>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setViewSkill(skill)}
                    >
                      <Folder className="size-4" /> Files
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setEditSkill(skill)}
                    >
                      <Pencil className="size-4" /> Edit
                    </Button>
                    {skill.sourceType === "github" ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={refreshingId === skill.skillId}
                        onClick={() => void handleRefresh(skill)}
                      >
                        <RefreshCw
                          className={cn(
                            "size-4",
                            refreshingId === skill.skillId && "animate-spin",
                          )}
                        />{" "}
                        Refresh
                      </Button>
                    ) : null}
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Delete ${skill.name}`}
                      onClick={() => void handleDelete(skill)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </div>
                <div className="grid gap-3 border-t pt-4 sm:grid-cols-2">
                  <label className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5">
                    <span>
                      <span className="block text-sm font-medium">Enabled</span>
                      <span className="text-muted-foreground block text-xs">
                        Available through /{skill.slug}
                      </span>
                    </span>
                    <Switch
                      checked={skill.enabled}
                      onCheckedChange={(checked) =>
                        void handleEnabledChange(skill.skillId, checked)
                      }
                    />
                  </label>
                  <label className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5">
                    <span>
                      <span className="block text-sm font-medium">
                        Allow automatic loading
                      </span>
                      <span className="text-muted-foreground block text-xs">
                        Let matching models load it on demand
                      </span>
                    </span>
                    <Switch
                      disabled={!skill.enabled}
                      checked={skill.allowAutoLoad}
                      onCheckedChange={(checked) =>
                        void handleAutoLoadChange(skill.skillId, checked)
                      }
                    />
                  </label>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <AddSkillDialog open={addOpen} onOpenChange={setAddOpen} />
      <SkillViewerDialog
        key={viewSkill?.skillId ?? "closed"}
        skill={viewSkill}
        open={viewSkill !== undefined}
        onOpenChange={(open) => !open && setViewSkill(undefined)}
      />
      <EditSkillDialog
        key={editSkill?.skillId ?? "closed"}
        skill={editSkill}
        open={editSkill !== undefined}
        onOpenChange={(open) => !open && setEditSkill(undefined)}
      />
    </div>
  );
}
