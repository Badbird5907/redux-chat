"use no memo";

import { lazy, Suspense, useMemo } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { usePaginatedQuery, useQuery } from "convex/react";
import { ArrowLeft } from "lucide-react";
import z from "zod";

import { api } from "@redux/backend/convex/_generated/api";
import { Skeleton } from "@redux/ui/components/skeleton";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@redux/ui/components/tabs";

import { ProjectDescription } from "@/components/projects/project-description";
import { ProjectFiles } from "@/components/projects/project-files";
import { ProjectInstructions } from "@/components/projects/project-instructions";

const ProjectChatInputClient = lazy(
  () => import("@/components/chat/project-input-client"),
);

const PROJECT_THREAD_PAGE_SIZE = 50;

export const Route = createFileRoute("/_app/projects/$id")({
  ssr: false,
  params: z.object({ id: z.string() }),
  component: ProjectDetailPage,
  head: ({ params }) => ({
    meta: [{ title: params.id ? `Project | Redux Chat` : "Redux Chat" }],
  }),
});

function formatRelative(timestamp: number): string {
  const diffMs = Date.now() - timestamp;
  const minutes = Math.floor(diffMs / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

function ProjectDetailPage() {
  const { id: projectId } = Route.useParams();
  const project = useQuery(api.functions.projects.getProject, { projectId });

  const projectThreads = usePaginatedQuery(
    api.functions.projects.getProjectThreads,
    { projectId },
    { initialNumItems: PROJECT_THREAD_PAGE_SIZE },
  );

  const projectContent = useMemo(() => {
    if (!project) {
      return (
        <div className="mx-auto w-full max-w-4xl px-4 pt-8">
          <Skeleton className="h-8 w-48" />
        </div>
      );
    }

    return (
      <ProjectSurface
        projectId={projectId}
        name={project.name}
        description={project.description}
        instructions={project.instructions}
        threads={projectThreads.results}
        threadsStatus={projectThreads.status}
      />
    );
  }, [project, projectId, projectThreads.results, projectThreads.status]);

  return (
    <>
      {projectContent}
      <Suspense fallback={null}>
        <ProjectChatInputClient chatProjectId={projectId} />
      </Suspense>
    </>
  );
}

interface ProjectSurfaceProps {
  projectId: string;
  name: string;
  description: string | undefined;
  instructions: string | undefined;
  threads: {
    threadId: string;
    name: string;
    timestamp: number;
    status: "generating" | "completed";
  }[];
  threadsStatus: string;
}

function ProjectSurface({
  projectId,
  name,
  description,
  instructions,
  threads,
  threadsStatus,
}: ProjectSurfaceProps) {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 pt-8 pb-72">
      <Link
        to="/projects"
        className="text-muted-foreground hover:text-foreground mb-6 inline-flex items-center gap-1.5 text-sm"
      >
        <ArrowLeft className="size-4" />
        All projects
      </Link>

      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-3xl font-semibold">{name}</h1>
          {description && (
            <p className="text-muted-foreground mt-2 text-sm">{description}</p>
          )}
        </div>

        <Tabs defaultValue="chats" className="w-full gap-6">
          <TabsList className="w-full max-w-full sm:w-fit">
            <TabsTrigger value="chats">Chats</TabsTrigger>
            <TabsTrigger value="files">Files</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
          </TabsList>

          {/* Project chat input renders fixed at the bottom; we leave space here
              so content isn't hidden behind it. */}
          <TabsContent value="chats" className="flex flex-col gap-2">
            <h2 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
              Chats in this project
            </h2>
            {threadsStatus === "LoadingFirstPage" ? (
              <div className="flex flex-col gap-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full rounded-lg" />
                ))}
              </div>
            ) : threads.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                Type a message below to start the first chat in this project.
              </p>
            ) : (
              <ul className="flex flex-col gap-1">
                {threads.map((thread) => (
                  <li key={thread.threadId}>
                    <Link
                      to="/chat/$id"
                      params={{ id: thread.threadId }}
                      preload="intent"
                      className="border-border bg-card/40 hover:bg-card flex flex-col gap-0.5 rounded-lg border px-3 py-2 transition-colors"
                    >
                      <span className="truncate text-sm font-medium">
                        {thread.name}
                      </span>
                      <span className="text-muted-foreground text-xs">
                        Last message {formatRelative(thread.timestamp)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </TabsContent>

          <TabsContent value="files">
            <ProjectFiles projectId={projectId} />
          </TabsContent>

          <TabsContent value="settings" className="flex flex-col gap-4">
            <ProjectDescription
              projectId={projectId}
              description={description}
            />
            <ProjectInstructions
              projectId={projectId}
              instructions={instructions}
            />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
