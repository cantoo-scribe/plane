/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import useSWR from "swr";
import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { Button } from "@makeplane/propel/components/button";
import type { TWorkspaceAutomationForm } from "@plane/types";
import { NotAuthorizedView } from "@/components/auth-screens/not-authorized-view";
import { PageHead } from "@/components/core/page-title";
import { SettingsHeading } from "@/components/settings/heading";
import { WorkspaceAutomationForm } from "@/components/workspace-automations";
import { useWorkspaceAutomation } from "@/hooks/store/use-workspace-automation";
import { useWorkspace } from "@/hooks/store/use-workspace";
import { useUserPermissions } from "@/hooks/store/user";
import { useAppRouter } from "@/hooks/use-app-router";
import type { Route } from "./+types/page";

function WorkspaceAutomationDetailPage({ params }: Route.ComponentProps) {
  const { workspaceSlug, automationId } = params;
  const { t } = useTranslation();
  const router = useAppRouter();
  const [isDeleting, setIsDeleting] = useState(false);
  const { workspaceUserInfo, allowPermissions } = useUserPermissions();
  const { fetchAutomationById, currentAutomation, updateAutomation, removeAutomation, getAutomationById } =
    useWorkspaceAutomation();
  const { currentWorkspace } = useWorkspace();
  const canPerformWorkspaceAdminActions = allowPermissions([EUserPermissions.ADMIN], EUserPermissionsLevel.WORKSPACE);

  useSWR(
    canPerformWorkspaceAdminActions ? `WORKSPACE_AUTOMATION_${workspaceSlug}_${automationId}` : null,
    canPerformWorkspaceAdminActions ? () => fetchAutomationById(workspaceSlug, automationId) : null
  );

  const automation = currentAutomation ?? getAutomationById(automationId);

  const pageTitle = currentWorkspace?.name
    ? `${currentWorkspace.name} - ${automation?.name ?? t("sidebar.automations")}`
    : undefined;

  const handleUpdate = async (payload: TWorkspaceAutomationForm) => {
    await updateAutomation(workspaceSlug, automationId, payload);
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await removeAutomation(workspaceSlug, automationId);
      router.replace(`/${workspaceSlug}/automations`);
    } finally {
      setIsDeleting(false);
    }
  };

  if (workspaceUserInfo && !canPerformWorkspaceAdminActions) {
    return <NotAuthorizedView section="settings" className="h-auto" />;
  }

  return (
    <>
      <PageHead title={pageTitle} />
      <div className="relative flex h-full w-full flex-col gap-y-6 overflow-y-auto px-6 py-4">
        <SettingsHeading
          title={automation?.name ?? t("sidebar.automations")}
          description={t("workspace_settings.settings.automations.description")}
          control={
            <Button
              variant="danger"
              size="md"
              stretch="auto"
              label={t("automations.delete_modal.heading")}
              loading={isDeleting}
              onClick={() => {
                void handleDelete();
              }}
            />
          }
        />
        {automation ? (
          <WorkspaceAutomationForm data={automation} onSubmit={handleUpdate} />
        ) : (
          <div className="text-body-sm text-tertiary">{t("common.loading")}</div>
        )}
      </div>
    </>
  );
}

export default observer(WorkspaceAutomationDetailPage);
