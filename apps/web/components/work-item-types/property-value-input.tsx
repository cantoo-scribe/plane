/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { Input } from "@makeplane/propel/components/input";
import type { TIssueCustomProperty, TIssueCustomPropertyValueWrite } from "@plane/types";
import { MemberSelect } from "@/components/dropdowns/member/member-select";

type Props = {
  property: TIssueCustomProperty;
  value: TIssueCustomPropertyValueWrite | undefined;
  projectId: string;
  disabled?: boolean;
  onChange: (value: TIssueCustomPropertyValueWrite) => void;
};

export const CustomPropertyValueInput = observer(function CustomPropertyValueInput(props: Props) {
  const { property, value, projectId, disabled, onChange } = props;

  const base: TIssueCustomPropertyValueWrite = {
    property_id: property.id,
    ...value,
  };

  switch (property.property_type) {
    case "TEXT":
      return (
        <Input
          size="md"
          surface="field"
          value={value?.value_text ?? ""}
          disabled={disabled || property.settings?.readonly}
          onChange={(e) => onChange({ ...base, value_text: e.target.value })}
          placeholder={property.name}
          className="w-full"
        />
      );
    case "NUMBER":
      return (
        <Input
          size="md"
          surface="field"
          type="number"
          value={value?.value_number ?? ""}
          disabled={disabled || property.settings?.readonly}
          onChange={(e) =>
            onChange({
              ...base,
              value_number: e.target.value === "" ? null : Number(e.target.value),
            })
          }
          placeholder={property.name}
          className="w-full"
        />
      );
    case "BOOLEAN":
      return (
        <select
          className="text-sm w-full rounded-md border border-subtle-1 bg-transparent px-2 py-1.5"
          disabled={disabled}
          value={value?.value_boolean == null ? "" : value.value_boolean ? "true" : "false"}
          onChange={(e) =>
            onChange({
              ...base,
              value_boolean: e.target.value === "" ? null : e.target.value === "true",
            })
          }
        >
          <option value="">—</option>
          <option value="true">True</option>
          <option value="false">False</option>
        </select>
      );
    case "DATE":
      return (
        <Input
          size="md"
          surface="field"
          type="date"
          value={value?.value_datetime ? value.value_datetime.slice(0, 10) : ""}
          disabled={disabled}
          onChange={(e) =>
            onChange({
              ...base,
              value_datetime: e.target.value ? new Date(e.target.value).toISOString() : null,
            })
          }
          className="w-full"
        />
      );
    case "DROPDOWN": {
      const isMulti = property.settings?.is_multi_select;
      const selected = value?.value_option_ids ?? [];
      return (
        <select
          className="text-sm w-full rounded-md border border-subtle-1 bg-transparent px-2 py-1.5"
          disabled={disabled}
          multiple={isMulti}
          value={isMulti ? selected : (selected[0] ?? "")}
          onChange={(e) => {
            if (isMulti) {
              const ids = Array.from(e.target.selectedOptions).map((o) => o.value);
              onChange({ ...base, value_option_ids: ids });
            } else {
              onChange({ ...base, value_option_ids: e.target.value ? [e.target.value] : [] });
            }
          }}
        >
          {!isMulti && <option value="">—</option>}
          {(property.options ?? [])
            .filter((o) => o.is_active)
            .map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
              </option>
            ))}
        </select>
      );
    }
    case "MEMBER":
      return (
        <MemberSelect
          value={value?.value_member_ids ?? []}
          onChange={(ids) => onChange({ ...base, value_member_ids: ids })}
          projectId={projectId}
          multiple
          variant="select-ghost-md"
          placeholder={property.name}
          disabled={disabled}
        />
      );
    case "FORMULA":
      return <div className="text-sm text-tertiary">{value?.value_text ?? value?.value_number ?? "—"}</div>;
    default:
      return null;
  }
});
