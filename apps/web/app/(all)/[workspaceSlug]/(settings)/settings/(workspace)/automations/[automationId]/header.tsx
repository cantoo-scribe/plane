/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { WORKSPACE_SETTINGS } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { Breadcrumbs } from "@plane/blocks/breadcrumb";
import { BreadcrumbLink } from "@/components/common/breadcrumb-link";
import { SettingsPageHeader } from "@/components/settings/page-header";
import { WORKSPACE_SETTINGS_ICONS } from "@/components/settings/workspace/sidebar/item-icon";
import { useWorkspaceAutomation } from "@/hooks/store/use-workspace-automation";

export const AutomationDetailWorkspaceSettingsHeader = observer(function AutomationDetailWorkspaceSettingsHeader() {
  const { t } = useTranslation();
  const { workspaceSlug } = useParams();
  const { currentAutomation } = useWorkspaceAutomation();
  const settingsDetails = WORKSPACE_SETTINGS.automations;
  const Icon = WORKSPACE_SETTINGS_ICONS.automations;

  return (
    <SettingsPageHeader
      leftItem={
        <div className="flex items-center gap-2">
          <Breadcrumbs>
            <Breadcrumbs.Item
              component={
                <BreadcrumbLink
                  href={`/${workspaceSlug}/settings/automations`}
                  label={t(settingsDetails.i18n_label)}
                  icon={<Icon className="size-4 text-tertiary" />}
                />
              }
            />
            <Breadcrumbs.Item
              component={<BreadcrumbLink label={currentAutomation?.name ?? t("common.loading")} isLast />}
            />
          </Breadcrumbs>
        </div>
      }
    />
  );
});
