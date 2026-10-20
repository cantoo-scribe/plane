/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import { observer } from "mobx-react";
import { useTranslation } from "@plane/i18n";
import { setToast, TOAST_TYPE } from "@plane/blocks/toast";
import { IssueIdentifier } from "@/components/issues/issue-detail/issue-identifier";
import { useParams } from "next/navigation";
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { useIssueType } from "@/hooks/store/use-issue-type";
import { useProject } from "@/hooks/store/use-project";

export type TIssueTypeSwitcherProps = {
  issueId: string;
  disabled: boolean;
};

export const IssueTypeSwitcher = observer(function IssueTypeSwitcher(props: TIssueTypeSwitcherProps) {
  const { issueId, disabled } = props;
  const { t } = useTranslation();
  const { workspaceSlug } = useParams();
  const {
    issue: { getIssueById, updateIssue },
  } = useIssueDetail();
  const { getProjectById } = useProject();
  const { getProjectIssueTypes, fetchProjectIssueTypes, getIssueTypeById } = useIssueType();
  const [confirmTypeId, setConfirmTypeId] = useState<string | null>(null);

  const issue = getIssueById(issueId);
  const project = issue?.project_id ? getProjectById(issue.project_id) : undefined;
  const types = getProjectIssueTypes(issue?.project_id);
  const currentType = getIssueTypeById(issue?.type_id);

  useEffect(() => {
    if (workspaceSlug && issue?.project_id && project?.is_issue_type_enabled) {
      void fetchProjectIssueTypes(workspaceSlug.toString(), issue.project_id);
    }
  }, [workspaceSlug, issue?.project_id, project?.is_issue_type_enabled, fetchProjectIssueTypes]);

  if (!issue || !issue.project_id) return <></>;

  const handleTypeChange = async (typeId: string) => {
    if (!workspaceSlug || typeId === issue.type_id) return;
    try {
      await updateIssue(workspaceSlug.toString(), issue.project_id!, issueId, { type_id: typeId });
      setConfirmTypeId(null);
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "Success!",
        message: "Work item type updated.",
      });
    } catch {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Error!",
        message: "Failed to update work item type.",
      });
    }
  };

  return (
    <div className="flex items-center gap-2">
      <IssueIdentifier issueId={issueId} projectId={issue.project_id} size="md" enableClickToCopyIdentifier />
      {project?.is_issue_type_enabled && types.length > 0 && (
        <div className="relative">
          <select
            className="text-xs rounded-md border border-subtle-1 bg-transparent px-2 py-1"
            disabled={disabled}
            value={issue.type_id ?? ""}
            onChange={(e) => {
              const next = e.target.value;
              if (!next || next === issue.type_id) return;
              setConfirmTypeId(next);
            }}
          >
            {types.map((type) => (
              <option key={type.id} value={type.id}>
                {type.name}
              </option>
            ))}
          </select>
          {confirmTypeId && (
            <div className="shadow-md absolute top-full left-0 z-20 mt-1 w-64 rounded-md border border-subtle-1 bg-surface-1 p-3">
              <div className="text-sm font-medium">{t("work_item_types.change_confirmation.title")}</div>
              <div className="text-xs mt-1 text-tertiary">{t("work_item_types.change_confirmation.description")}</div>
              <div className="mt-2 flex justify-end gap-2">
                <button type="button" className="text-xs" onClick={() => setConfirmTypeId(null)}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="text-xs font-medium text-accent-primary"
                  onClick={() => void handleTypeChange(confirmTypeId)}
                >
                  Confirm
                </button>
              </div>
            </div>
          )}
          {currentType && <span className="text-xs ml-1 text-tertiary">{currentType.name}</span>}
        </div>
      )}
    </div>
  );
});
