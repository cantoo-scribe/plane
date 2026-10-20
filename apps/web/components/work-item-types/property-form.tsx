/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@makeplane/propel/components/button";
import { Input } from "@makeplane/propel/components/input";
import { TextArea } from "@makeplane/propel/components/textarea";
import type { TIssueCustomProperty, TIssueCustomPropertyType } from "@plane/types";
import { setToast } from "@plane/blocks/toast";
import { useIssueType } from "@/hooks/store/use-issue-type";

const PROPERTY_TYPES: TIssueCustomPropertyType[] = [
  "TEXT",
  "NUMBER",
  "DROPDOWN",
  "BOOLEAN",
  "DATE",
  "MEMBER",
  "FORMULA",
];

type Props = {
  workspaceSlug: string;
  projectId: string;
  typeId: string;
  property?: TIssueCustomProperty;
  onClose: () => void;
  onSuccess?: () => void;
};

export const CustomPropertyForm = observer(function CustomPropertyForm(props: Props) {
  const { workspaceSlug, projectId, typeId, property, onClose, onSuccess } = props;
  const { t } = useTranslation();
  const { createProperty, updateProperty } = useIssueType();

  const [name, setName] = useState(property?.name ?? "");
  const [description, setDescription] = useState(property?.description ?? "");
  const [propertyType, setPropertyType] = useState<TIssueCustomPropertyType>(property?.property_type ?? "TEXT");
  const [isRequired, setIsRequired] = useState(property?.is_required ?? false);
  const [formula, setFormula] = useState(property?.settings?.formula ?? "");
  const [optionsText, setOptionsText] = useState(property?.options?.map((o) => o.name).join("\n") ?? "");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!name.trim()) {
      setToast({
        type: "error",
        title: "Error!",
        message: t("work_item_types.settings.properties.create_update.errors.name.required"),
      });
      return;
    }
    setSubmitting(true);
    try {
      const settings =
        propertyType === "FORMULA" ? { formula } : propertyType === "TEXT" ? { is_multi_line: false } : {};

      if (property) {
        await updateProperty(workspaceSlug, projectId, typeId, property.id, {
          name: name.trim(),
          description,
          is_required: isRequired,
          settings: { ...property.settings, ...settings },
        });
      } else {
        const options =
          propertyType === "DROPDOWN"
            ? optionsText
                .split("\n")
                .map((line) => line.trim())
                .filter(Boolean)
                .map((optName, index) => ({ name: optName, sort_order: index * 10000 }))
            : undefined;
        await createProperty(workspaceSlug, projectId, typeId, {
          name: name.trim(),
          description,
          property_type: propertyType,
          is_required: isRequired,
          settings,
          options,
        });
      }
      setToast({
        type: "success",
        title: "Success!",
        message: property
          ? t("work_item_types.settings.properties.toast.update.success.message", { name })
          : t("work_item_types.settings.properties.toast.create.success.message", { name }),
      });
      onSuccess?.();
      onClose();
    } catch {
      setToast({
        type: "error",
        title: "Error!",
        message: property
          ? t("work_item_types.settings.properties.toast.update.error.message")
          : t("work_item_types.settings.properties.toast.create.error.message"),
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 rounded-md border border-subtle-1 p-4">
      <div className="text-sm font-medium">
        {property
          ? t("work_item_types.settings.properties.create_update.title.update")
          : t("work_item_types.settings.properties.create_update.title.create")}
      </div>
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={t("work_item_types.settings.properties.create_update.form.display_name.placeholder")}
      />
      <TextArea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder={t("work_item_types.settings.properties.create_update.form.description.placeholder")}
      />
      {!property && (
        <select
          className="text-sm rounded-md border border-subtle-1 bg-transparent px-3 py-2"
          value={propertyType}
          onChange={(e) => setPropertyType(e.target.value as TIssueCustomPropertyType)}
        >
          {PROPERTY_TYPES.map((type) => (
            <option key={type} value={type}>
              {t(`work_item_types.settings.properties.property_type.${type.toLowerCase()}.label`)}
            </option>
          ))}
        </select>
      )}
      {propertyType === "DROPDOWN" && !property && (
        <TextArea
          value={optionsText}
          onChange={(e) => setOptionsText(e.target.value)}
          placeholder="One option per line"
        />
      )}
      {propertyType === "FORMULA" && (
        <Input
          value={formula}
          onChange={(e) => setFormula(e.target.value)}
          placeholder={t("work_item_types.settings.properties.formula.placeholder")}
        />
      )}
      <label className="text-sm flex items-center gap-2">
        <input type="checkbox" checked={isRequired} onChange={(e) => setIsRequired(e.target.checked)} />
        {t("work_item_types.settings.properties.mandate_confirmation.label")}
      </label>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" size="sm" onClick={onClose} disabled={submitting}>
          Cancel
        </Button>
        <Button variant="primary" size="sm" onClick={handleSubmit} disabled={submitting}>
          {property ? "Update" : "Create"}
        </Button>
      </div>
    </div>
  );
});
