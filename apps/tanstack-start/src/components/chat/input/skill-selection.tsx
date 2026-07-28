"use client";

import type { KeyboardEvent } from "react";
import { useMemo, useState } from "react";
import { Sparkles, X } from "lucide-react";

import type { SkillSummary } from "@redux/types";
import { SKILL_LIMITS } from "@redux/types";
import { Badge } from "@redux/ui/components/badge";
import { Button } from "@redux/ui/components/button";
import { cn } from "@redux/ui/lib/utils";

export function parseLeadingSkillCommands(
  text: string,
  skills: SkillSummary[],
) {
  const bySlug = new Map(
    skills
      .filter((skill) => skill.enabled)
      .map((skill) => [skill.slug.toLowerCase(), skill] as const),
  );
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

export function useSkillSlashMenu(input: {
  text: string;
  setText: (value: string) => void;
  skills: SkillSummary[];
  selectedSkillIds: string[];
  setSelectedSkillIds: (value: string[]) => void;
}) {
  const match = /^\/([a-z0-9-]*)$/i.exec(input.text);
  const query = match?.[1]?.toLowerCase();
  const matches = useMemo(() => {
    if (query === undefined) return [];
    return input.skills
      .filter(
        (skill) =>
          skill.enabled &&
          !input.selectedSkillIds.includes(skill.skillId) &&
          `${skill.slug} ${skill.name} ${skill.description}`
            .toLowerCase()
            .includes(query),
      )
      .slice(0, 8);
  }, [input.selectedSkillIds, input.skills, query]);
  const [menuSelection, setMenuSelection] = useState<{
    query?: string;
    index: number;
  }>({ index: 0 });
  const activeIndex =
    menuSelection.query === query
      ? Math.min(menuSelection.index, Math.max(matches.length - 1, 0))
      : 0;
  const setActiveIndex = (index: number) => setMenuSelection({ query, index });

  const selectSkill = (skill: SkillSummary) => {
    if (input.selectedSkillIds.length >= SKILL_LIMITS.maxExplicitSkills) return;
    input.setSelectedSkillIds([...input.selectedSkillIds, skill.skillId]);
    input.setText("");
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (query === undefined || matches.length === 0) return false;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((activeIndex + 1) % matches.length);
      return true;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((activeIndex - 1 + matches.length) % matches.length);
      return true;
    }
    if (event.key === "Enter" || event.key === "Tab") {
      const skill = matches[activeIndex];
      if (!skill) return false;
      event.preventDefault();
      selectSkill(skill);
      return true;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      input.setText("");
      return true;
    }
    return false;
  };

  return {
    query,
    matches,
    activeIndex,
    setActiveIndex,
    selectSkill,
    handleKeyDown,
  };
}

export function SkillSelectionBar({
  skills,
  selectedSkillIds,
  activeThreadSkills,
  activationScope,
  menu,
  onRemoveSelected,
  onDeactivateThread,
}: {
  skills: SkillSummary[];
  selectedSkillIds: string[];
  activeThreadSkills: SkillSummary[];
  activationScope: "thread" | "message";
  menu: ReturnType<typeof useSkillSlashMenu>;
  onRemoveSelected: (skillId: string) => void;
  onDeactivateThread: (skillId: string) => void;
}) {
  const byId = new Map(skills.map((skill) => [skill.skillId, skill] as const));
  const selected = selectedSkillIds.flatMap((skillId) => {
    const skill = byId.get(skillId);
    return skill ? [skill] : [];
  });
  if (
    selected.length === 0 &&
    activeThreadSkills.length === 0 &&
    menu.query === undefined
  ) {
    return null;
  }

  return (
    <div className="border-border/60 border-b px-4 py-2">
      {menu.query !== undefined ? (
        <div className="bg-popover mb-2 max-h-64 overflow-auto rounded-xl border p-1 shadow-lg">
          {menu.matches.length > 0 ? (
            menu.matches.map((skill, index) => (
              <button
                key={skill.skillId}
                type="button"
                className={cn(
                  "flex w-full items-start gap-3 rounded-lg px-3 py-2 text-left",
                  index === menu.activeIndex ? "bg-muted" : "hover:bg-muted/60",
                )}
                onMouseEnter={() => menu.setActiveIndex(index)}
                onClick={() => menu.selectSkill(skill)}
              >
                <Sparkles className="text-primary mt-0.5 size-4 shrink-0" />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2 text-sm font-medium">
                    /{skill.slug}
                    {skill.allowAutoLoad ? (
                      <Badge variant="secondary">Auto</Badge>
                    ) : null}
                  </span>
                  <span className="text-muted-foreground mt-0.5 block truncate text-xs">
                    {skill.description}
                  </span>
                </span>
              </button>
            ))
          ) : (
            <div className="text-muted-foreground px-3 py-2 text-sm">
              No matching skills.
            </div>
          )}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-1.5">
        {activeThreadSkills.map((skill) => (
          <Badge
            key={`active:${skill.skillId}`}
            variant="secondary"
            className="gap-1 py-1 pl-2"
          >
            <Sparkles className="size-3" />/{skill.slug}
            <Button
              variant="ghost"
              size="icon-xs"
              className="ml-0.5 size-4 rounded-full"
              aria-label={`Deactivate ${skill.name}`}
              onClick={() => onDeactivateThread(skill.skillId)}
            >
              <X className="size-3" />
            </Button>
          </Badge>
        ))}
        {selected.map((skill) => (
          <Badge key={`selected:${skill.skillId}`} className="gap-1 py-1 pl-2">
            <Sparkles className="size-3" />/{skill.slug}
            <span className="text-primary-foreground/70 text-[10px]">
              {activationScope === "thread" ? "thread" : "once"}
            </span>
            <Button
              variant="ghost"
              size="icon-xs"
              className="text-primary-foreground hover:bg-primary-foreground/15 ml-0.5 size-4 rounded-full hover:text-current"
              aria-label={`Remove ${skill.name}`}
              onClick={() => onRemoveSelected(skill.skillId)}
            >
              <X className="size-3" />
            </Button>
          </Badge>
        ))}
      </div>
    </div>
  );
}
