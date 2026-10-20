/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect } from "react";
import { observer } from "mobx-react";
import type { UseFormWatch } from "react-hook-form";
import type { TIssue } from "@plane/types";
import { useIssueModal } from "@/hooks/context/use-issue-modal";
import { useIssueType } from "@/hooks/store/use-issue-type";
import { useProject } from "@/hooks/store/use-project";
import { CustomPropertyValueInput } from "@/components/work-item-types/property-value-input";

type Props = {
  workspaceSlug: string;
  projectId: string | null | undefined;
  watch: UseFormWatch<TIssue>;
};

export const IssueModalCustomProperties = observer(function IssueModalCustomProperties(props: Props) {
  const { workspaceSlug, projectId, watch } = props;
  const { issuePropertyValues, setIssuePropertyValues, issuePropertyValueErrors, handleProjectEntitiesFetch } =
    useIssueModal();
  const { getProjectById } = useProject();
  const { getPropertiesForType, getDefaultIssueTypeId } = useIssueType();

  const typeId = watch("type_id") ?? (projectId ? getDefaultIssueTypeId(projectId) : null);
  const project = projectId ? getProjectById(projectId) : undefined;
  const properties = getPropertiesForType(typeId);

  useEffect(() => {
    if (!projectId || !project?.is_issue_type_enabled) return;
    void handleProjectEntitiesFetch({
      workItemProjectId: projectId,
      workItemTypeId: typeId ?? undefined,
      workspaceSlug,
    });
  }, [workspaceSlug, projectId, typeId, project?.is_issue_type_enabled, handleProjectEntitiesFetch]);

  if (!projectId || !project?.is_issue_type_enabled || !properties.length) return null;

  return (
    <div className="flex flex-col gap-3 border-t border-subtle-1 px-4 py-3">
      <div className="text-xs font-medium text-tertiary">Custom properties</div>
      {properties.map((property) => (
        <div key={property.id} className="flex flex-col gap-1">
          <label className="text-xs text-secondary">
            {property.name}
            {property.is_required ? " *" : ""}
          </label>
          <CustomPropertyValueInput
            property={property}
            value={issuePropertyValues[property.id]}
            projectId={projectId}
            disabled={property.property_type === "FORMULA"}
            onChange={(val) => {
              setIssuePropertyValues((prev) => ({ ...prev, [property.id]: val }));
            }}
          />
          {issuePropertyValueErrors[property.id] ? <span className="text-xs text-danger-primary">Required</span> : null}
        </div>
      ))}
    </div>
  );
});
