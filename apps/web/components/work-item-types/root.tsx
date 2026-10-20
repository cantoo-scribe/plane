/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import { observer } from "mobx-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@makeplane/propel/components/button";
import { Input } from "@makeplane/propel/components/input";
import { Switch } from "@makeplane/propel/components/switch";
import { setToast } from "@plane/blocks/toast";
import { SettingsBoxedControlItem } from "@/components/settings/boxed-control-item";
import { SettingsHeading } from "@/components/settings/heading";
import { useIssueType } from "@/hooks/store/use-issue-type";
import { useProject } from "@/hooks/store/use-project";
import { CustomPropertyForm } from "./property-form";

type Props = {
  workspaceSlug: string;
  projectId: string;
  isAdmin: boolean;
};

export const WorkItemTypesRoot = observer(function WorkItemTypesRoot(props: Props) {
  const { workspaceSlug, projectId, isAdmin } = props;
  const { t } = useTranslation();
  const { getProjectById, updateProject } = useProject();
  const {
    getProjectIssueTypes,
    getPropertiesForType,
    fetchProjectIssueTypes,
    fetchProperties,
    createIssueType,
    deleteIssueType,
    markAsDefault,
    deleteProperty,
  } = useIssueType();

  const project = getProjectById(projectId);
  const types = getProjectIssueTypes(projectId);
  const [selectedTypeId, setSelectedTypeId] = useState<string | null>(null);
  const [showTypeForm, setShowTypeForm] = useState(false);
  const [newTypeName, setNewTypeName] = useState("");
  const [showPropertyForm, setShowPropertyForm] = useState(false);
  const [editingPropertyId, setEditingPropertyId] = useState<string | null>(null);
  const [isToggling, setIsToggling] = useState(false);

  useEffect(() => {
    if (workspaceSlug && projectId) {
      void fetchProjectIssueTypes(workspaceSlug, projectId);
    }
  }, [workspaceSlug, projectId, fetchProjectIssueTypes]);

  useEffect(() => {
    if (types.length && !selectedTypeId) {
      setSelectedTypeId(types.find((issueType) => issueType.is_default)?.id ?? types[0].id);
    }
  }, [types, selectedTypeId]);

  useEffect(() => {
    if (workspaceSlug && projectId && selectedTypeId) {
      void fetchProperties(workspaceSlug, projectId, selectedTypeId);
    }
  }, [workspaceSlug, projectId, selectedTypeId, fetchProperties]);

  const properties = getPropertiesForType(selectedTypeId);
  const editingProperty = editingPropertyId ? properties.find((p) => p.id === editingPropertyId) : undefined;
  const selectedType = selectedTypeId ? types.find((type) => type.id === selectedTypeId) : undefined;

  const handleEnableTypes = async (checked: boolean) => {
    if (!project || !isAdmin || isToggling) return;
    setIsToggling(true);
    try {
      await updateProject(workspaceSlug, projectId, {
        is_issue_type_enabled: checked,
      });
    } catch {
      setToast({
        type: "error",
        title: "Error!",
        message: t("common.something_went_wrong"),
      });
    } finally {
      setIsToggling(false);
    }
  };

  const handleCreateType = async () => {
    if (!newTypeName.trim()) return;
    try {
      const type = await createIssueType(workspaceSlug, projectId, { name: newTypeName.trim() });
      setSelectedTypeId(type.id);
      setNewTypeName("");
      setShowTypeForm(false);
      setToast({
        type: "success",
        title: "Success!",
        message: t("work_item_types.create.toast.success.message"),
      });
    } catch {
      setToast({
        type: "error",
        title: "Error!",
        message: t("work_item_types.create.toast.error.message.default"),
      });
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <SettingsHeading title={t("work_item_types.label")} description={t("work_item_types.settings.description")} />

      <SettingsBoxedControlItem
        title={t("work_item_types.empty_state.enable.title")}
        description={t("work_item_types.empty_state.enable.description")}
        control={
          <Switch
            size="sm"
            checked={Boolean(project?.is_issue_type_enabled)}
            onCheckedChange={handleEnableTypes}
            disabled={!isAdmin || isToggling}
          />
        }
      />

      {project?.is_issue_type_enabled && (
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
          <div className="flex flex-col gap-4 lg:col-span-4">
            <div className="flex items-center justify-between gap-3">
              <SettingsHeading title={t("work_item_types.settings.types.title")} variant="h6" />
              {isAdmin && !showTypeForm && (
                <Button
                  variant="secondary"
                  size="sm"
                  stretch="auto"
                  onClick={() => setShowTypeForm(true)}
                  label={t("work_item_types.create.button")}
                />
              )}
            </div>

            {showTypeForm && (
              <div className="flex flex-col gap-3 rounded-lg border border-subtle bg-layer-2 p-4">
                <Input
                  size="md"
                  surface="field"
                  value={newTypeName}
                  onChange={(e) => setNewTypeName(e.target.value)}
                  placeholder={t("work_item_types.create_update.form.name.placeholder")}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void handleCreateType();
                  }}
                />
                <div className="flex justify-end gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    stretch="auto"
                    onClick={() => {
                      setShowTypeForm(false);
                      setNewTypeName("");
                    }}
                    label={t("common.cancel")}
                  />
                  <Button
                    variant="primary"
                    size="sm"
                    stretch="auto"
                    onClick={handleCreateType}
                    disabled={!newTypeName.trim()}
                    label={t("common.create")}
                  />
                </div>
              </div>
            )}

            <div className="flex flex-col gap-1">
              {types.map((type) => (
                <button
                  key={type.id}
                  type="button"
                  className={`flex w-full items-center justify-between gap-2 rounded-md px-3 py-2.5 text-left text-body-sm-medium transition-colors ${
                    selectedTypeId === type.id ? "bg-layer-2 text-primary" : "text-secondary hover:bg-layer-1"
                  }`}
                  onClick={() => {
                    setSelectedTypeId(type.id);
                    setShowPropertyForm(false);
                    setEditingPropertyId(null);
                  }}
                >
                  <span className="truncate">
                    {type.name}
                    {type.is_default ? (
                      <span className="ml-1.5 text-caption-md-regular text-tertiary">({t("common.default")})</span>
                    ) : null}
                  </span>
                  {isAdmin && !type.is_default && (
                    <span className="flex shrink-0 items-center gap-2">
                      <button
                        type="button"
                        className="text-caption-md-regular text-tertiary hover:text-primary"
                        onClick={(e) => {
                          e.stopPropagation();
                          void markAsDefault(workspaceSlug, projectId, type.id);
                        }}
                      >
                        {t("work_item_types.settings.set_as_default")}
                      </button>
                      <button
                        type="button"
                        className="text-caption-md-regular text-tertiary hover:text-danger-primary"
                        onClick={(e) => {
                          e.stopPropagation();
                          void deleteIssueType(workspaceSlug, projectId, type.id).then(() => {
                            if (selectedTypeId === type.id) setSelectedTypeId(null);
                            return undefined;
                          });
                        }}
                      >
                        {t("common.delete")}
                      </button>
                    </span>
                  )}
                </button>
              ))}
              {!types.length && (
                <p className="px-1 text-body-sm-regular text-tertiary">
                  {t("work_item_types.settings.types.description")}
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-4 lg:col-span-8">
            <div className="flex items-start justify-between gap-3">
              <div className="flex flex-col gap-1">
                <SettingsHeading
                  title={
                    selectedType
                      ? `${selectedType.name} · ${t("work_item_types.settings.properties.title")}`
                      : t("work_item_types.settings.properties.title")
                  }
                  variant="h6"
                />
                <p className="text-caption-md-regular text-tertiary">
                  {t("work_item_types.settings.properties.description")}
                </p>
              </div>
              {isAdmin && selectedTypeId && !showPropertyForm && !editingProperty && (
                <Button
                  variant="secondary"
                  size="sm"
                  stretch="auto"
                  onClick={() => {
                    setEditingPropertyId(null);
                    setShowPropertyForm(true);
                  }}
                  label={t("work_item_types.settings.properties.add_button")}
                />
              )}
            </div>

            {(showPropertyForm || editingProperty) && selectedTypeId && (
              <CustomPropertyForm
                workspaceSlug={workspaceSlug}
                projectId={projectId}
                typeId={selectedTypeId}
                property={editingProperty}
                onClose={() => {
                  setShowPropertyForm(false);
                  setEditingPropertyId(null);
                }}
              />
            )}

            <div className="flex flex-col gap-2">
              {properties.map((prop) => (
                <div
                  key={prop.id}
                  className="flex items-center justify-between gap-4 rounded-lg border border-subtle bg-layer-2 px-4 py-3"
                >
                  <div className="min-w-0">
                    <div className="truncate text-body-sm-medium text-primary">
                      {prop.name}
                      {prop.is_required ? " *" : ""}
                    </div>
                    <div className="text-caption-md-regular text-tertiary">
                      {t(
                        `work_item_types.settings.properties.property_type.${
                          prop.property_type === "MEMBER" ? "member_picker" : prop.property_type.toLowerCase()
                        }.label`
                      )}
                    </div>
                  </div>
                  {isAdmin && (
                    <div className="flex shrink-0 items-center gap-3">
                      <button
                        type="button"
                        className="text-caption-md-regular text-tertiary hover:text-primary"
                        onClick={() => {
                          setShowPropertyForm(false);
                          setEditingPropertyId(prop.id);
                        }}
                      >
                        {t("common.edit")}
                      </button>
                      <button
                        type="button"
                        className="text-caption-md-regular text-tertiary hover:text-danger-primary"
                        onClick={() => {
                          if (!selectedTypeId) return;
                          void deleteProperty(workspaceSlug, projectId, selectedTypeId, prop.id);
                        }}
                      >
                        {t("common.delete")}
                      </button>
                    </div>
                  )}
                </div>
              ))}
              {!properties.length && selectedTypeId && !showPropertyForm && !editingProperty && (
                <div className="rounded-lg border border-dashed border-subtle px-6 py-10 text-center">
                  <div className="text-body-sm-medium text-primary">
                    {t("work_item_types.settings.properties.empty_state.title")}
                  </div>
                  <div className="mt-1 text-caption-md-regular text-tertiary">
                    {t("work_item_types.settings.properties.empty_state.description")}
                  </div>
                  {isAdmin && (
                    <div className="mt-4 flex justify-center">
                      <Button
                        variant="primary"
                        size="sm"
                        stretch="auto"
                        onClick={() => {
                          setEditingPropertyId(null);
                          setShowPropertyForm(true);
                        }}
                        label={t("work_item_types.settings.properties.add_button")}
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
});
