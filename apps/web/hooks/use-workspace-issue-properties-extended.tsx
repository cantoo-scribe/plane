/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect } from "react";
import { useIssueType } from "@/hooks/store/use-issue-type";
import { useProject } from "@/hooks/store/use-project";

/**
 * Prefetch work item types for projects that have the feature enabled.
 */
export const useWorkspaceIssuePropertiesExtended = (workspaceSlug: string | string[] | undefined) => {
  const { workspaceProjectIds, getProjectById } = useProject();
  const { fetchProjectIssueTypes } = useIssueType();

  useEffect(() => {
    if (!workspaceSlug || !workspaceProjectIds?.length) return;
    const slug = workspaceSlug.toString();
    workspaceProjectIds.forEach((projectId) => {
      const project = getProjectById(projectId);
      if (project?.is_issue_type_enabled) {
        void fetchProjectIssueTypes(slug, projectId);
      }
    });
  }, [workspaceSlug, workspaceProjectIds, getProjectById, fetchProjectIssueTypes]);
};
