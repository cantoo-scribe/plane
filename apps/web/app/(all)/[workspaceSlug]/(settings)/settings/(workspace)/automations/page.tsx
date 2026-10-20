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
import { EmptyStateCompact } from "@plane/blocks/empty-state";
import type { TWorkspaceAutomationForm } from "@plane/types";
import { NotAuthorizedView } from "@/components/auth-screens/not-authorized-view";
import { PageHead } from "@/components/core/page-title";
import { SettingsHeading } from "@/components/settings/heading";
import { SettingsContentWrapper } from "@/components/settings/content-wrapper";
import { WorkspaceAutomationForm, WorkspaceAutomationsList } from "@/components/workspace-automations";
import { useWorkspaceAutomation } from "@/hooks/store/use-workspace-automation";
import { useWorkspace } from "@/hooks/store/use-workspace";
import { useUserPermissions } from "@/hooks/store/user";
import type { Route } from "./+types/page";
import { AutomationsWorkspaceSettingsHeader } from "./header";

function AutomationsListPage({ params }: Route.ComponentProps) {
  const { workspaceSlug } = params;
  const { t } = useTranslation();
  const [showCreateForm, setShowCreateForm] = useState(false);
  const { workspaceUserInfo, allowPermissions } = useUserPermissions();
  const { fetchAutomations, automations, createAutomation } = useWorkspaceAutomation();
  const { currentWorkspace } = useWorkspace();
  const canPerformWorkspaceAdminActions = allowPermissions([EUserPermissions.ADMIN], EUserPermissionsLevel.WORKSPACE);

  useSWR(
    canPerformWorkspaceAdminActions ? `WORKSPACE_AUTOMATIONS_${workspaceSlug}` : null,
    canPerformWorkspaceAdminActions ? () => fetchAutomations(workspaceSlug) : null
  );

  const pageTitle = currentWorkspace?.name
    ? `${currentWorkspace.name} - ${t("workspace_settings.settings.automations.title")}`
    : undefined;

  const handleCreate = async (payload: TWorkspaceAutomationForm) => {
    await createAutomation(workspaceSlug, payload);
    setShowCreateForm(false);
  };

  if (workspaceUserInfo && !canPerformWorkspaceAdminActions) {
    return <NotAuthorizedView section="settings" className="h-auto" />;
  }

  if (!automations) {
    return (
      <SettingsContentWrapper header={<AutomationsWorkspaceSettingsHeader />}>
        <div className="text-body-sm px-4 py-8 text-tertiary">{t("common.loading")}</div>
      </SettingsContentWrapper>
    );
  }

  return (
    <SettingsContentWrapper header={<AutomationsWorkspaceSettingsHeader />}>
      <PageHead title={pageTitle} />
      <div className="w-full">
        <SettingsHeading
          title={t("workspace_settings.settings.automations.title")}
          description={t("workspace_settings.settings.automations.description")}
          control={
            <Button
              variant="primary"
              size="md"
              stretch="auto"
              label={t("automations.settings.create_automation")}
              onClick={() => setShowCreateForm((prev) => !prev)}
            />
          }
        />

        {showCreateForm && (
          <div className="mt-4 rounded-lg border border-subtle bg-layer-1 p-4">
            <WorkspaceAutomationForm onSubmit={handleCreate} onCancel={() => setShowCreateForm(false)} />
          </div>
        )}

        {Object.keys(automations).length > 0 ? (
          <div className="mt-4">
            <WorkspaceAutomationsList />
          </div>
        ) : (
          !showCreateForm && (
            <div className="flex h-full w-full items-center justify-center">
              <EmptyStateCompact
                assetKey="unknown"
                title={t("automations.empty_state.no_automations.title")}
                description={t("automations.empty_state.no_automations.description")}
                actions={[
                  {
                    label: t("automations.settings.create_automation"),
                    onClick: () => setShowCreateForm(true),
                  },
                ]}
                align="start"
                rootClassName="py-20"
              />
            </div>
          )
        )}
      </div>
    </SettingsContentWrapper>
  );
}

export default observer(AutomationsListPage);
