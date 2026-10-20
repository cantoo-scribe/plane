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
import { SettingsContentWrapper } from "@/components/settings/content-wrapper";
import { WorkspaceAutomationForm } from "@/components/workspace-automations";
import { useWorkspaceAutomation } from "@/hooks/store/use-workspace-automation";
import { useWorkspace } from "@/hooks/store/use-workspace";
import { useUserPermissions } from "@/hooks/store/user";
import { useAppRouter } from "@/hooks/use-app-router";
import type { Route } from "./+types/page";
import { AutomationDetailWorkspaceSettingsHeader } from "./header";

function AutomationDetailPage({ params }: Route.ComponentProps) {
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
    ? `${currentWorkspace.name} - ${automation?.name ?? t("workspace_settings.settings.automations.title")}`
    : undefined;

  const handleUpdate = async (payload: TWorkspaceAutomationForm) => {
    await updateAutomation(workspaceSlug, automationId, payload);
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await removeAutomation(workspaceSlug, automationId);
      router.replace(`/${workspaceSlug}/settings/automations`);
    } finally {
      setIsDeleting(false);
    }
  };

  if (workspaceUserInfo && !canPerformWorkspaceAdminActions) {
    return <NotAuthorizedView section="settings" className="h-auto" />;
  }

  return (
    <SettingsContentWrapper header={<AutomationDetailWorkspaceSettingsHeader />}>
      <PageHead title={pageTitle} />
      <div className="w-full space-y-4">
        <SettingsHeading
          title={automation?.name ?? t("workspace_settings.settings.automations.title")}
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
    </SettingsContentWrapper>
  );
}

export default observer(AutomationDetailPage);
