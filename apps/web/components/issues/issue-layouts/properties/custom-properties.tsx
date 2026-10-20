/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect } from "react";
import { observer } from "mobx-react";
import { Tooltip } from "@makeplane/propel/components/tooltip";
import { useParams } from "next/navigation";
import { useIssueType } from "@/hooks/store/use-issue-type";

type Props = {
  projectId: string;
  issueId: string;
  issueTypeId: string | null | undefined;
};

export const IssueListCustomProperties = observer(function IssueListCustomProperties(props: Props) {
  const { projectId, issueId, issueTypeId } = props;
  const { workspaceSlug } = useParams();
  const { getPropertiesForType, getIssuePropertyValues, fetchProperties, fetchIssuePropertyValues, getPropertyById } =
    useIssueType();

  useEffect(() => {
    if (workspaceSlug && projectId && issueTypeId) {
      void fetchProperties(workspaceSlug.toString(), projectId, issueTypeId);
    }
  }, [workspaceSlug, projectId, issueTypeId, fetchProperties]);

  useEffect(() => {
    if (workspaceSlug && projectId && issueId) {
      void fetchIssuePropertyValues(workspaceSlug.toString(), projectId, issueId);
    }
  }, [workspaceSlug, projectId, issueId, fetchIssuePropertyValues]);

  const properties = getPropertiesForType(issueTypeId).slice(0, 3);
  const values = getIssuePropertyValues(issueId);

  if (!properties.length) return null;

  const formatValue = (propertyId: string) => {
    const prop = getPropertyById(propertyId);
    const val = values[propertyId];
    if (!prop || !val) return null;
    switch (prop.property_type) {
      case "TEXT":
        return val.value_text;
      case "NUMBER":
      case "FORMULA":
        return val.value_number ?? val.value_text;
      case "BOOLEAN":
        return val.value_boolean == null ? null : val.value_boolean ? "True" : "False";
      case "DATE":
        return val.value_datetime?.slice(0, 10);
      case "DROPDOWN": {
        const names = (prop.options ?? []).filter((o) => val.value_option_ids?.includes(o.id)).map((o) => o.name);
        return names.join(", ") || null;
      }
      case "MEMBER":
        return val.value_member_ids?.length ? `${val.value_member_ids.length} member(s)` : null;
      default:
        return null;
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-1">
      {properties.map((property) => {
        const display = formatValue(property.id);
        if (!display) return null;
        return (
          <Tooltip key={property.id} label={`${property.name}: ${display}`}>
            <div className="flex h-5 max-w-28 items-center truncate rounded-sm border-[0.5px] border-strong px-2 text-caption-sm-regular">
              <span className="truncate text-tertiary">{property.name}:</span>
              <span className="ml-1 truncate">{display}</span>
            </div>
          </Tooltip>
        );
      })}
    </div>
  );
});
