"use client";

import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "convex/react";
import { usePostHog } from "posthog-js/react";
import { toast } from "sonner";

import type { SkillSummary } from "@redux/types";
import { api } from "@redux/backend/convex/_generated/api";

import { refreshGitHubSkill } from "@/server/skills/actions";

export function useSkillActions() {
  const updateScope = useMutation(api.functions.skills.updateActivationScope);
  const setEnabled = useMutation(api.functions.skills.setEnabled);
  const setAutoLoad = useMutation(api.functions.skills.setAutoLoad);
  const deleteSkill = useMutation(api.functions.skills.deleteSkill);
  const refreshSkill = useServerFn(refreshGitHubSkill);
  const posthog = usePostHog();
  const [refreshingId, setRefreshingId] = useState<string>();

  const handleDelete = async (skill: SkillSummary) => {
    try {
      await deleteSkill({ skillId: skill.skillId });
      posthog.capture("skill_deleted", { source_type: skill.sourceType });
      toast.success("Skill deleted");
      return true;
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to delete skill",
      );
      return false;
    }
  };

  const handleRefresh = async (skill: SkillSummary) => {
    setRefreshingId(skill.skillId);
    try {
      const result = await refreshSkill({ data: { skillId: skill.skillId } });
      posthog.capture("skill_refreshed", { changed: result.changed });
      toast.success(
        result.changed
          ? "GitHub skill refreshed"
          : "Skill is already up to date",
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to refresh skill",
      );
    } finally {
      setRefreshingId(undefined);
    }
  };

  const handleScopeChange = async (scope: "thread" | "message") => {
    try {
      await updateScope({ scope });
      posthog.capture("skill_activation_scope_updated", { scope });
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to update skill activation scope",
      );
    }
  };

  const handleEnabledChange = async (skillId: string, enabled: boolean) => {
    try {
      await setEnabled({ skillId, enabled });
      posthog.capture("skill_toggled", {
        setting: "enabled",
        value: enabled,
      });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to update skill",
      );
    }
  };

  const handleAutoLoadChange = async (
    skillId: string,
    allowAutoLoad: boolean,
  ) => {
    try {
      await setAutoLoad({ skillId, allowAutoLoad });
      posthog.capture("skill_toggled", {
        setting: "automatic_loading",
        value: allowAutoLoad,
      });
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to update automatic loading",
      );
    }
  };

  return {
    handleAutoLoadChange,
    handleDelete,
    handleEnabledChange,
    handleRefresh,
    handleScopeChange,
    refreshingId,
  };
}
