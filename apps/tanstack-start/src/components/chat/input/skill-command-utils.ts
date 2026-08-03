import type { SkillSummary } from "@redux/types";

export function parseLeadingSkillCommands(
  text: string,
  skills: SkillSummary[],
) {
  const bySlug = new Map<string, SkillSummary>();
  for (const skill of skills) {
    if (skill.enabled) bySlug.set(skill.slug.toLowerCase(), skill);
  }

  const selectedSkillIds: string[] = [];
  let remaining = text.trimStart();
  while (remaining.startsWith("/")) {
    const match = /^\/([a-z0-9]+(?:-[a-z0-9]+)*)(?:\s+|$)/i.exec(remaining);
    if (!match) break;
    const slug = match[1]?.toLowerCase() ?? "";
    const skill = bySlug.get(slug);
    if (!skill) {
      return {
        cleanedText: text,
        selectedSkillIds,
        unknownCommand: slug,
      };
    }
    selectedSkillIds.push(skill.skillId);
    remaining = remaining.slice(match[0].length).trimStart();
  }
  return {
    cleanedText: remaining,
    selectedSkillIds: [...new Set(selectedSkillIds)],
    unknownCommand: undefined,
  };
}
