/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { useTranslation } from "@plane/i18n";

export const WorkItemTypesWorkspaceSettingsHeader = observer(function WorkItemTypesWorkspaceSettingsHeader() {
  const { t } = useTranslation();
  return (
    <div className="relative z-10 flex h-header w-full flex-shrink-0 flex-row items-center gap-x-2 gap-y-4 bg-surface-1">
      <div className="flex w-full flex-grow items-center gap-2 overflow-ellipsis whitespace-nowrap">
        <div>
          <h3 className="flex-grow truncate text-h5-medium text-primary">{t("work_item_types.label")}</h3>
        </div>
      </div>
    </div>
  );
});
