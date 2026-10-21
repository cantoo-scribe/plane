/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useEffect, useMemo } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { useTranslation } from "@plane/i18n";
import { Select } from "@plane/blocks/select";
import type { SelectVariant } from "@plane/blocks/select";
import { ChevronDownOutline } from "@makeplane/propel/icons";
import type { TIssueType } from "@plane/types";
import { useIssueType } from "@/hooks/store/use-issue-type";
import { useProject } from "@/hooks/store/use-project";

type IssueTypeOption = {
  id: string;
  name: string;
  is_default?: boolean;
};

type Props = {
  projectId: string | null | undefined;
  value: string | null | undefined;
  onChange: (typeId: string) => void;
  variant?: SelectVariant;
  tabIndex?: number;
};

export const IssueModalTypeSelect = observer(function IssueModalTypeSelect(props: Props) {
  const { projectId, value, onChange, variant = "pill-md", tabIndex } = props;
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

  const options = useMemo<IssueTypeOption[]>(
    () => types.map((type: TIssueType) => ({ id: type.id, name: type.name, is_default: type.is_default })),
    [types]
  );

  const selected = useMemo<IssueTypeOption | null>(() => {
    if (!selectedType) return null;
    return { id: selectedType.id, name: selectedType.name, is_default: selectedType.is_default };
  }, [selectedType]);

  const getOptionLabel = useCallback(
    (option: IssueTypeOption) => (option.is_default ? `${option.name} (${t("common.default")})` : option.name),
    [t]
  );

  if (!projectId || !project?.is_issue_type_enabled || types.length === 0) return null;

  return (
    <Select<IssueTypeOption>
      getValues={() => options}
      value={selected}
      onChange={(typeId) => {
        if (typeId) onChange(typeId);
      }}
      getOptionValue={(option) => option.id}
      getOptionLabel={getOptionLabel}
      showSearch={options.length > 5}
      pinSelected={false}
      placeholder={t("work_item_types.label")}
    >
      <Select.Trigger<IssueTypeOption>
        variant={variant}
        tabIndex={tabIndex}
        data-testid="create-work-item-type-select"
        label={(issueTypes) => (issueTypes[0] ? getOptionLabel(issueTypes[0]) : t("work_item_types.label"))}
      >
        {(issueTypes) => {
          const current = issueTypes[0];
          const label = current ? getOptionLabel(current) : t("work_item_types.label");
          return (
            <>
              <span className="min-w-0 grow truncate text-left">{label}</span>
              <ChevronDownOutline className="size-2.5 shrink-0 text-placeholder" aria-hidden="true" />
            </>
          );
        }}
      </Select.Trigger>
    </Select>
  );
});
