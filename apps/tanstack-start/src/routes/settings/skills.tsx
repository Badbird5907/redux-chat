import { createFileRoute } from "@tanstack/react-router";

import { SkillsManager } from "@/components/settings/skills-manager";

function SkillsRouteComponent() {
  return <SkillsManager />;
}

export const Route = createFileRoute("/settings/skills")({
  component: SkillsRouteComponent,
  head: () => ({ meta: [{ title: "Skills | Redux Chat" }] }),
});
