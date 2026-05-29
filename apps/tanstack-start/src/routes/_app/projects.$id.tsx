import { createFileRoute } from "@tanstack/react-router";
import z from "zod";

import { ProjectDetailPage } from "./projects.$id.route-component";

export const Route = createFileRoute("/_app/projects/$id")({
  params: z.object({ id: z.string() }),
  ssr: false,
  component: ProjectDetailPage,
  head: ({ params }) => ({
    meta: [{ title: params.id ? `Project | Redux Chat` : "Redux Chat" }],
  }),
});
