import { createFileRoute } from "@tanstack/react-router";

import { AttachmentsRouteComponent } from "./attachments.route-component";

export const Route = createFileRoute("/settings/attachments")({
  ssr: false,
  component: AttachmentsRouteComponent,
  head: () => ({
    meta: [{ title: "Attachments | Redux Chat" }],
  }),
});
