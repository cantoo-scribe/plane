/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { useTranslation } from "@plane/i18n";
import { Button } from "@makeplane/propel/components/button";
import { Input } from "@makeplane/propel/components/input";
import { Switch } from "@makeplane/propel/components/switch";
import type {
  IWorkspaceAutomation,
  IWorkspaceAutomationAction,
  IWorkspaceAutomationCondition,
  TWorkspaceAutomationActionType,
  TWorkspaceAutomationChangeableProperty,
  TWorkspaceAutomationConditionField,
  TWorkspaceAutomationForm,
  TWorkspaceAutomationTriggerType,
} from "@plane/types";
import { useIssueType } from "@/hooks/store/use-issue-type";
import { useLabel } from "@/hooks/store/use-label";
import { useMember } from "@/hooks/store/use-member";
import { useProject } from "@/hooks/store/use-project";
import { useProjectState } from "@/hooks/store/use-project-state";
import {
  ALL_PROJECTS_VALUE,
  AUTOMATION_ACTION_OPTIONS,
  AUTOMATION_CONDITION_FIELD_OPTIONS,
  AUTOMATION_TRIGGER_OPTIONS,
  CHANGEABLE_PROPERTY_OPTIONS,
  PRIORITY_OPTIONS,
} from "./constants";

type Props = {
  data?: IWorkspaceAutomation;
  onSubmit: (payload: TWorkspaceAutomationForm) => Promise<void>;
  onCancel?: () => void;
};

type ConditionRow = IWorkspaceAutomationCondition & { clientKey: string };
type ActionRow = IWorkspaceAutomationAction & { clientKey: string };

const selectClass = "text-body-sm w-full rounded-md border border-subtle bg-layer-1 px-3 py-2 text-primary";

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

const defaultActionConfig = (actionType: TWorkspaceAutomationActionType): Record<string, unknown> => {
  switch (actionType) {
    case "change_state":
      return { state_id: "" };
    case "assign":
      return { assignee_ids: [] as string[] };
    case "add_comment":
      return { comment_html: "<p></p>" };
    case "create_work_item":
      return { project_id: "", issue_type_id: "", name: "" };
    case "change_property":
      return { property: "priority", value: "urgent" };
    default:
      return {};
  }
};

