import { useMatch } from "@tanstack/react-router";
import { useQuery } from "convex/react";

import { api } from "@redux/backend/convex/_generated/api";

export function useCurrentProject() {
  const chatMatch = useMatch({ from: "/_app/chat/$id", shouldThrow: false });
  const projectDetailMatch = useMatch({
    from: "/_app/projects/$id",
    shouldThrow: false,
  });
  const projectsIndexMatch = useMatch({
    from: "/_app/projects/",
    shouldThrow: false,
  });

  const isChatRoute = Boolean(chatMatch);
  const isProjectRoute = Boolean(
    projectDetailMatch ?? projectsIndexMatch,
  );
  const isChatOrProjectRoute = isChatRoute || isProjectRoute;

  const threadId = chatMatch?.params.id;
  const thread = useQuery(
    api.functions.threads.getThread,
    threadId ? { threadId } : "skip",
  );

  const projectIdFromRoute = projectDetailMatch?.params.id;
  const projectIdFromThread = thread?.chatProjectId;
  const projectId = projectIdFromRoute ?? projectIdFromThread;

  const project = useQuery(
    api.functions.projects.getProject,
    projectId ? { projectId } : "skip",
  );

  return {
    project,
    isChatRoute,
    isProjectRoute,
    isChatOrProjectRoute,
  };
}
