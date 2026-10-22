/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import Link from "next/link";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { useTranslation } from "@plane/i18n";
import type { IWorkspaceAutomation } from "@plane/types";
import { Switch } from "@makeplane/propel/components/switch";
import { useProject } from "@/hooks/store/use-project";
import { useWorkspaceAutomation } from "@/hooks/store/use-workspace-automation";
import { AUTOMATION_TRIGGER_OPTIONS } from "./constants";

type Props = {
  automation: IWorkspaceAutomation;
};

export const WorkspaceAutomationsListItem = observer(function WorkspaceAutomationsListItem(props: Props) {
  const { automation } = props;
  const { workspaceSlug } = useParams();
  const { t } = useTranslation();
  const { updateAutomation } = useWorkspaceAutomation();
  const { getProjectById } = useProject();

  const triggerLabelKey =
    AUTOMATION_TRIGGER_OPTIONS.find((option) => option.value === automation.trigger_type)?.labelKey ??
    automation.trigger_type;

  const projectId = automation.project_ids?.[0];
  const projectName = projectId
    ? (getProjectById(projectId)?.name ?? t("automations.global_automations.table.scope.project.label"))
    : t("automations.global_automations.project_select.all_projects.label");

  const handleToggle = async () => {
    if (!workspaceSlug || !automation.id) return;
    await updateAutomation(workspaceSlug.toString(), automation.id, { is_active: !automation.is_active });
  };

  return (
    <div className="rounded-lg border border-subtle bg-layer-2 px-4 py-3">
      <Link href={`/${workspaceSlug}/automations/${automation.id}`} className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <h5 className="truncate text-body-sm-medium">{automation.name}</h5>
          <p className="text-body-xs truncate text-tertiary">
            {projectName} · {t(triggerLabelKey)}
          </p>
        </div>
        <div
          className="shrink-0"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onKeyDown={(e) => e.stopPropagation()}
          role="presentation"
        >
          <Switch
            size="sm"
            checked={automation.is_active}
            onCheckedChange={() => {
              void handleToggle();
            }}
            aria-label="Toggle automation"
          />
        </div>
      </Link>
    </div>
  );
});
