/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useMemo, useState } from "react";
import { observer } from "mobx-react";
import { useSearchParams } from "react-router";
import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { NotAuthorizedView } from "@/components/auth-screens/not-authorized-view";
import { PageHead } from "@/components/core/page-title";
import { IssueFormsRoot } from "@/components/issue-forms/root";
import { useProject } from "@/hooks/store/use-project";
import { useWorkspace } from "@/hooks/store/use-workspace";
import { useUserPermissions } from "@/hooks/store/user";
import type { Route } from "./+types/page";

function WorkspaceFormsPage({ params }: Route.ComponentProps) {
  const { workspaceSlug } = params;
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const { workspaceUserInfo, allowPermissions } = useUserPermissions();
  const { currentWorkspace } = useWorkspace();
  const { workspaceProjectIds, getProjectById } = useProject();

  const projects = useMemo(
    () => (workspaceProjectIds || []).map((id) => getProjectById(id)).filter(Boolean),
    [workspaceProjectIds, getProjectById]
  );

  const queryProjectId = searchParams.get("projectId");
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");

  useEffect(() => {
    if (selectedProjectId) return;
    if (queryProjectId && projects.some((p) => p?.id === queryProjectId)) {
      setSelectedProjectId(queryProjectId);
      return;
    }
    if (projects[0]?.id) setSelectedProjectId(projects[0].id);
  }, [projects, queryProjectId, selectedProjectId]);

  const canPerformWorkspaceAdminActions = allowPermissions([EUserPermissions.ADMIN], EUserPermissionsLevel.WORKSPACE);
  const canManageSelectedProject = selectedProjectId
    ? allowPermissions([EUserPermissions.ADMIN], EUserPermissionsLevel.PROJECT, workspaceSlug, selectedProjectId) ||
      canPerformWorkspaceAdminActions
    : false;
  const pageTitle = currentWorkspace?.name ? `${currentWorkspace.name} - ${t("sidebar.forms")}` : undefined;

  const handleProjectChange = (projectId: string) => {
    setSelectedProjectId(projectId);
    setSearchParams(projectId ? { projectId } : {});
  };

  if (workspaceUserInfo && !canPerformWorkspaceAdminActions) {
    return <NotAuthorizedView section="settings" className="h-auto" />;
  }

  return (
    <>
      <PageHead title={pageTitle} />
      <div className="relative flex h-full w-full flex-col gap-y-4 overflow-y-auto px-6 py-4">
        {projects.length > 0 && (
          <div className="flex items-center gap-3">
            <label className="text-body-sm-medium text-secondary">{t("projects")}</label>
            <select
              className="text-body-sm rounded-md border border-subtle bg-layer-1 px-3 py-2 text-primary"
              value={selectedProjectId}
              onChange={(e) => handleProjectChange(e.target.value)}
              aria-label={t("projects")}
            >
              {projects.map((project) =>
                project ? (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ) : null
              )}
            </select>
          </div>
        )}

        {selectedProjectId ? (
          <IssueFormsRoot
            workspaceSlug={workspaceSlug}
            projectId={selectedProjectId}
            isAdmin={canManageSelectedProject}
          />
        ) : (
          <div className="text-body-sm text-tertiary">{t("workspace_projects.empty_state.no_projects.title")}</div>
        )}
      </div>
    </>
  );
}

export default observer(WorkspaceFormsPage);
