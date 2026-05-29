import { createFileRoute } from "@tanstack/react-router";

import { ProjectsIndexPage } from "./projects.index.route-component";

export const Route = createFileRoute("/_app/projects/")({
  ssr: false,
  component: ProjectsIndexPage,
  head: () => ({
    meta: [{ title: "Projects | Redux Chat" }],
  }),
});
