/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useTranslation } from "@plane/i18n";
import { Input } from "@makeplane/propel/components/input";
import type {
  TWorkspaceAutomationCreateFieldKey,
  TWorkspaceAutomationFieldValue,
  TWorkspaceAutomationRelativeDateBase,
  TWorkspaceAutomationRelativeDateUnit,
  TWorkspaceAutomationSourceField,
} from "@plane/types";
import {
  PRIORITY_OPTIONS,
  RELATIVE_DATE_BASE_OPTIONS,
  RELATIVE_DATE_UNIT_OPTIONS,
  SOURCE_FIELD_OPTIONS,
  SOURCE_FIELDS_FOR_TARGET,
} from "./constants";

const selectClass = "text-body-sm w-full rounded-md border border-subtle bg-layer-1 px-3 py-2 text-primary";

type MemberOption = { id: string; name: string };
type NamedOption = { id: string; name: string };

type Props = {
  fieldKey: TWorkspaceAutomationCreateFieldKey | "name";
  value: TWorkspaceAutomationFieldValue;
  onChange: (value: TWorkspaceAutomationFieldValue) => void;
  isDate?: boolean;
  allowFromSource?: boolean;
  states?: NamedOption[];
  members?: MemberOption[];
  labels?: NamedOption[];
};

export function normalizeFieldValue(
  raw: unknown,
  fieldKey: TWorkspaceAutomationCreateFieldKey | "name"
): TWorkspaceAutomationFieldValue {
  if (raw && typeof raw === "object" && "mode" in (raw as object)) {
    return raw as TWorkspaceAutomationFieldValue;
  }
  if (typeof raw === "string" || Array.isArray(raw) || raw === null) {
    return { mode: "static", value: raw as string | string[] | null };
  }
  const defaults: Record<string, TWorkspaceAutomationFieldValue> = {
    name: { mode: "static", value: "" },
    priority: { mode: "static", value: "none" },
    state_id: { mode: "static", value: "" },
    assignee_ids: { mode: "static", value: [] },
    label_ids: { mode: "static", value: [] },
    start_date: { mode: "static", value: "" },
    target_date: { mode: "static", value: "" },
  };
  return defaults[fieldKey] ?? { mode: "static", value: "" };
}

export function defaultFieldValueForMode(
  fieldKey: TWorkspaceAutomationCreateFieldKey | "name",
  mode: TWorkspaceAutomationFieldValue["mode"],
  isDate: boolean
): TWorkspaceAutomationFieldValue {
  if (mode === "from_source") {
    const compatible = SOURCE_FIELDS_FOR_TARGET[fieldKey] ?? ["name"];
    return { mode: "from_source", field: compatible[0] };
  }
  if (mode === "relative_date" && isDate) {
    return { mode: "relative_date", base: "now", offset: { amount: 1, unit: "weeks" } };
  }
  if (fieldKey === "priority") return { mode: "static", value: "none" };
  if (fieldKey === "assignee_ids" || fieldKey === "label_ids") return { mode: "static", value: [] };
  return { mode: "static", value: "" };
}

