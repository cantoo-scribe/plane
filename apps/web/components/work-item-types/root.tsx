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
import { setToast, TOAST_TYPE } from "@plane/blocks/toast";
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

  const handleEnableTypes = async () => {
    if (!project) return;
    await updateProject(workspaceSlug, projectId, {
      is_issue_type_enabled: !project.is_issue_type_enabled,
    });
  };

  const handleCreateType = async () => {
    if (!newTypeName.trim()) return;
    try {
      const type = await createIssueType(workspaceSlug, projectId, { name: newTypeName.trim() });
      setSelectedTypeId(type.id);
      setNewTypeName("");
      setShowTypeForm(false);
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "Success!",
        message: t("work_item_types.create.toast.success.message"),
      });
    } catch {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Error!",
        message: t("work_item_types.create.toast.error.message.default"),
      });
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <SettingsHeading title={t("work_item_types.label")} description={t("work_item_types.settings.description")} />

      <div className="flex items-center justify-between rounded-md border border-subtle-1 p-4">
        <div>
          <div className="text-sm font-medium">Enable work item types</div>
          <div className="text-xs text-tertiary">Turn on custom work item types and properties for this project.</div>
        </div>
        <Button variant="secondary" size="sm" onClick={handleEnableTypes} disabled={!isAdmin}>
          {project?.is_issue_type_enabled ? "Disable" : "Enable"}
        </Button>
      </div>

      {project?.is_issue_type_enabled && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="flex flex-col gap-3 lg:col-span-1">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium">{t("work_item_types.settings.types.title")}</div>
              {isAdmin && (
                <Button variant="secondary" size="sm" onClick={() => setShowTypeForm(true)}>
                  {t("work_item_types.create.button")}
                </Button>
              )}
            </div>
            {showTypeForm && (
              <div className="flex flex-col gap-2 rounded-md border border-subtle-1 p-3">
                <Input
                  value={newTypeName}
                  onChange={(e) => setNewTypeName(e.target.value)}
                  placeholder={t("work_item_types.create_update.form.name.placeholder")}
                />
                <div className="flex justify-end gap-2">
                  <Button variant="secondary" size="sm" onClick={() => setShowTypeForm(false)}>
                    Cancel
                  </Button>
                  <Button variant="primary" size="sm" onClick={handleCreateType}>
                    Create
                  </Button>
                </div>
              </div>
            )}
            <div className="flex flex-col gap-1">
              {types.map((type) => (
                <button
                  key={type.id}
                  type="button"
                  className={`text-sm flex items-center justify-between rounded-md px-3 py-2 text-left ${
                    selectedTypeId === type.id ? "bg-layer-2" : "hover:bg-layer-1"
                  }`}
                  onClick={() => setSelectedTypeId(type.id)}
                >
                  <span>
                    {type.name}
                    {type.is_default ? " (default)" : ""}
                  </span>
                  {isAdmin && (
                    <span className="flex gap-1">
                      {!type.is_default && (
                        <button
                          type="button"
                          className="text-xs text-tertiary hover:text-primary"
                          onClick={(e) => {
                            e.stopPropagation();
                            void markAsDefault(workspaceSlug, projectId, type.id);
                          }}
                        >
                          Default
                        </button>
                      )}
                      {!type.is_default && (
                        <button
                          type="button"
                          className="text-xs hover:text-danger text-tertiary"
                          onClick={(e) => {
                            e.stopPropagation();
                            void deleteIssueType(workspaceSlug, projectId, type.id).then(() => {
                              if (selectedTypeId === type.id) setSelectedTypeId(null);
                              return undefined;
                            });
                          }}
                        >
                          Delete
                        </button>
                      )}
                    </span>
                  )}
                </button>
              ))}
              {!types.length && (
                <div className="text-sm text-tertiary">{t("work_item_types.settings.types.description")}</div>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-3 lg:col-span-2">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium">{t("work_item_types.settings.properties.title")}</div>
                <div className="text-xs text-tertiary">{t("work_item_types.settings.properties.description")}</div>
              </div>
              {isAdmin && selectedTypeId && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setEditingPropertyId(null);
                    setShowPropertyForm(true);
                  }}
                >
                  {t("work_item_types.settings.properties.add_button")}
                </Button>
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
                  className="flex items-center justify-between rounded-md border border-subtle-1 px-3 py-2"
                >
                  <div>
                    <div className="text-sm font-medium">
                      {prop.name}
                      {prop.is_required ? " *" : ""}
                    </div>
                    <div className="text-xs text-tertiary">{prop.property_type}</div>
                  </div>
                  {isAdmin && (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className="text-xs text-tertiary hover:text-primary"
                        onClick={() => {
                          setEditingPropertyId(prop.id);
                          setShowPropertyForm(false);
                        }}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="text-xs hover:text-danger text-tertiary"
                        onClick={() => {
                          if (!selectedTypeId) return;
                          void deleteProperty(workspaceSlug, projectId, selectedTypeId, prop.id);
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              ))}
              {!properties.length && selectedTypeId && (
                <div className="text-sm rounded-md border border-dashed border-subtle-1 p-6 text-center text-tertiary">
                  <div className="font-medium">{t("work_item_types.settings.properties.empty_state.title")}</div>
                  <div>{t("work_item_types.settings.properties.empty_state.description")}</div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
});
