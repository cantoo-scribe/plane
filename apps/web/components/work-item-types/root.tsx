/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useMemo, useState } from "react";
import { observer } from "mobx-react";
import Link from "next/link";
import { SquareDashed } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import type { TIssueType } from "@plane/types";
import { Button } from "@makeplane/propel/components/button";
import { Input } from "@makeplane/propel/components/input";
import { Switch } from "@makeplane/propel/components/switch";
import { setToast } from "@plane/blocks/toast";
import { SettingsBoxedControlItem } from "@/components/settings/boxed-control-item";
import { SettingsHeading } from "@/components/settings/heading";
import { useIssueType } from "@/hooks/store/use-issue-type";
import { useProject } from "@/hooks/store/use-project";
import { useWorkspace } from "@/hooks/store/use-workspace";
import { CustomPropertyForm } from "./property-form";

type ProjectProps = {
  scope: "project";
  workspaceSlug: string;
  projectId: string;
  isAdmin: boolean;
};

type WorkspaceProps = {
  scope: "workspace";
  workspaceSlug: string;
  isAdmin: boolean;
};

type Props = ProjectProps | WorkspaceProps;

export const WorkItemTypesRoot = observer(function WorkItemTypesRoot(props: Props) {
  const { workspaceSlug, isAdmin, scope } = props;
  const projectId = scope === "project" ? props.projectId : undefined;
  const { t } = useTranslation();
  const { getProjectById, updateProject, workspaceProjectIds } = useProject();
  const { currentWorkspace } = useWorkspace();
  const {
    getProjectIssueTypes,
    getWorkspaceIssueTypes,
    getPropertiesForType,
    fetchProjectIssueTypes,
    fetchWorkspaceIssueTypes,
    fetchProperties,
    fetchWorkspaceProperties,
    createIssueType,
    createWorkspaceIssueType,
    deleteIssueType,
    deleteWorkspaceIssueType,
    markAsDefault,
    markWorkspaceIssueTypeAsDefault,
    makeWorkspaceIssueTypeGlobal,
    deleteProperty,
    deleteWorkspaceProperty,
  } = useIssueType();

  const project = projectId ? getProjectById(projectId) : undefined;
  const issueTypeSource = project?.issue_type_source ?? "WORKSPACE";
  const usesWorkspaceConfig = scope === "project" && issueTypeSource === "WORKSPACE";
  const isEditable = scope === "workspace" || (scope === "project" && issueTypeSource === "CUSTOM");

  const types = scope === "workspace" ? getWorkspaceIssueTypes(currentWorkspace?.id) : getProjectIssueTypes(projectId);

  const typeGroups = useMemo(() => {
    if (scope !== "workspace") {
      return [{ key: "project", label: null as string | null, types }];
    }
    const globalTypes = types.filter((type) => !type.project_ids?.length);
    const projectIds = new Set<string>();
    types.forEach((type) => {
      (type.project_ids ?? []).forEach((id) => projectIds.add(id));
    });
    const orderedProjectIds = (workspaceProjectIds || []).filter((id) => projectIds.has(id));
    // Include any orphan project ids not in the current member list
    projectIds.forEach((id) => {
      if (!orderedProjectIds.includes(id)) orderedProjectIds.push(id);
    });
    const groups: { key: string; label: string | null; types: TIssueType[] }[] = [
      {
        key: "global",
        label: t("work_item_types.settings.types.group_all_projects"),
        types: globalTypes,
      },
    ];
    orderedProjectIds.forEach((id) => {
      const projectMeta = getProjectById(id);
      const projectTypes = types.filter((type) => type.project_ids?.includes(id));
      if (!projectTypes.length) return;
      groups.push({
        key: id,
        label: projectMeta?.name ?? id,
        types: projectTypes,
      });
    });
    return groups;
  }, [scope, types, workspaceProjectIds, getProjectById, t]);

  const [selectedTypeId, setSelectedTypeId] = useState<string | null>(null);
  const [showTypeForm, setShowTypeForm] = useState(false);
  const [newTypeName, setNewTypeName] = useState("");
  const [showPropertyForm, setShowPropertyForm] = useState(false);
  const [editingPropertyId, setEditingPropertyId] = useState<string | null>(null);
  const [isToggling, setIsToggling] = useState(false);
  const [isUpdatingSource, setIsUpdatingSource] = useState(false);

  useEffect(() => {
    if (!workspaceSlug) return;
    if (scope === "workspace") {
      void fetchWorkspaceIssueTypes(workspaceSlug);
      return;
    }
    if (projectId) void fetchProjectIssueTypes(workspaceSlug, projectId);
  }, [workspaceSlug, projectId, scope, fetchProjectIssueTypes, fetchWorkspaceIssueTypes]);

  useEffect(() => {
    if (types.length && !selectedTypeId) {
      setSelectedTypeId(types.find((issueType) => issueType.is_default)?.id ?? types[0].id);
    }
  }, [types, selectedTypeId]);

  useEffect(() => {
    if (!workspaceSlug || !selectedTypeId) return;
    if (scope === "workspace" || usesWorkspaceConfig) {
      void fetchWorkspaceProperties(workspaceSlug, selectedTypeId);
      return;
    }
    if (projectId) void fetchProperties(workspaceSlug, projectId, selectedTypeId);
  }, [workspaceSlug, projectId, selectedTypeId, scope, usesWorkspaceConfig, fetchProperties, fetchWorkspaceProperties]);

  const properties = getPropertiesForType(selectedTypeId);
  const editingProperty = editingPropertyId ? properties.find((p) => p.id === editingPropertyId) : undefined;
  const selectedType = selectedTypeId ? types.find((type) => type.id === selectedTypeId) : undefined;

  const handleEnableTypes = async (checked: boolean) => {
    if (!project || !projectId || !isAdmin || isToggling) return;
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

  const handleSourceChange = async (source: "WORKSPACE" | "CUSTOM") => {
    if (!project || !projectId || !isAdmin || isUpdatingSource || source === issueTypeSource) return;
    setIsUpdatingSource(true);
    try {
      await updateProject(workspaceSlug, projectId, { issue_type_source: source });
      setSelectedTypeId(null);
      setShowTypeForm(false);
      setShowPropertyForm(false);
      setEditingPropertyId(null);
      await fetchProjectIssueTypes(workspaceSlug, projectId);
    } catch {
      setToast({
        type: "error",
        title: "Error!",
        message: t("common.something_went_wrong"),
      });
    } finally {
      setIsUpdatingSource(false);
    }
  };

  const handleCreateType = async () => {
    if (!newTypeName.trim()) return;
    try {
      const type =
        scope === "workspace"
          ? await createWorkspaceIssueType(workspaceSlug, { name: newTypeName.trim() })
          : await createIssueType(workspaceSlug, projectId!, { name: newTypeName.trim() });
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

  const handleMarkDefault = async (typeId: string) => {
    if (scope === "workspace") {
      await markWorkspaceIssueTypeAsDefault(workspaceSlug, typeId);
      return;
    }
    await markAsDefault(workspaceSlug, projectId!, typeId);
  };

  const handleDeleteType = async (typeId: string) => {
    if (scope === "workspace") {
      await deleteWorkspaceIssueType(workspaceSlug, typeId);
    } else {
      await deleteIssueType(workspaceSlug, projectId!, typeId);
    }
    if (selectedTypeId === typeId) setSelectedTypeId(null);
  };

  const handleMakeGlobal = async (typeId: string) => {
    if (scope !== "workspace" || !isAdmin) return;
    try {
      await makeWorkspaceIssueTypeGlobal(workspaceSlug, typeId);
      setToast({
        type: "success",
        title: "Success!",
        message: t("work_item_types.settings.types.make_global_success"),
      });
    } catch {
      setToast({
        type: "error",
        title: "Error!",
        message: t("common.something_went_wrong"),
      });
    }
  };

  const handleDeleteProperty = async (propertyId: string) => {
    if (!selectedTypeId) return;
    if (scope === "workspace") {
      await deleteWorkspaceProperty(workspaceSlug, selectedTypeId, propertyId);
      return;
    }
    await deleteProperty(workspaceSlug, projectId!, selectedTypeId, propertyId);
  };

  const showCatalog = scope === "workspace" || Boolean(project?.is_issue_type_enabled);

  return (
    <div className="flex flex-col gap-6">
      <SettingsHeading
        title={t("work_item_types.label")}
        description={
          scope === "workspace"
            ? t("work_item_types.settings.workspace.description")
            : t("work_item_types.settings.description")
        }
      />

      {scope === "project" && (
        <>
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
            <div className="flex flex-col gap-3 rounded-lg border border-subtle bg-layer-2 p-4">
              <div className="text-body-sm-medium text-primary">{t("work_item_types.settings.source.title")}</div>
              <div
                className="flex flex-col gap-2"
                role="radiogroup"
                aria-label={t("work_item_types.settings.source.title")}
              >
                <button
                  type="button"
                  role="radio"
                  aria-checked={issueTypeSource === "WORKSPACE"}
                  disabled={!isAdmin || isUpdatingSource}
                  className="flex cursor-pointer items-start gap-3 rounded-md border border-subtle px-3 py-2.5 text-left disabled:cursor-not-allowed disabled:opacity-60"
                  onClick={() => void handleSourceChange("WORKSPACE")}
                >
                  <span
                    className={`mt-1 size-3.5 shrink-0 rounded-full border ${
                      issueTypeSource === "WORKSPACE" ? "bg-accent-strong border-accent-strong" : "border-subtle"
                    }`}
                    aria-hidden="true"
                  />
                  <span>
                    <span className="block text-body-sm-medium text-primary">
                      {t("work_item_types.settings.source.workspace.label")}
                    </span>
                    <span className="block text-caption-md-regular text-tertiary">
                      {t("work_item_types.settings.source.workspace.description")}
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={issueTypeSource === "CUSTOM"}
                  disabled={!isAdmin || isUpdatingSource}
                  className="flex cursor-pointer items-start gap-3 rounded-md border border-subtle px-3 py-2.5 text-left disabled:cursor-not-allowed disabled:opacity-60"
                  onClick={() => void handleSourceChange("CUSTOM")}
                >
                  <span
                    className={`mt-1 size-3.5 shrink-0 rounded-full border ${
                      issueTypeSource === "CUSTOM" ? "bg-accent-strong border-accent-strong" : "border-subtle"
                    }`}
                    aria-hidden="true"
                  />
                  <span>
                    <span className="block text-body-sm-medium text-primary">
                      {t("work_item_types.settings.source.custom.label")}
                    </span>
                    <span className="block text-caption-md-regular text-tertiary">
                      {t("work_item_types.settings.source.custom.description")}
                    </span>
                  </span>
                </button>
              </div>
              {usesWorkspaceConfig && (
                <p className="text-caption-md-regular text-tertiary">
                  {t("work_item_types.settings.source.workspace.manage_hint")}{" "}
                  <Link
                    href={`/${workspaceSlug}/settings/work-item-types/`}
                    className="text-accent-primary hover:underline"
                  >
                    {t("work_item_types.settings.source.workspace.manage_link")}
                  </Link>
                </p>
              )}
            </div>
          )}
        </>
      )}

      {showCatalog && (
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
          <div className="flex flex-col gap-4 lg:col-span-4">
            <div className="flex items-center justify-between gap-3">
              <SettingsHeading title={t("work_item_types.settings.types.title")} variant="h6" />
              {isAdmin && isEditable && !showTypeForm && (
                <Button
                  variant="secondary"
                  size="sm"
                  stretch="auto"
                  onClick={() => setShowTypeForm(true)}
                  label={t("work_item_types.create.button")}
                />
              )}
            </div>

            {showTypeForm && isEditable && (
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

            <div className="flex flex-col gap-4">
              {typeGroups.map((group) => (
                <div key={group.key} className="flex flex-col gap-1">
                  {group.label && (
                    <div className="px-1 pb-1 text-caption-md-medium tracking-wide text-tertiary uppercase">
                      {group.label}
                    </div>
                  )}
                  {group.types.map((type) => {
                    const isProjectSpecific = Boolean(type.project_ids?.length);
                    const showMakeGlobal = scope === "workspace" && isProjectSpecific;
                    const showSetDefault = !type.is_default && (scope === "project" || !isProjectSpecific);
                    return (
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
                            <span className="ml-1.5 text-caption-md-regular text-tertiary">
                              ({t("common.default")})
                            </span>
                          ) : null}
                        </span>
                        {isAdmin && isEditable && (
                          <span className="flex shrink-0 items-center gap-2">
                            {showMakeGlobal && (
                              <button
                                type="button"
                                className="rounded p-1 text-tertiary hover:bg-layer-1 hover:text-primary"
                                title={t("work_item_types.settings.types.make_global")}
                                aria-label={t("work_item_types.settings.types.make_global")}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void handleMakeGlobal(type.id);
                                }}
                              >
                                <SquareDashed className="size-3.5" />
                              </button>
                            )}
                            {showSetDefault && (
                              <button
                                type="button"
                                className="text-caption-md-regular text-tertiary hover:text-primary"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void handleMarkDefault(type.id);
                                }}
                              >
                                {t("work_item_types.settings.set_as_default")}
                              </button>
                            )}
                            {!type.is_default && (
                              <button
                                type="button"
                                className="text-caption-md-regular text-tertiary hover:text-danger-primary"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void handleDeleteType(type.id);
                                }}
                              >
                                {t("common.delete")}
                              </button>
                            )}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
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
              {isAdmin && isEditable && selectedTypeId && !showPropertyForm && !editingProperty && (
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

            {(showPropertyForm || editingProperty) && selectedTypeId && isEditable && (
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
                  {isAdmin && isEditable && (
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
                        onClick={() => void handleDeleteProperty(prop.id)}
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
                  {isAdmin && isEditable && (
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