export function FieldValueEditor(props: Props) {
  const {
    fieldKey,
    value,
    onChange,
    isDate = false,
    allowFromSource = true,
    states = [],
    members = [],
    labels = [],
  } = props;
  const { t } = useTranslation();

  const compatibleSources = SOURCE_FIELDS_FOR_TARGET[fieldKey] ?? [];

  const setMode = (mode: TWorkspaceAutomationFieldValue["mode"]) => {
    onChange(defaultFieldValueForMode(fieldKey, mode, isDate));
  };

  return (
    <div className="grid gap-2 md:grid-cols-2">
      <select
        className={`${selectClass}${value.mode === "relative_date" ? " md:col-span-2" : ""}`}
        value={value.mode}
        onChange={(e) => setMode(e.target.value as TWorkspaceAutomationFieldValue["mode"])}
      >
        <option value="static">{t("automations.action.field_value.mode.static")}</option>
        {allowFromSource && <option value="from_source">{t("automations.action.field_value.mode.from_source")}</option>}
        {isDate && <option value="relative_date">{t("automations.action.field_value.mode.relative_date")}</option>}
      </select>

      {value.mode === "static" && fieldKey === "name" && (
        <Input
          value={String(value.value ?? "")}
          onChange={(e) => onChange({ mode: "static", value: e.target.value })}
          placeholder={t("automations.action.create_work_item.name_placeholder")}
          className="w-full"
          required
        />
      )}

      {value.mode === "static" && fieldKey === "priority" && (
        <select
          className={selectClass}
          value={String(value.value ?? "none")}
          onChange={(e) => onChange({ mode: "static", value: e.target.value })}
        >
          {PRIORITY_OPTIONS.map((priority) => (
            <option key={priority} value={priority}>
              {priority}
            </option>
          ))}
        </select>
      )}

      {value.mode === "static" && fieldKey === "state_id" && (
        <select
          className={selectClass}
          value={String(value.value ?? "")}
          onChange={(e) => onChange({ mode: "static", value: e.target.value })}
        >
          <option value="">{t("common.select")}</option>
          {states.map((state) => (
            <option key={state.id} value={state.id}>
              {state.name}
            </option>
          ))}
        </select>
      )}

      {value.mode === "static" && fieldKey === "assignee_ids" && (
        <select
          className={selectClass}
          value={Array.isArray(value.value) ? String(value.value[0] ?? "") : String(value.value ?? "")}
          onChange={(e) => onChange({ mode: "static", value: e.target.value ? [e.target.value] : [] })}
        >
          <option value="">{t("common.select")}</option>
          {members.map((member) => (
            <option key={member.id} value={member.id}>
              {member.name}
            </option>
          ))}
        </select>
      )}

      {value.mode === "static" && fieldKey === "label_ids" && (
        <select
          className={selectClass}
          value={Array.isArray(value.value) ? String(value.value[0] ?? "") : String(value.value ?? "")}
          onChange={(e) => onChange({ mode: "static", value: e.target.value ? [e.target.value] : [] })}
        >
          <option value="">{t("common.select")}</option>
          {labels.map((label) => (
            <option key={label.id} value={label.id}>
              {label.name}
            </option>
          ))}
        </select>
      )}

      {value.mode === "static" && (fieldKey === "start_date" || fieldKey === "target_date") && (
        <Input
          type="date"
          value={String(value.value ?? "")}
          onChange={(e) => onChange({ mode: "static", value: e.target.value })}
          className="w-full"
        />
      )}

      {value.mode === "from_source" && (
        <select
          className={selectClass}
          value={value.field}
          onChange={(e) => onChange({ mode: "from_source", field: e.target.value as TWorkspaceAutomationSourceField })}
        >
          {SOURCE_FIELD_OPTIONS.filter((option) => compatibleSources.includes(option.value)).map((option) => (
            <option key={option.value} value={option.value}>
              {t(option.labelKey)}
            </option>
          ))}
        </select>
      )}

      {value.mode === "relative_date" && (
        <div className="flex min-w-0 flex-wrap items-center gap-2 md:col-span-2">
          <select
            className={`${selectClass} min-w-[9rem] flex-1 basis-[9rem]`}
            value={value.base}
            onChange={(e) =>
              onChange({
                ...value,
                base: e.target.value as TWorkspaceAutomationRelativeDateBase,
              })
            }
          >
            {RELATIVE_DATE_BASE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {t(option.labelKey)}
              </option>
            ))}
          </select>
          <span className="shrink-0 text-body-sm-medium text-secondary" aria-hidden="true">
            +
          </span>
          <Input
            type="number"
            className="w-16 shrink-0"
            value={String(value.offset.amount)}
            onChange={(e) =>
              onChange({
                ...value,
                offset: { ...value.offset, amount: Number(e.target.value || 0) },
              })
            }
          />
          <select
            className={`${selectClass} w-auto min-w-24 shrink-0`}
            value={value.offset.unit}
            onChange={(e) =>
              onChange({
                ...value,
                offset: {
                  ...value.offset,
                  unit: e.target.value as TWorkspaceAutomationRelativeDateUnit,
                },
              })
            }
          >
            {RELATIVE_DATE_UNIT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {t(option.labelKey)}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}
