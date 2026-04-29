import { useMatch } from "@tanstack/react-router";

import { api } from "@redux/backend/convex/_generated/api";

import { useQuery } from "@/lib/hooks/convex";

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
  const isProjectRoute = Boolean(projectDetailMatch ?? projectsIndexMatch);
  const isChatOrProjectRoute = isChatRoute || isProjectRoute;

  const threadId = chatMatch?.params.id;
  const thread = useQuery(
    api.functions.threads.getThread,
    { threadId: threadId ?? "" },
    { skip: !threadId },
  );

  const projectIdFromRoute = projectDetailMatch?.params.id;
  const projectIdFromThread = thread?.chatProjectId;
  const projectId = projectIdFromRoute ?? projectIdFromThread;

  const project = useQuery(
    api.functions.projects.getProject,
    { projectId: projectId ?? "" },
    { skip: !projectId },
  );

  return {
    project,
    isChatRoute,
    isProjectRoute,
    isChatOrProjectRoute,
  };
}