export const WorkspaceAutomationForm = observer(function WorkspaceAutomationForm(props: Props) {
  const { data, onSubmit, onCancel } = props;
  const { t } = useTranslation();
  const { workspaceSlug } = useParams();
  const slug = workspaceSlug?.toString() ?? "";

  const { workspaceProjectIds, getProjectById } = useProject();
  const { fetchProjectStates, getProjectStates } = useProjectState();
  const { fetchProjectLabels, getProjectLabels, fetchWorkspaceLabels, workspaceLabels } = useLabel();
  const {
    getUserDetails,
    workspace: { workspaceMemberIds, fetchWorkspaceMembers },
  } = useMember();
  const { fetchProjectIssueTypes, getProjectIssueTypes } = useIssueType();

  const [name, setName] = useState(data?.name ?? "");
  const [isActive, setIsActive] = useState(data?.is_active ?? true);
  const [triggerProjectId, setTriggerProjectId] = useState(
    data?.project_ids?.[0] ? String(data.project_ids[0]) : ALL_PROJECTS_VALUE
  );
  const [triggerType, setTriggerType] = useState<TWorkspaceAutomationTriggerType>(
    data?.trigger_type ?? "issue_created"
  );
  const [triggerConfig, setTriggerConfig] = useState<Record<string, string>>({
    to_state_id: String(data?.trigger_config?.to_state_id ?? ""),
    from_state_id: String(data?.trigger_config?.from_state_id ?? ""),
    assignee_id: String(data?.trigger_config?.assignee_id ?? ""),
    to_priority: String(data?.trigger_config?.to_priority ?? ""),
    from_priority: String(data?.trigger_config?.from_priority ?? ""),
    label_id: String(data?.trigger_config?.label_id ?? ""),
  });
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

  const projects = useMemo(
    () => (workspaceProjectIds || []).map((id) => getProjectById(id)).filter(Boolean),
    [workspaceProjectIds, getProjectById]
  );

  const contextProjectId =
    triggerProjectId !== ALL_PROJECTS_VALUE
      ? triggerProjectId
      : actions.find((a) => a.action_type === "create_work_item" && a.config.project_id)?.config.project_id
        ? String(actions.find((a) => a.action_type === "create_work_item" && a.config.project_id)?.config.project_id)
        : projects[0]?.id;

  const states = contextProjectId ? (getProjectStates(contextProjectId) ?? []) : [];
  const labels = (contextProjectId ? getProjectLabels(contextProjectId) : undefined) ?? workspaceLabels ?? [];
  const members = useMemo(
    () =>
      (workspaceMemberIds || [])
        .map((id) => getUserDetails(id))
        .filter(Boolean)
        .map((user) => ({ id: user!.id, name: user!.display_name })),
    [workspaceMemberIds, getUserDetails]
  );
  const issueTypes = contextProjectId ? getProjectIssueTypes(contextProjectId) : [];

  useEffect(() => {
    if (!slug) return;
    void fetchWorkspaceMembers(slug);
    void fetchWorkspaceLabels(slug);
  }, [slug, fetchWorkspaceMembers, fetchWorkspaceLabels]);

  useEffect(() => {
    if (!slug || !contextProjectId) return;
    void fetchProjectStates(slug, contextProjectId);
    void fetchProjectLabels(slug, contextProjectId);
    void fetchProjectIssueTypes(slug, contextProjectId);
  }, [slug, contextProjectId, fetchProjectStates, fetchProjectLabels, fetchProjectIssueTypes]);

  // Prefetch states for create_work_item / change_property project targets
  useEffect(() => {
    if (!slug) return;
    for (const actionItem of actions) {
      const projectId = String(actionItem.config.project_id ?? "");
      if (projectId) {
        void fetchProjectStates(slug, projectId);
        void fetchProjectIssueTypes(slug, projectId);
      }
    }
  }, [slug, actions, fetchProjectStates, fetchProjectIssueTypes]);

  const updateCondition = (index: number, patch: Partial<IWorkspaceAutomationCondition>) => {
    setConditions((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  };

  const updateAction = (index: number, patch: Partial<IWorkspaceAutomationAction>) => {
    setActions((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  };

  const patchTriggerConfig = (key: string, value: string) => {
    setTriggerConfig((prev) => ({ ...prev, [key]: value }));
  };

  const buildTriggerConfig = (): Record<string, unknown> => {
    const config: Record<string, unknown> = {};
    if (triggerType === "state_changed") {
      if (triggerConfig.to_state_id) config.to_state_id = triggerConfig.to_state_id;
      if (triggerConfig.from_state_id) config.from_state_id = triggerConfig.from_state_id;
    }
    if (triggerType === "assignee_changed" && triggerConfig.assignee_id) {
      config.assignee_id = triggerConfig.assignee_id;
    }
    if (triggerType === "priority_changed") {
      if (triggerConfig.to_priority) config.to_priority = triggerConfig.to_priority;
      if (triggerConfig.from_priority) config.from_priority = triggerConfig.from_priority;
    }
    if (triggerType === "label_changed" && triggerConfig.label_id) {
      config.label_id = triggerConfig.label_id;
    }
    return config;
  };

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
      trigger_config: buildTriggerConfig(),
      project_ids: triggerProjectId === ALL_PROJECTS_VALUE ? [] : [triggerProjectId],
      conditions: conditions.map(({ clientKey: _clientKey, ...condition }) => condition),
      actions: actions.map(({ clientKey: _clientKey, ...actionItem }, index) => ({
        ...actionItem,
        sequence: index,
      })),
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

  const renderStateSelect = (
    value: string,
    onChange: (value: string) => void,
    options: { id: string; name: string }[],
    allowEmpty = true,
    emptyLabel = t("automations.trigger.config.any")
  ) => (
    <select className={selectClass} value={value} onChange={(e) => onChange(e.target.value)}>
      {allowEmpty && <option value="">{emptyLabel}</option>}
      {options.map((state) => (
        <option key={state.id} value={state.id}>
          {state.name}
        </option>
      ))}
    </select>
  );

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
      </div>

      <div className="space-y-3 rounded-lg border border-subtle bg-layer-1 p-4">
        <h4 className="text-body-sm-medium text-secondary">{t("automations.trigger.label")}</h4>
        <div className="grid gap-2 md:grid-cols-2">
          <select
            className={selectClass}
            value={triggerProjectId}
            onChange={(e) => setTriggerProjectId(e.target.value)}
          >
            <option value={ALL_PROJECTS_VALUE}>
              {t("automations.global_automations.project_select.all_projects.label")}
            </option>
            {projects.map((project) =>
              project ? (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ) : null
            )}
          </select>
          <select
            className={selectClass}
            value={triggerType}
            onChange={(e) => setTriggerType(e.target.value as TWorkspaceAutomationTriggerType)}
          >
            {AUTOMATION_TRIGGER_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {t(option.labelKey)}
              </option>
            ))}
          </select>
        </div>

        {triggerType === "state_changed" && (
          <div className="space-y-2">
            {triggerProjectId === ALL_PROJECTS_VALUE && (
              <p className="text-body-xs text-tertiary">{t("automations.trigger.config.pick_project_for_states")}</p>
            )}
            <div className="grid gap-2 md:grid-cols-2">
              <div className="space-y-1">
                <label className="text-body-xs-medium text-tertiary">
                  {t("automations.trigger.config.from_state")}
                </label>
                {renderStateSelect(triggerConfig.from_state_id, (v) => patchTriggerConfig("from_state_id", v), states)}
              </div>
              <div className="space-y-1">
                <label className="text-body-xs-medium text-tertiary">{t("automations.trigger.config.to_state")}</label>
                {renderStateSelect(triggerConfig.to_state_id, (v) => patchTriggerConfig("to_state_id", v), states)}
              </div>
            </div>
          </div>
        )}

        {triggerType === "assignee_changed" && (
          <div className="space-y-1">
            <label className="text-body-xs-medium text-tertiary">
              {t("automations.trigger.config.assignee_added")}
            </label>
            <select
              className={selectClass}
              value={triggerConfig.assignee_id}
              onChange={(e) => patchTriggerConfig("assignee_id", e.target.value)}
            >
              <option value="">{t("automations.trigger.config.any")}</option>
              {members.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {triggerType === "priority_changed" && (
          <div className="grid gap-2 md:grid-cols-2">
            <div className="space-y-1">
              <label className="text-body-xs-medium text-tertiary">
                {t("automations.trigger.config.from_priority")}
              </label>
              <select
                className={selectClass}
                value={triggerConfig.from_priority}
                onChange={(e) => patchTriggerConfig("from_priority", e.target.value)}
              >
                <option value="">{t("automations.trigger.config.any")}</option>
                {PRIORITY_OPTIONS.map((priority) => (
                  <option key={priority} value={priority}>
                    {priority}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-body-xs-medium text-tertiary">{t("automations.trigger.config.to_priority")}</label>
              <select
                className={selectClass}
                value={triggerConfig.to_priority}
                onChange={(e) => patchTriggerConfig("to_priority", e.target.value)}
              >
                <option value="">{t("automations.trigger.config.any")}</option>
                {PRIORITY_OPTIONS.map((priority) => (
                  <option key={priority} value={priority}>
                    {priority}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        {triggerType === "label_changed" && (
          <div className="space-y-1">
            <label className="text-body-xs-medium text-tertiary">{t("automations.trigger.config.label_added")}</label>
            <select
              className={selectClass}
              value={triggerConfig.label_id}
              onChange={(e) => patchTriggerConfig("label_id", e.target.value)}
            >
              <option value="">{t("automations.trigger.config.any")}</option>
              {labels.map((label) => (
                <option key={label.id} value={label.id}>
                  {label.name}
                </option>
              ))}
            </select>
          </div>
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
              className={selectClass}
              value={condition.field}
              onChange={(e) => {
                const field = e.target.value as TWorkspaceAutomationConditionField;
                const nextValue = field === "priority" ? "urgent" : field === "name_contains" ? "" : "";
                updateCondition(index, {
                  field,
                  operator: field === "name_contains" ? "contains" : "is",
                  value: nextValue,
                });
              }}
            >
              {AUTOMATION_CONDITION_FIELD_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {t(option.labelKey)}
                </option>
              ))}
            </select>

            {condition.field === "priority" && (
              <select
                className={`${selectClass} md:col-span-2`}
                value={String(condition.value)}
                onChange={(e) => updateCondition(index, { value: e.target.value })}
              >
                {PRIORITY_OPTIONS.map((priority) => (
                  <option key={priority} value={priority}>
                    {priority}
                  </option>
                ))}
              </select>
            )}
            {condition.field === "state" && (
              <div className="md:col-span-2">
                {renderStateSelect(
                  String(condition.value ?? ""),
                  (v) => updateCondition(index, { value: v }),
                  states,
                  false
                )}
              </div>
            )}
            {condition.field === "label" && (
              <select
                className={`${selectClass} md:col-span-2`}
                value={String(condition.value ?? "")}
                onChange={(e) => updateCondition(index, { value: e.target.value })}
              >
                <option value="">{t("common.select")}</option>
                {labels.map((label) => (
                  <option key={label.id} value={label.id}>
                    {label.name}
                  </option>
                ))}
              </select>
            )}
            {condition.field === "assignee" && (
              <select
                className={`${selectClass} md:col-span-2`}
                value={String(condition.value ?? "")}
                onChange={(e) => updateCondition(index, { value: e.target.value })}
              >
                <option value="">{t("common.select")}</option>
                {members.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name}
                  </option>
                ))}
              </select>
            )}
            {condition.field === "issue_type" && (
              <select
                className={`${selectClass} md:col-span-2`}
                value={String(condition.value ?? "")}
                onChange={(e) => updateCondition(index, { value: e.target.value })}
              >
                <option value="">{t("common.select")}</option>
                {issueTypes.map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.name}
                  </option>
                ))}
              </select>
            )}
            {condition.field === "name_contains" && (
              <Input
                className="md:col-span-2"
                value={String(condition.value ?? "")}
                onChange={(e) => updateCondition(index, { value: e.target.value })}
                placeholder={t("automations.condition.fields.name_contains")}
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
        {actions.map((actionItem, index) => {
          const actionProjectId = String(actionItem.config.project_id || contextProjectId || "");
          const actionStates = actionProjectId ? (getProjectStates(actionProjectId) ?? []) : states;
          const actionTypes = actionProjectId ? getProjectIssueTypes(actionProjectId) : issueTypes;
          const propertyKey = String(
            actionItem.config.property ?? "priority"
          ) as TWorkspaceAutomationChangeableProperty;

          return (
            <div key={actionItem.clientKey} className="space-y-2 rounded-md border border-subtle bg-layer-2 p-3">
              <select
                className={selectClass}
                value={actionItem.action_type}
                onChange={(e) => {
                  const actionType = e.target.value as TWorkspaceAutomationActionType;
                  updateAction(index, { action_type: actionType, config: defaultActionConfig(actionType) });
                }}
              >
                {AUTOMATION_ACTION_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {t(option.labelKey)}
                  </option>
                ))}
              </select>

              {actionItem.action_type === "change_state" &&
                renderStateSelect(
                  String(actionItem.config.state_id ?? ""),
                  (v) => updateAction(index, { config: { state_id: v } }),
                  actionStates,
                  false
                )}

              {actionItem.action_type === "assign" && (
                <select
                  className={selectClass}
                  value={
                    Array.isArray(actionItem.config.assignee_ids) ? String(actionItem.config.assignee_ids[0] ?? "") : ""
                  }
                  onChange={(e) =>
                    updateAction(index, {
                      config: { assignee_ids: e.target.value ? [e.target.value] : [] },
                    })
                  }
                >
                  <option value="">{t("common.select")}</option>
                  {members.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.name}
                    </option>
                  ))}
                </select>
              )}

              {actionItem.action_type === "add_comment" && (
                <Input
                  value={String(actionItem.config.comment_html ?? "").replace(/^<p>|<\/p>$/g, "")}
                  onChange={(e) =>
                    updateAction(index, {
                      config: { comment_html: `<p>${e.target.value}</p>` },
                    })
                  }
                  placeholder={t("automations.action.comment_block.title")}
                  className="w-full"
                />
              )}

              {actionItem.action_type === "create_work_item" && (
                <div className="grid gap-2 md:grid-cols-2">
                  <select
                    className={selectClass}
                    value={String(actionItem.config.project_id ?? "")}
                    onChange={(e) =>
                      updateAction(index, {
                        config: { ...actionItem.config, project_id: e.target.value, issue_type_id: "" },
                      })
                    }
                  >
                    <option value="">{t("automations.action.create_work_item.project_placeholder")}</option>
                    {projects.map((project) =>
                      project ? (
                        <option key={project.id} value={project.id}>
                          {project.name}
                        </option>
                      ) : null
                    )}
                  </select>
                  <select
                    className={selectClass}
                    value={String(actionItem.config.issue_type_id ?? "")}
                    onChange={(e) =>
                      updateAction(index, {
                        config: { ...actionItem.config, issue_type_id: e.target.value },
                      })
                    }
                  >
                    <option value="">{t("common.default")}</option>
                    {actionTypes.map((type) => (
                      <option key={type.id} value={type.id}>
                        {type.name}
                      </option>
                    ))}
                  </select>
                  <Input
                    className="md:col-span-2"
                    value={String(actionItem.config.name ?? "")}
                    onChange={(e) =>
                      updateAction(index, {
                        config: { ...actionItem.config, name: e.target.value },
                      })
                    }
                    placeholder={t("automations.action.create_work_item.name_placeholder")}
                  />
                </div>
              )}

              {actionItem.action_type === "change_property" && (
                <div className="grid gap-2 md:grid-cols-2">
                  <select
                    className={selectClass}
                    value={propertyKey}
                    onChange={(e) =>
                      updateAction(index, {
                        config: {
                          property: e.target.value,
                          value: e.target.value === "priority" ? "urgent" : "",
                        },
                      })
                    }
                  >
                    {CHANGEABLE_PROPERTY_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {t(option.labelKey)}
                      </option>
                    ))}
                  </select>
                  {propertyKey === "priority" && (
                    <select
                      className={selectClass}
                      value={String(actionItem.config.value ?? "")}
                      onChange={(e) => updateAction(index, { config: { ...actionItem.config, value: e.target.value } })}
                    >
                      {PRIORITY_OPTIONS.map((priority) => (
                        <option key={priority} value={priority}>
                          {priority}
                        </option>
                      ))}
                    </select>
                  )}
                  {propertyKey === "state_id" &&
                    renderStateSelect(
                      String(actionItem.config.value ?? ""),
                      (v) => updateAction(index, { config: { ...actionItem.config, value: v } }),
                      actionStates,
                      false
                    )}
                  {propertyKey === "assignee_ids" && (
                    <select
                      className={selectClass}
                      value={
                        Array.isArray(actionItem.config.value)
                          ? String(actionItem.config.value[0] ?? "")
                          : String(actionItem.config.value ?? "")
                      }
                      onChange={(e) =>
                        updateAction(index, {
                          config: { ...actionItem.config, value: e.target.value ? [e.target.value] : [] },
                        })
                      }
                    >
                      <option value="">{t("common.select")}</option>
                      {members.map((member) => (
                        <option key={member.id} value={member.id}>
                          {member.name}
                        </option>
                      ))}
                    </select>
                  )}
                  {(propertyKey === "name" || propertyKey === "target_date") && (
                    <Input
                      type={propertyKey === "target_date" ? "date" : "text"}
                      value={String(actionItem.config.value ?? "")}
                      onChange={(e) => updateAction(index, { config: { ...actionItem.config, value: e.target.value } })}
                      className="w-full"
                    />
                  )}
                </div>
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
          );
        })}
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
