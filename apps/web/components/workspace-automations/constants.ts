/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type {
  TWorkspaceAutomationActionType,
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
];

export const AUTOMATION_CONDITION_FIELD_OPTIONS: {
  value: TWorkspaceAutomationConditionField;
  labelKey: string;
}[] = [
  { value: "state", labelKey: "automations.condition.fields.state" },
  { value: "priority", labelKey: "automations.condition.fields.priority" },
  { value: "label", labelKey: "automations.condition.fields.label" },
];

export const AUTOMATION_ACTION_OPTIONS: {
  value: TWorkspaceAutomationActionType;
  labelKey: string;
}[] = [
  { value: "change_state", labelKey: "automations.action.handler_name.change_state" },
  { value: "assign", labelKey: "automations.action.handler_name.assign" },
  { value: "add_comment", labelKey: "automations.action.handler_name.add_comment" },
];

export const PRIORITY_OPTIONS = ["urgent", "high", "medium", "low", "none"] as const;
