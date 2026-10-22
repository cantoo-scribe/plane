/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

export type TWorkspaceAutomationTriggerType =
  | "issue_created"
  | "state_changed"
  | "assignee_changed"
  | "priority_changed"
  | "label_changed"
  | "comment_added"
  | "name_changed";

export type TWorkspaceAutomationConditionField =
  | "state"
  | "priority"
  | "label"
  | "assignee"
  | "name_contains"
  | "issue_type";

export type TWorkspaceAutomationConditionOperator = "is" | "is_any_of" | "contains";

export type TWorkspaceAutomationActionType =
  | "change_state"
  | "assign"
  | "add_comment"
  | "create_work_item"
  | "change_property";

export type TWorkspaceAutomationChangeableProperty = "priority" | "state_id" | "name" | "target_date" | "assignee_ids";

/** Native fields that can be set when creating a work item via automation. */
export type TWorkspaceAutomationCreateFieldKey =
  | "priority"
  | "state_id"
  | "assignee_ids"
  | "label_ids"
  | "start_date"
  | "target_date";

/** Fields readable from the source work item for copy / relative-date bases. */
export type TWorkspaceAutomationSourceField =
  | "name"
  | "priority"
  | "state_id"
  | "assignee_ids"
  | "label_ids"
  | "start_date"
  | "target_date";

export type TWorkspaceAutomationRelativeDateBase = "now" | "source.start_date" | "source.target_date";

export type TWorkspaceAutomationRelativeDateUnit = "days" | "weeks" | "months";

export type TWorkspaceAutomationFieldValue =
  | { mode: "static"; value: string | string[] | null }
  | { mode: "from_source"; field: TWorkspaceAutomationSourceField }
  | {
      mode: "relative_date";
      base: TWorkspaceAutomationRelativeDateBase;
      offset: { amount: number; unit: TWorkspaceAutomationRelativeDateUnit };
    };

export type TWorkspaceAutomationRunStatus = "success" | "failed" | "skipped";

export interface IWorkspaceAutomationCondition {
  id?: string;
  field: TWorkspaceAutomationConditionField;
  operator: TWorkspaceAutomationConditionOperator;
  value: string | string[] | Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
}

export interface IWorkspaceAutomationAction {
  id?: string;
  action_type: TWorkspaceAutomationActionType;
  config: Record<string, unknown>;
  sequence?: number;
  created_at?: string;
  updated_at?: string;
}

export interface IWorkspaceAutomation {
  id: string;
  name: string;
  is_active: boolean;
  trigger_type: TWorkspaceAutomationTriggerType;
  trigger_config: Record<string, unknown>;
  project_ids: string[];
  conditions: IWorkspaceAutomationCondition[];
  actions: IWorkspaceAutomationAction[];
  created_at: string;
  updated_at: string;
  created_by?: string | null;
}

export type TWorkspaceAutomationForm = Partial<
  Omit<IWorkspaceAutomation, "id" | "created_at" | "updated_at" | "created_by">
>;

export interface IWorkspaceAutomationRun {
  id: string;
  automation: string;
  issue: string | null;
  status: TWorkspaceAutomationRunStatus;
  error: string;
  actor: string | null;
  created_at: string;
  updated_at: string;
}
