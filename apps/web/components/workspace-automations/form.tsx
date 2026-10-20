/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState, type FormEvent } from "react";
import { observer } from "mobx-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@makeplane/propel/components/button";
import { Input } from "@makeplane/propel/components/input";
import { Switch } from "@makeplane/propel/components/switch";
import type {
  IWorkspaceAutomation,
  IWorkspaceAutomationAction,
  IWorkspaceAutomationCondition,
  TWorkspaceAutomationActionType,
  TWorkspaceAutomationConditionField,
  TWorkspaceAutomationForm,
  TWorkspaceAutomationTriggerType,
} from "@plane/types";
import {
  AUTOMATION_ACTION_OPTIONS,
  AUTOMATION_CONDITION_FIELD_OPTIONS,
  AUTOMATION_TRIGGER_OPTIONS,
  PRIORITY_OPTIONS,
} from "./constants";

type Props = {
  data?: IWorkspaceAutomation;
  onSubmit: (payload: TWorkspaceAutomationForm) => Promise<void>;
  onCancel?: () => void;
};

type ConditionRow = IWorkspaceAutomationCondition & { clientKey: string };
type ActionRow = IWorkspaceAutomationAction & { clientKey: string };

const emptyCondition = (): ConditionRow => ({
  clientKey: crypto.randomUUID(),
  field: "priority",
  operator: "is",
  value: "urgent",
});

const emptyAction = (): ActionRow => ({
  clientKey: crypto.randomUUID(),
  action_type: "add_comment",
  config: { comment_html: "<p></p>" },
  sequence: 0,
});

