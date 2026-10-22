/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { NotAuthorizedView } from "@/components/auth-screens/not-authorized-view";
import { PageHead } from "@/components/core/page-title";
import { SettingsContentWrapper } from "@/components/settings/content-wrapper";
import { WorkItemTypesRoot } from "@/components/work-item-types/root";
import { useWorkspace } from "@/hooks/store/use-workspace";
import { useUserPermissions } from "@/hooks/store/user";
import type { Route } from "./+types/page";
import { WorkItemTypesWorkspaceSettingsHeader } from "./header";

function WorkItemTypesWorkspaceSettingsPage({ params }: Route.ComponentProps) {
  const { workspaceSlug } = params;
  const { t } = useTranslation();
  const { currentWorkspace } = useWorkspace();
  const { workspaceUserInfo, allowPermissions } = useUserPermissions();

  const pageTitle = currentWorkspace?.name ? `${currentWorkspace.name} - ${t("work_item_types.label")}` : undefined;
  const canPerformWorkspaceAdminActions = allowPermissions([EUserPermissions.ADMIN], EUserPermissionsLevel.WORKSPACE);

  if (workspaceUserInfo && !canPerformWorkspaceAdminActions) {
    return <NotAuthorizedView section="settings" className="h-auto" />;
  }

  return (
    <SettingsContentWrapper header={<WorkItemTypesWorkspaceSettingsHeader />}>
      <PageHead title={pageTitle} />
      <div className={`w-full ${canPerformWorkspaceAdminActions ? "" : "pointer-events-none opacity-60"}`}>
        <WorkItemTypesRoot scope="workspace" workspaceSlug={workspaceSlug} isAdmin={canPerformWorkspaceAdminActions} />
      </div>
    </SettingsContentWrapper>
  );
}

export default observer(WorkItemTypesWorkspaceSettingsPage);
