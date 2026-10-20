/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useMemo } from "react";
import { observer } from "mobx-react";
import { PropertiesOutline } from "@makeplane/propel/icons";
import type { TIssueCustomPropertyValueWrite } from "@plane/types";
import { SidebarPropertyListItem } from "@/components/common/layout/sidebar/property-list-item";
import { useIssueType } from "@/hooks/store/use-issue-type";
import { CustomPropertyValueInput } from "./property-value-input";

type Props = {
  workspaceSlug: string;
  projectId: string;
  issueId: string;
  issueTypeId: string | null | undefined;
  disabled?: boolean;
};

export const IssueCustomProperties = observer(function IssueCustomProperties(props: Props) {
  const { workspaceSlug, projectId, issueId, issueTypeId, disabled } = props;
  const {
    getPropertiesForType,
    getIssuePropertyValues,
    fetchProperties,
    fetchProjectIssueTypes,
    fetchIssuePropertyValues,
    upsertIssuePropertyValues,
  } = useIssueType();

  useEffect(() => {
    if (workspaceSlug && projectId) {
      void fetchProjectIssueTypes(workspaceSlug, projectId);
    }
  }, [workspaceSlug, projectId, fetchProjectIssueTypes]);

  useEffect(() => {
    if (workspaceSlug && projectId && issueTypeId) {
      void fetchProperties(workspaceSlug, projectId, issueTypeId);
    }
  }, [workspaceSlug, projectId, issueTypeId, fetchProperties]);

  useEffect(() => {
    if (workspaceSlug && projectId && issueId) {
      void fetchIssuePropertyValues(workspaceSlug, projectId, issueId);
    }
  }, [workspaceSlug, projectId, issueId, fetchIssuePropertyValues]);

  const properties = getPropertiesForType(issueTypeId);
  const storedValues = getIssuePropertyValues(issueId);

  const writeValues = useMemo(() => {
    const map: Record<string, TIssueCustomPropertyValueWrite> = {};
    Object.values(storedValues).forEach((v) => {
      map[v.property_id] = {
        property_id: v.property_id,
        value_text: v.value_text,
        value_number: v.value_number,
        value_boolean: v.value_boolean,
        value_datetime: v.value_datetime,
        value_option_ids: v.value_option_ids,
        value_member_ids: v.value_member_ids,
      };
    });
    return map;
  }, [storedValues]);

  if (!issueTypeId || !properties.length) return null;

  const handleChange = async (payload: TIssueCustomPropertyValueWrite) => {
    await upsertIssuePropertyValues(workspaceSlug, projectId, issueId, [payload]);
  };

  return (
    <>
      {properties.map((property) => (
        <SidebarPropertyListItem key={property.id} icon={PropertiesOutline} label={property.name}>
          <CustomPropertyValueInput
            property={property}
            value={writeValues[property.id]}
            projectId={projectId}
            disabled={disabled || property.property_type === "FORMULA"}
            onChange={(val) => {
              void handleChange(val);
            }}
          />
        </SidebarPropertyListItem>
      ))}
    </>
  );
});
