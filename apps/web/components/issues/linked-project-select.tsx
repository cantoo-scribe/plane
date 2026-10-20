/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
// plane imports
import { useTranslation } from "@plane/i18n";
// components
import { ProjectSelect } from "@/components/dropdowns/project/project-select";
import type { TIssueOperations } from "@/components/issues/issue-detail";
// hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { useProject } from "@/hooks/store/use-project";

export type TIssueLinkKind = "project" | "teamspace" | "okr";

type TIssueCrossLinkSelect = {
  className?: string;
  workspaceSlug: string;
  projectId: string;
  issueId: string;
  issueOperations: TIssueOperations;
  disabled?: boolean;
  /** Which cross-link field to edit. */
  linkKind: TIssueLinkKind;
};

const LINK_FIELD: Record<TIssueLinkKind, "linked_project_id" | "linked_teamspace_id" | "linked_okr_id"> = {
  project: "linked_project_id",
  teamspace: "linked_teamspace_id",
  okr: "linked_okr_id",
};

const LINK_LABEL_KEY: Record<TIssueLinkKind, string> = {
  project: "linked_project",
  teamspace: "linked_teamspace",
  okr: "linked_okr",
};

/**
 * Select a single cross-link (regular project, pole, or OKR) for dual-list visibility.
 */
export const IssueCrossLinkSelect = observer(function IssueCrossLinkSelect(props: TIssueCrossLinkSelect) {
  const { className, workspaceSlug, projectId, issueId, issueOperations, disabled = false, linkKind } = props;
  const { t } = useTranslation();
  const { getProjectById } = useProject();
  const {
    issue: { getIssueById },
  } = useIssueDetail();

  const issue = getIssueById(issueId);
  const field = LINK_FIELD[linkKind];
  const label = t(LINK_LABEL_KEY[linkKind]);

  if (!issue) return null;

  return (
    <ProjectSelect
      projectList="all"
      variant="select-ghost-md"
      className={className}
      disabled={disabled}
      placeholder={label}
      value={(issue[field] as string | null | undefined) ?? null}
      excludeProjectId={projectId}
      filterOption={(id) => {
        const project = getProjectById(id);
        if (!project) return false;
        if (linkKind === "project") return !project.is_teamspace && !project.is_okr;
        if (linkKind === "teamspace") return !!project.is_teamspace;
        return !!project.is_okr;
      }}
      onChange={async (linkedId) => {
        await issueOperations.update(workspaceSlug, projectId, issueId, {
          [field]: linkedId,
        });
      }}
    />
  );
});

type TIssueLinkedProjectSelect = {
  className?: string;
  workspaceSlug: string;
  projectId: string;
  issueId: string;
  issueOperations: TIssueOperations;
  disabled?: boolean;
};

/**
 * Back-compat wrapper: from a pole pick a project; from a project/OKR pick a pole.
 * Prefer composing {@link IssueCrossLinkSelect} for multi-link UIs.
 */
export const IssueLinkedProjectSelect = observer(function IssueLinkedProjectSelect(props: TIssueLinkedProjectSelect) {
  const { getProjectById } = useProject();
  const homeProject = getProjectById(props.projectId);
  const linkKind: TIssueLinkKind = homeProject?.is_teamspace ? "project" : "teamspace";
  return <IssueCrossLinkSelect {...props} linkKind={linkKind} />;
});
