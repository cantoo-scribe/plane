/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { useWorkspaceAutomation } from "@/hooks/store/use-workspace-automation";
import { WorkspaceAutomationsListItem } from "./list-item";

export const WorkspaceAutomationsList = observer(function WorkspaceAutomationsList() {
  const { automations } = useWorkspaceAutomation();

  return (
    <div className="flex size-full flex-col gap-y-2 overflow-y-auto rounded-lg border border-subtle bg-layer-1 p-3">
      {Object.values(automations ?? {}).map((automation) => (
        <WorkspaceAutomationsListItem key={automation.id} automation={automation} />
      ))}
    </div>
  );
});