export const WorkspaceAutomationForm = observer(function WorkspaceAutomationForm(props: Props) {
  const { data, onSubmit, onCancel } = props;
  const { t } = useTranslation();

  const [name, setName] = useState(data?.name ?? "");
  const [isActive, setIsActive] = useState(data?.is_active ?? true);
  const [triggerType, setTriggerType] = useState<TWorkspaceAutomationTriggerType>(
    data?.trigger_type ?? "issue_created"
  );
  const [toStateId, setToStateId] = useState(String(data?.trigger_config?.to_state_id ?? ""));
  const [projectIds, setProjectIds] = useState((data?.project_ids ?? []).join(", "));
  const [conditions, setConditions] = useState<ConditionRow[]>(
    data?.conditions?.length
      ? data.conditions.map((condition) => ({ ...condition, clientKey: crypto.randomUUID() }))
      : []
  );
  const [actions, setActions] = useState<ActionRow[]>(
    data?.actions?.length
      ? data.actions.map((actionItem) => ({ ...actionItem, clientKey: crypto.randomUUID() }))
      : [emptyAction()]
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateCondition = (index: number, patch: Partial<IWorkspaceAutomationCondition>) => {
    setConditions((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  };

  const updateAction = (index: number, patch: Partial<IWorkspaceAutomationAction>) => {
    setActions((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  };

  const conditionsPayload = conditions.map(({ clientKey: _clientKey, ...condition }) => condition);
  const actionsPayload = actions.map(({ clientKey: _clientKey, ...actionItem }, index) => ({
    ...actionItem,
    sequence: index,
  }));

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError(t("automations.create_modal.title.required_error"));
      return;
    }
    if (!actions.length) {
      setError(t("automations.enable.validation.required"));
      return;
    }

    const payload: TWorkspaceAutomationForm = {
      name: name.trim(),
      is_active: isActive,
      trigger_type: triggerType,
      trigger_config: triggerType === "state_changed" && toStateId.trim() ? { to_state_id: toStateId.trim() } : {},
      project_ids: projectIds
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean),
      conditions: conditionsPayload,
      actions: actionsPayload,
    };

    setIsSubmitting(true);
    try {
      await onSubmit(payload);
    } catch {
      setError(t("automations.toasts.create.error.message"));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-3 rounded-lg border border-subtle bg-layer-1 p-4">
        <div className="flex items-center justify-between gap-3">
          <label className="text-body-sm-medium text-secondary">
            {t("automations.create_modal.title.placeholder")}
          </label>
          <div className="flex items-center gap-2">
            <span className="text-body-xs text-tertiary">{isActive ? t("common.enabled") : t("common.disabled")}</span>
            <Switch
              size="sm"
              checked={isActive}
              onCheckedChange={(checked) => setIsActive(Boolean(checked))}
              aria-label="Toggle automation"
            />
          </div>
        </div>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("automations.create_modal.title.placeholder")}
          className="w-full"
        />
        <div className="space-y-1">
          <label className="text-body-xs-medium text-tertiary">{t("automations.scope.run_on")}</label>
          <Input
            value={projectIds}
            onChange={(e) => setProjectIds(e.target.value)}
            placeholder="project-uuid-1, project-uuid-2 (empty = all projects)"
            className="w-full"
          />
        </div>
      </div>

      <div className="space-y-3 rounded-lg border border-subtle bg-layer-1 p-4">
        <h4 className="text-body-sm-medium text-secondary">{t("automations.trigger.label")}</h4>
        <select
          className="text-body-sm w-full rounded-md border border-subtle bg-layer-2 px-3 py-2 text-primary"
          value={triggerType}
          onChange={(e) => setTriggerType(e.target.value as TWorkspaceAutomationTriggerType)}
        >
          {AUTOMATION_TRIGGER_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {t(option.labelKey)}
            </option>
          ))}
        </select>
        {triggerType === "state_changed" && (
          <Input
            value={toStateId}
            onChange={(e) => setToStateId(e.target.value)}
            placeholder="to_state_id (optional)"
            className="w-full"
          />
        )}
      </div>

      <div className="space-y-3 rounded-lg border border-subtle bg-layer-1 p-4">
        <div className="flex items-center justify-between">
          <h4 className="text-body-sm-medium text-secondary">{t("automations.condition.label")}</h4>
          <Button
            variant="secondary"
            size="sm"
            type="button"
            label={t("automations.condition.add_condition")}
            onClick={() => setConditions((prev) => [...prev, emptyCondition()])}
          />
        </div>
        {conditions.map((condition, index) => (
          <div
            key={condition.clientKey}
            className="grid gap-2 rounded-md border border-subtle bg-layer-2 p-3 md:grid-cols-3"
          >
            <select
              className="text-body-sm rounded-md border border-subtle bg-layer-1 px-3 py-2"
              value={condition.field}
              onChange={(e) =>
                updateCondition(index, {
                  field: e.target.value as TWorkspaceAutomationConditionField,
                  value: e.target.value === "priority" ? "urgent" : "",
                })
              }
            >
              {AUTOMATION_CONDITION_FIELD_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {t(option.labelKey)}
                </option>
              ))}
            </select>
            {condition.field === "priority" ? (
              <select
                className="text-body-sm rounded-md border border-subtle bg-layer-1 px-3 py-2 md:col-span-2"
                value={String(condition.value)}
                onChange={(e) => updateCondition(index, { value: e.target.value })}
              >
                {PRIORITY_OPTIONS.map((priority) => (
                  <option key={priority} value={priority}>
                    {priority}
                  </option>
                ))}
              </select>
            ) : (
              <Input
                className="md:col-span-2"
                value={String(condition.value ?? "")}
                onChange={(e) => updateCondition(index, { value: e.target.value })}
                placeholder={`${condition.field} uuid`}
              />
            )}
            <Button
              variant="tertiary"
              size="sm"
              type="button"
              className="justify-self-start md:col-span-3"
              label={t("common.remove")}
              onClick={() => setConditions((prev) => prev.filter((_, i) => i !== index))}
            />
          </div>
        ))}
      </div>

      <div className="space-y-3 rounded-lg border border-subtle bg-layer-1 p-4">
        <div className="flex items-center justify-between">
          <h4 className="text-body-sm-medium text-secondary">{t("automations.action.label")}</h4>
          <Button
            variant="secondary"
            size="sm"
            type="button"
            label={t("automations.action.add_action")}
            onClick={() => setActions((prev) => [...prev, emptyAction()])}
          />
        </div>
        {actions.map((actionItem, index) => (
          <div key={actionItem.clientKey} className="space-y-2 rounded-md border border-subtle bg-layer-2 p-3">
            <select
              className="text-body-sm w-full rounded-md border border-subtle bg-layer-1 px-3 py-2"
              value={actionItem.action_type}
              onChange={(e) => {
                const actionType = e.target.value as TWorkspaceAutomationActionType;
                const config =
                  actionType === "change_state"
                    ? { state_id: "" }
                    : actionType === "assign"
                      ? { assignee_ids: [] as string[] }
                      : { comment_html: "<p></p>" };
                updateAction(index, { action_type: actionType, config });
              }}
            >
              {AUTOMATION_ACTION_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {t(option.labelKey)}
                </option>
              ))}
            </select>
            {actionItem.action_type === "change_state" && (
              <Input
                value={String(actionItem.config.state_id ?? "")}
                onChange={(e) => updateAction(index, { config: { state_id: e.target.value } })}
                placeholder="state_id"
                className="w-full"
              />
            )}
            {actionItem.action_type === "assign" && (
              <Input
                value={Array.isArray(actionItem.config.assignee_ids) ? actionItem.config.assignee_ids.join(", ") : ""}
                onChange={(e) =>
                  updateAction(index, {
                    config: {
                      assignee_ids: e.target.value
                        .split(",")
                        .map((id) => id.trim())
                        .filter(Boolean),
                    },
                  })
                }
                placeholder="assignee uuid(s), comma-separated"
                className="w-full"
              />
            )}
            {actionItem.action_type === "add_comment" && (
              <Input
                value={String(actionItem.config.comment_html ?? "").replace(/^<p>|<\/p>$/g, "")}
                onChange={(e) =>
                  updateAction(index, {
                    config: { comment_html: `<p>${e.target.value}</p>` },
                  })
                }
                placeholder="Comment text"
                className="w-full"
              />
            )}
            {actions.length > 1 && (
              <Button
                variant="tertiary"
                size="sm"
                type="button"
                label={t("common.remove")}
                onClick={() => setActions((prev) => prev.filter((_, i) => i !== index))}
              />
            )}
          </div>
        ))}
      </div>

      {error && <p className="text-body-xs text-danger-primary">{error}</p>}

      <div className="flex items-center justify-end gap-2">
        {onCancel && <Button variant="secondary" type="button" label={t("common.cancel")} onClick={onCancel} />}
        <Button
          type="submit"
          loading={isSubmitting}
          label={
            data
              ? t("automations.create_modal.submit_button.update")
              : t("automations.create_modal.submit_button.create")
          }
        />
      </div>
    </form>
  );
});
