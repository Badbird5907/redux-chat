import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { usePaginatedQuery } from "convex/react";
import { Plus, Search as SearchIcon } from "lucide-react";

import { api } from "@redux/backend/convex/_generated/api";
import { Button } from "@redux/ui/components/button";
import { Input } from "@redux/ui/components/input";
import { Skeleton } from "@redux/ui/components/skeleton";

import { NewProjectDialog } from "@/components/projects/new-project-dialog";
import { ProjectCard } from "@/components/projects/project-card";

const PAGE_SIZE = 50;

function ProjectsIndexPage() {
  "use no memo";

  const [createOpen, setCreateOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  const { results, status } = usePaginatedQuery(
    api.functions.projects.getProjects,
    {},
    { initialNumItems: PAGE_SIZE },
  );

  const filtered = useMemo(() => {
    const trimmed = searchTerm.trim().toLowerCase();
    if (!trimmed) return results;
    return results.filter((project) => {
      return (
        project.name.toLowerCase().includes(trimmed) ||
        (project.description?.toLowerCase().includes(trimmed) ?? false)
      );
    });
  }, [results, searchTerm]);

  return (
    <div className="mx-auto flex h-full w-full max-w-5xl flex-col gap-8 overflow-y-auto px-6 pt-12 pb-12">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-semibold">Projects</h1>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="size-4" />
          New project
        </Button>
      </div>

      <div className="relative">
        <SearchIcon className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
        <Input
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
          placeholder="Search projects..."
          className="pl-9"
        />
      </div>

      {status === "LoadingFirstPage" ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-36 w-full rounded-xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="border-border bg-card/50 flex flex-col items-center gap-2 rounded-xl border border-dashed p-12 text-center">
          <p className="text-muted-foreground text-sm">
            {searchTerm.trim()
              ? "No projects match your search."
              : "No projects yet. Create your first project to group related chats."}
          </p>
          {!searchTerm.trim() && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setCreateOpen(true)}
            >
              <Plus className="size-4" />
              New project
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {filtered.map((project) => (
            <ProjectCard
              key={project.projectId}
              projectId={project.projectId}
              name={project.name}
              description={project.description}
              updatedAt={project.updatedAt}
            />
          ))}
        </div>
      )}

      <NewProjectDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}

export const Route = createFileRoute("/_app/projects/")({
  ssr: false,
  component: ProjectsIndexPage,
  head: () => ({
    meta: [{ title: "Projects | Redux Chat" }],
  }),
});
