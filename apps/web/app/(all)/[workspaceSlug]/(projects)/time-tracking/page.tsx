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
import { SettingsHeading } from "@/components/settings/heading";
import { WorkspaceTimeTracking } from "@/components/time-tracking/workspace-time-tracking";
import { useWorkspace } from "@/hooks/store/use-workspace";
import { useUserPermissions } from "@/hooks/store/user";
import type { Route } from "./+types/page";

function WorkspaceTimeTrackingPage(_props: Route.ComponentProps) {
  const { workspaceUserInfo, allowPermissions } = useUserPermissions();
  const { currentWorkspace } = useWorkspace();
  const { t } = useTranslation();

  const canView = allowPermissions([EUserPermissions.ADMIN, EUserPermissions.MEMBER], EUserPermissionsLevel.WORKSPACE);
  const pageTitle = currentWorkspace?.name ? `${currentWorkspace.name} - ${t("time_tracking")}` : undefined;

  if (workspaceUserInfo && !canView) {
    return <NotAuthorizedView section="settings" className="h-auto" />;
  }

  return (
    <>
      <PageHead title={pageTitle} />
      <div className="relative flex h-full w-full flex-col gap-y-6 overflow-y-auto px-6 py-4">
        <SettingsHeading
          title={t("workspace_settings.settings.worklogs.heading")}
          description={t("workspace_settings.settings.worklogs.description")}
        />
        <WorkspaceTimeTracking />
      </div>
    </>
  );
}

export default observer(WorkspaceTimeTrackingPage);
