/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React, { useCallback, useState } from "react";
import { observer } from "mobx-react";
import type { ISearchIssueResponse, TIssue, TIssuePropertyValueErrors, TIssuePropertyValues } from "@plane/types";
import { IssueModalContext } from "@/components/issues/issue-modal/context";
import { useIssueType } from "@/hooks/store/use-issue-type";
import { useProject } from "@/hooks/store/use-project";
import { useUser } from "@/hooks/store/user/user-user";

export type TIssueModalProviderProps = {
  templateId?: string;
  dataForPreload?: Partial<TIssue>;
  allowedProjectIds?: string[];
  children: React.ReactNode;
};

export const IssueModalProvider = observer(function IssueModalProvider(props: TIssueModalProviderProps) {
  const { children, allowedProjectIds } = props;
  const [selectedParentIssue, setSelectedParentIssue] = useState<ISearchIssueResponse | null>(null);
  const [issuePropertyValues, setIssuePropertyValues] = useState<TIssuePropertyValues>({});
  const [issuePropertyValueErrors, setIssuePropertyValueErrors] = useState<TIssuePropertyValueErrors>({});
  const { projectsWithCreatePermissions } = useUser();
  const { getProjectById } = useProject();
  const {
    getDefaultIssueTypeId,
    getPropertiesForType,
    fetchProjectIssueTypes,
    fetchProperties,
    upsertIssuePropertyValues,
  } = useIssueType();
  const projectIdsWithCreatePermissions = Object.keys(projectsWithCreatePermissions ?? {});

  const getIssueTypeIdOnProjectChange = useCallback(
    (projectId: string) => getDefaultIssueTypeId(projectId),
    [getDefaultIssueTypeId]
  );

  const getActiveAdditionalPropertiesLength = useCallback(
    ({ projectId, watch }: { projectId: string | null; workspaceSlug: string; watch: unknown }) => {
      if (!projectId) return 0;
      const typeId = (watch as { (): Partial<TIssue> })()?.type_id ?? getDefaultIssueTypeId(projectId);
      return getPropertiesForType(typeId).length;
    },
    [getDefaultIssueTypeId, getPropertiesForType]
  );

  const handlePropertyValuesValidation = useCallback(
    ({ projectId, watch }: { projectId: string | null; workspaceSlug: string; watch: unknown }) => {
      if (!projectId) return true;
      const typeId = (watch as { (): Partial<TIssue> })()?.type_id ?? getDefaultIssueTypeId(projectId);
      const properties = getPropertiesForType(typeId);
      const errors: TIssuePropertyValueErrors = {};
      properties.forEach((prop) => {
        if (!prop.is_required) return;
        const val = issuePropertyValues[prop.id];
        const empty =
          !val ||
          (prop.property_type === "TEXT" && !val.value_text) ||
          (prop.property_type === "NUMBER" && val.value_number == null) ||
          (prop.property_type === "BOOLEAN" && val.value_boolean == null) ||
          (prop.property_type === "DATE" && !val.value_datetime) ||
          (prop.property_type === "DROPDOWN" && !val.value_option_ids?.length) ||
          (prop.property_type === "MEMBER" && !val.value_member_ids?.length);
        if (empty) errors[prop.id] = "Required";
      });
      setIssuePropertyValueErrors(errors);
      return Object.keys(errors).length === 0;
    },
    [getDefaultIssueTypeId, getPropertiesForType, issuePropertyValues]
  );

  const handleCreateUpdatePropertyValues = useCallback(
    async ({
      issueId,
      projectId,
      workspaceSlug,
    }: {
      issueId: string;
      projectId: string;
      workspaceSlug: string;
      issueTypeId: string | null | undefined;
      isDraft?: boolean;
    }) => {
      const payloads = Object.values(issuePropertyValues);
      if (!payloads.length) return;
      await upsertIssuePropertyValues(workspaceSlug, projectId, issueId, payloads);
    },
    [issuePropertyValues, upsertIssuePropertyValues]
  );

  const handleProjectEntitiesFetch = useCallback(
    async ({
      workItemProjectId,
      workItemTypeId,
      workspaceSlug,
    }: {
      workItemProjectId: string | null | undefined;
      workItemTypeId: string | undefined;
      workspaceSlug: string;
    }) => {
      if (!workItemProjectId) return;
      const project = getProjectById(workItemProjectId);
      if (!project?.is_issue_type_enabled) return;
      await fetchProjectIssueTypes(workspaceSlug, workItemProjectId);
      const typeId = workItemTypeId ?? getDefaultIssueTypeId(workItemProjectId);
      if (typeId) await fetchProperties(workspaceSlug, workItemProjectId, typeId);
    },
    [fetchProjectIssueTypes, fetchProperties, getDefaultIssueTypeId, getProjectById]
  );

  return (
    <IssueModalContext.Provider
      // oxlint-disable-next-line react/jsx-no-constructed-context-values
      value={{
        allowedProjectIds: allowedProjectIds ?? projectIdsWithCreatePermissions,
        workItemTemplateId: null,
        setWorkItemTemplateId: () => {},
        isApplyingTemplate: false,
        setIsApplyingTemplate: () => {},
        selectedParentIssue,
        setSelectedParentIssue,
        issuePropertyValues,
        setIssuePropertyValues,
        issuePropertyValueErrors,
        setIssuePropertyValueErrors,
        getIssueTypeIdOnProjectChange,
        getActiveAdditionalPropertiesLength,
        handlePropertyValuesValidation,
        handleCreateUpdatePropertyValues,
        handleProjectEntitiesFetch,
        handleTemplateChange: () => Promise.resolve(),
        handleConvert: () => Promise.resolve(),
        handleCreateSubWorkItem: () => Promise.resolve(),
      }}
    >
      {children}
    </IssueModalContext.Provider>
  );
});
