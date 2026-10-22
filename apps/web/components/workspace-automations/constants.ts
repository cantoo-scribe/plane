/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type {
  TWorkspaceAutomationActionType,
  TWorkspaceAutomationChangeableProperty,
  TWorkspaceAutomationConditionField,
  TWorkspaceAutomationTriggerType,
} from "@plane/types";

export const AUTOMATION_TRIGGER_OPTIONS: {
  value: TWorkspaceAutomationTriggerType;
  labelKey: string;
}[] = [
  { value: "issue_created", labelKey: "automations.trigger.options.issue_created" },
  { value: "state_changed", labelKey: "automations.trigger.options.state_changed" },
  { value: "assignee_changed", labelKey: "automations.trigger.options.assignee_changed" },
  { value: "priority_changed", labelKey: "automations.trigger.options.priority_changed" },
  { value: "label_changed", labelKey: "automations.trigger.options.label_changed" },
  { value: "comment_added", labelKey: "automations.trigger.options.comment_added" },
  { value: "name_changed", labelKey: "automations.trigger.options.name_changed" },
];

export const AUTOMATION_CONDITION_FIELD_OPTIONS: {
  value: TWorkspaceAutomationConditionField;
  labelKey: string;
}[] = [
  { value: "state", labelKey: "automations.condition.fields.state" },
  { value: "priority", labelKey: "automations.condition.fields.priority" },
  { value: "label", labelKey: "automations.condition.fields.label" },
  { value: "assignee", labelKey: "automations.condition.fields.assignee" },
  { value: "name_contains", labelKey: "automations.condition.fields.name_contains" },
  { value: "issue_type", labelKey: "automations.condition.fields.issue_type" },
];

export const AUTOMATION_ACTION_OPTIONS: {
  value: TWorkspaceAutomationActionType;
  labelKey: string;
}[] = [
  { value: "change_state", labelKey: "automations.action.handler_name.change_state" },
  { value: "assign", labelKey: "automations.action.handler_name.assign" },
  { value: "add_comment", labelKey: "automations.action.handler_name.add_comment" },
  { value: "create_work_item", labelKey: "automations.action.handler_name.create_work_item" },
  { value: "change_property", labelKey: "automations.action.handler_name.change_property" },
];

export const CHANGEABLE_PROPERTY_OPTIONS: {
  value: TWorkspaceAutomationChangeableProperty;
  labelKey: string;
}[] = [
  { value: "priority", labelKey: "automations.condition.fields.priority" },
  { value: "state_id", labelKey: "automations.condition.fields.state" },
  { value: "name", labelKey: "common.name" },
  { value: "target_date", labelKey: "due_date" },
  { value: "assignee_ids", labelKey: "automations.condition.fields.assignee" },
];

export const PRIORITY_OPTIONS = ["urgent", "high", "medium", "low", "none"] as const;

export const ALL_PROJECTS_VALUE = "__all__";
