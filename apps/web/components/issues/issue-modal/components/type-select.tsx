/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { useTranslation } from "@plane/i18n";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@makeplane/propel/components/menu";
import { Pill as PillChrome } from "@makeplane/propel/elements/pill";
import { useIssueType } from "@/hooks/store/use-issue-type";
import { useProject } from "@/hooks/store/use-project";

type Props = {
  projectId: string | null | undefined;
  value: string | null | undefined;
  onChange: (typeId: string) => void;
  tabIndex?: number;
};

export const IssueModalTypeSelect = observer(function IssueModalTypeSelect(props: Props) {
  const { projectId, value, onChange, tabIndex } = props;
  const { t } = useTranslation();
  const { workspaceSlug } = useParams();
  const { getProjectById } = useProject();
  const { getProjectIssueTypes, getDefaultIssueTypeId, getIssueTypeById, fetchProjectIssueTypes } = useIssueType();

  const project = projectId ? getProjectById(projectId) : undefined;
  const types = getProjectIssueTypes(projectId);
  const selectedTypeId = value ?? (projectId ? getDefaultIssueTypeId(projectId) : null);
  const selectedType = getIssueTypeById(selectedTypeId);

  useEffect(() => {
    if (workspaceSlug && projectId && project?.is_issue_type_enabled) {
      void fetchProjectIssueTypes(workspaceSlug.toString(), projectId);
    }
  }, [workspaceSlug, projectId, project?.is_issue_type_enabled, fetchProjectIssueTypes]);

  if (!projectId || !project?.is_issue_type_enabled || types.length === 0) return null;

  return (
    <Menu>
      <MenuTrigger
        tabIndex={tabIndex}
        render={
          <PillChrome size="sm" variant="outline" data-testid="create-work-item-type-select">
            <span className="text-caption-sm-medium text-secondary">
              {selectedType?.name ?? t("work_item_types.label")}
            </span>
          </PillChrome>
        }
      />
      <MenuContent side="bottom" align="start" className="min-w-48">
        {types.map((type) => (
          <MenuItem
            key={type.id}
            label={type.is_default ? `${type.name} (${t("common.default")})` : type.name}
            onClick={() => {
              if (type.id !== selectedTypeId) onChange(type.id);
            }}
          />
        ))}
      </MenuContent>
    </Menu>
  );
});
