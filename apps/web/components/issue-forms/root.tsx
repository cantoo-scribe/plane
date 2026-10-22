/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useMemo, useState } from "react";
import { observer } from "mobx-react";
import { Link as RouterLink } from "react-router";
import { Copy, ExternalLink, Plus, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@makeplane/propel/components/button";
import { Input } from "@makeplane/propel/components/input";
import { Switch } from "@makeplane/propel/components/switch";
import { setToast } from "@plane/blocks/toast";
import { SPACE_BASE_PATH, SPACE_BASE_URL } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import type { TIssueCustomProperty, TIssueForm, TIssueFormCoreKey, TIssueFormField } from "@plane/types";
import { ISSUE_FORM_CORE_FIELD_OPTIONS } from "@plane/types";
import { SettingsHeading } from "@/components/settings/heading";
import { useIssueType } from "@/hooks/store/use-issue-type";
import { useProject } from "@/hooks/store/use-project";
import { IssueFormService } from "@/services/issue/issue_form.service";

const formService = new IssueFormService();

type Props = {
  workspaceSlug: string;
  projectId: string;
  isAdmin: boolean;
};

const PUBLIC_PROPERTY_TYPES = new Set(["TEXT", "NUMBER", "DROPDOWN", "BOOLEAN", "DATE"]);

function publicFormUrl(anchor: string) {
  const base = `${SPACE_BASE_URL || window.location.origin}${SPACE_BASE_PATH || ""}`;
  return `${base.replace(/\/$/, "")}/forms/${anchor}`;
}

function errorMessage(error: unknown, fallback: string): string {
  if (!error || typeof error !== "object") return fallback;
  const response = "response" in error ? (error as { response?: { data?: unknown } }).response : undefined;
  const data = response?.data;
  if (!data || typeof data !== "object") return fallback;
  if ("error" in data && typeof data.error === "string") return data.error;
  if ("name" in data && typeof data.name === "string") return data.name;
  if ("issue_type_id" in data && typeof data.issue_type_id === "string") return data.issue_type_id;
  if ("detail" in data && typeof data.detail === "string") return data.detail;
  return fallback;
}

export const IssueFormsRoot = observer(function IssueFormsRoot(props: Props) {
  const { workspaceSlug, projectId, isAdmin } = props;
  const { t } = useTranslation();
  const { getProjectById, updateProject } = useProject();
  const { getProjectIssueTypes, getPropertiesForType, fetchProjectIssueTypes, fetchProperties, createIssueType } =
    useIssueType();

  const [forms, setForms] = useState<TIssueForm[]>([]);
  const [selectedFormId, setSelectedFormId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newTypeId, setNewTypeId] = useState("");
  const [busy, setBusy] = useState(false);
  const [showCreateType, setShowCreateType] = useState(false);
  const [newTypeName, setNewTypeName] = useState("");
  const [creatingType, setCreatingType] = useState(false);

  const project = getProjectById(projectId);
  const types = getProjectIssueTypes(projectId);
  const selectedForm = forms.find((f) => f.id === selectedFormId) ?? null;
  const properties = getPropertiesForType(selectedForm?.issue_type_id ?? null).filter((p) =>
    PUBLIC_PROPERTY_TYPES.has(p.property_type)
  );
  const workItemTypesHref = `/${workspaceSlug}/settings/projects/${projectId}/work-item-types`;

  const loadForms = async () => {
    setLoading(true);
    try {
      const data = await formService.list(workspaceSlug, projectId);
      setForms(data);
      setSelectedFormId((current) => {
        if (current && data.some((form) => form.id === current)) return current;
        return data[0]?.id ?? null;
      });
    } catch (error) {
      setToast({
        type: "error",
        title: "Error!",
        message: errorMessage(error, t("common.something_went_wrong")),
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setShowCreate(false);
    setNewName("");
    setNewTypeId("");
    setShowCreateType(false);
    setNewTypeName("");
    setSelectedFormId(null);
    void fetchProjectIssueTypes(workspaceSlug, projectId);
    void loadForms();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceSlug, projectId]);

  useEffect(() => {
    if (selectedForm?.issue_type_id) {
      void fetchProperties(workspaceSlug, projectId, selectedForm.issue_type_id);
    }
  }, [selectedForm?.issue_type_id, workspaceSlug, projectId, fetchProperties]);

  // Keep the type picker on a type that belongs to the current project.
  useEffect(() => {
    if (!types.length) {
      if (newTypeId) setNewTypeId("");
      return;
    }
    const stillValid = types.some((type) => type.id === newTypeId);
    if (!stillValid) {
      setNewTypeId(types.find((type) => type.is_default)?.id ?? types[0].id);
    }
  }, [types, newTypeId]);

  const usedCustomPropertyIds = useMemo(
    () =>
      new Set(
        (selectedForm?.form_fields ?? [])
          .filter((f) => f.target_kind === "CUSTOM" && f.custom_property_id)
          .map((f) => f.custom_property_id as string)
      ),
    [selectedForm?.form_fields]
  );

  const usedCoreKeys = useMemo(
    () =>
      new Set(
        (selectedForm?.form_fields ?? [])
          .filter((f) => f.target_kind === "CORE" && f.core_key)
          .map((f) => f.core_key as TIssueFormCoreKey)
      ),
    [selectedForm?.form_fields]
  );

  const handleCreateType = async () => {
    if (!isAdmin || creatingType) return;
    const name = newTypeName.trim();
    if (!name) {
      setToast({ type: "error", title: "Name required", message: "Enter a work item type name." });
      return;
    }
    setCreatingType(true);
    try {
      if (project && !project.is_issue_type_enabled) {
        await updateProject(workspaceSlug, projectId, { is_issue_type_enabled: true });
      }
      const type = await createIssueType(workspaceSlug, projectId, { name });
      setNewTypeId(type.id);
      setNewTypeName("");
      setShowCreateType(false);
      setShowCreate(true);
      setToast({ type: "success", title: "Success!", message: "Work item type created" });
    } catch (error) {
      setToast({
        type: "error",
        title: "Error!",
        message: errorMessage(error, t("common.something_went_wrong")),
      });
    } finally {
      setCreatingType(false);
    }
  };

  const handleCreate = async () => {
    if (!isAdmin || busy) return;
    const name = newName.trim();
    if (!name) {
      setToast({ type: "error", title: "Name required", message: "Enter a form name before creating." });
      return;
    }
    if (!newTypeId) {
      setToast({
        type: "error",
        title: "Type required",
        message: "Create or select a work item type for this form.",
      });
      return;
    }
    setBusy(true);
    try {
      const form = await formService.create(workspaceSlug, projectId, {
        name,
        issue_type_id: newTypeId,
      });
      setForms((prev) => [form, ...prev]);
      setSelectedFormId(form.id);
      setNewName("");
      setShowCreate(false);
      setToast({ type: "success", title: "Success!", message: "Form created" });
    } catch (error) {
      setToast({
        type: "error",
        title: "Error!",
        message: errorMessage(error, t("common.something_went_wrong")),
      });
    } finally {
      setBusy(false);
    }
  };

  const refreshForm = async (formId: string) => {
    const form = await formService.retrieve(workspaceSlug, projectId, formId);
    setForms((prev) => prev.map((f) => (f.id === formId ? form : f)));
  };

  const handleToggleActive = async (checked: boolean) => {
    if (!selectedForm || !isAdmin) return;
    try {
      const updated = await formService.update(workspaceSlug, projectId, selectedForm.id, { is_active: checked });
      setForms((prev) => prev.map((f) => (f.id === updated.id ? { ...f, ...updated } : f)));
    } catch (error) {
      setToast({
        type: "error",
        title: "Error!",
        message: errorMessage(error, t("common.something_went_wrong")),
      });
    }
  };

  const handleRenewAnchor = async () => {
    if (!selectedForm || !isAdmin) return;
    try {
      const updated = await formService.renewAnchor(workspaceSlug, projectId, selectedForm.id);
      setForms((prev) => prev.map((f) => (f.id === updated.id ? { ...f, ...updated } : f)));
      setToast({ type: "success", title: "Success!", message: "Public link renewed" });
    } catch (error) {
      setToast({
        type: "error",
        title: "Error!",
        message: errorMessage(error, t("common.something_went_wrong")),
      });
    }
  };

  const handleDelete = async () => {
    if (!selectedForm || !isAdmin) return;
    if (!window.confirm(`Delete form “${selectedForm.name}”?`)) return;
    try {
      await formService.destroy(workspaceSlug, projectId, selectedForm.id);
      setForms((prev) => prev.filter((f) => f.id !== selectedForm.id));
      setSelectedFormId(null);
      setToast({ type: "success", title: "Success!", message: "Form deleted" });
    } catch (error) {
      setToast({
        type: "error",
        title: "Error!",
        message: errorMessage(error, t("common.something_went_wrong")),
      });
    }
  };

  const handleAddCoreField = async (coreKey: TIssueFormCoreKey) => {
    if (!selectedForm || !isAdmin || usedCoreKeys.has(coreKey)) return;
    const option = ISSUE_FORM_CORE_FIELD_OPTIONS.find((o) => o.key === coreKey);
    try {
      await formService.createField(workspaceSlug, projectId, selectedForm.id, {
        label: option?.label ?? coreKey,
        target_kind: "CORE",
        core_key: coreKey,
        is_required: coreKey === "name",
        sort_order: ((selectedForm.form_fields?.length ?? 0) + 1) * 10000,
      });
      await refreshForm(selectedForm.id);
    } catch (error) {
      setToast({
        type: "error",
        title: "Error!",
        message: errorMessage(error, t("common.something_went_wrong")),
      });
    }
  };

  const handleAddCustomField = async (property: TIssueCustomProperty) => {
    if (!selectedForm || !isAdmin || usedCustomPropertyIds.has(property.id)) return;
    try {
      await formService.createField(workspaceSlug, projectId, selectedForm.id, {
        label: property.name,
        target_kind: "CUSTOM",
        custom_property_id: property.id,
        is_required: property.is_required,
        sort_order: ((selectedForm.form_fields?.length ?? 0) + 1) * 10000,
      });
      await refreshForm(selectedForm.id);
    } catch (error) {
      setToast({
        type: "error",
        title: "Error!",
        message: errorMessage(error, t("common.something_went_wrong")),
      });
    }
  };

  const handleUpdateField = async (field: TIssueFormField, patch: Partial<TIssueFormField>) => {
    if (!selectedForm || !isAdmin) return;
    try {
      await formService.updateField(workspaceSlug, projectId, selectedForm.id, field.id, patch);
      await refreshForm(selectedForm.id);
    } catch (error) {
      setToast({
        type: "error",
        title: "Error!",
        message: errorMessage(error, t("common.something_went_wrong")),
      });
    }
  };

  const handleDeleteField = async (field: TIssueFormField) => {
    if (!selectedForm || !isAdmin) return;
    try {
      await formService.destroyField(workspaceSlug, projectId, selectedForm.id, field.id);
      await refreshForm(selectedForm.id);
    } catch (error) {
      setToast({
        type: "error",
        title: "Error!",
        message: errorMessage(error, t("common.something_went_wrong")),
      });
    }
  };

  const copyLink = async () => {
    if (!selectedForm) return;
    try {
      await navigator.clipboard.writeText(publicFormUrl(selectedForm.anchor));
      setToast({ type: "success", title: "Copied!", message: "Public form link copied" });
    } catch {
      setToast({ type: "error", title: "Error!", message: t("common.something_went_wrong") });
    }
  };

  const createTypePanel = (
    <div className="space-y-2 rounded-md border border-dashed border-subtle-1 p-3">
      <p className="text-xs text-tertiary">Forms are built from a work item type and its custom properties.</p>
      <Input
        size="md"
        surface="field"
        placeholder="New work item type name"
        value={newTypeName}
        onChange={(e) => setNewTypeName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            void handleCreateType();
          }
        }}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="primary"
          size="sm"
          stretch="auto"
          type="button"
          onClick={() => void handleCreateType()}
          disabled={creatingType || !isAdmin}
          loading={creatingType}
          label="Create type"
          icon={<Plus className="size-3.5" />}
        />
        <RouterLink to={workItemTypesHref} className="text-xs text-accent-primary hover:underline">
          Manage types & properties
        </RouterLink>
      </div>
    </div>
  );

  if (loading) {
    return <div className="text-sm text-tertiary">Loading…</div>;
  }

  if (!types.length) {
    return (
      <div className="space-y-4">
        <SettingsHeading
          title={t("common.forms")}
          description="Create shareable forms that create work items from a work item type."
        />
        <p className="text-sm text-tertiary">
          This project has no work item types yet. Create one to start building forms.
        </p>
        {isAdmin ? (
          createTypePanel
        ) : (
          <RouterLink to={workItemTypesHref} className="text-sm text-accent-primary hover:underline">
            Open work item types settings
          </RouterLink>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <SettingsHeading
        title={t("common.forms")}
        description="Public forms that create work items directly in this project."
      />

      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <aside className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h6 className="text-sm font-medium">Forms</h6>
            {isAdmin && (
              <Button
                variant="secondary"
                size="sm"
                stretch="auto"
                type="button"
                onClick={() => setShowCreate((v) => !v)}
                label={showCreate ? "Cancel" : "New"}
              />
            )}
          </div>

          {showCreate && (
            <div className="space-y-3 rounded-md border border-subtle-1 p-3">
              <Input
                size="md"
                surface="field"
                placeholder="Form name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void handleCreate();
                  }
                }}
              />
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <label htmlFor="issue-form-type" className="text-xs font-medium text-secondary">
                    Work item type
                  </label>
                  <button
                    type="button"
                    className="text-xs text-accent-primary hover:underline"
                    onClick={() => setShowCreateType((v) => !v)}
                  >
                    {showCreateType ? "Hide" : "New type"}
                  </button>
                </div>
                <select
                  id="issue-form-type"
                  className="text-sm w-full rounded-md border border-subtle-1 bg-transparent px-2 py-1.5"
                  value={newTypeId}
                  onChange={(e) => setNewTypeId(e.target.value)}
                >
                  {types.map((type) => (
                    <option key={type.id} value={type.id}>
                      {type.name}
                    </option>
                  ))}
                </select>
              </div>
              {showCreateType && createTypePanel}
              <Button
                variant="primary"
                size="sm"
                stretch="auto"
                type="button"
                onClick={() => void handleCreate()}
                disabled={busy}
                loading={busy}
                label="Create"
              />
            </div>
          )}

          <ul className="space-y-1">
            {forms.map((form) => (
              <li key={form.id}>
                <button
                  type="button"
                  className={`text-sm w-full rounded-md px-2 py-1.5 text-left ${
                    selectedFormId === form.id ? "bg-surface-2 font-medium" : "hover:bg-surface-2"
                  }`}
                  onClick={() => setSelectedFormId(form.id)}
                >
                  {form.name}
                  {!form.is_active && <span className="ml-1 text-tertiary">(off)</span>}
                </button>
              </li>
            ))}
            {!forms.length && <li className="text-sm text-tertiary">No forms yet</li>}
          </ul>

          <RouterLink to={workItemTypesHref} className="text-xs inline-flex text-accent-primary hover:underline">
            Manage work item types
          </RouterLink>
        </aside>

        {selectedForm ? (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center gap-3">
              <h5 className="text-base font-semibold">{selectedForm.name}</h5>
              <div className="flex items-center gap-2">
                <span className="text-xs text-tertiary">Active</span>
                <Switch
                  size="sm"
                  checked={selectedForm.is_active}
                  onCheckedChange={handleToggleActive}
                  disabled={!isAdmin}
                />
              </div>
              <Button
                variant="secondary"
                size="sm"
                stretch="auto"
                type="button"
                onClick={() => void copyLink()}
                label="Copy link"
                icon={<Copy className="size-3.5" />}
              />
              <a
                href={publicFormUrl(selectedForm.anchor)}
                target="_blank"
                rel="noreferrer"
                className="text-sm inline-flex items-center gap-1 text-accent-primary"
              >
                Open <ExternalLink className="size-3.5" />
              </a>
              {isAdmin && (
                <>
                  <Button
                    variant="secondary"
                    size="sm"
                    stretch="auto"
                    type="button"
                    onClick={() => void handleRenewAnchor()}
                    label="Renew link"
                    icon={<RefreshCw className="size-3.5" />}
                  />
                  <Button
                    variant="secondary"
                    size="sm"
                    stretch="auto"
                    type="button"
                    onClick={() => void handleDelete()}
                    label="Delete"
                    icon={<Trash2 className="size-3.5" />}
                  />
                </>
              )}
            </div>

            <p className="text-xs rounded-md bg-surface-2 px-3 py-2 break-all text-tertiary">
              {publicFormUrl(selectedForm.anchor)}
            </p>

            <section className="space-y-3">
              <h6 className="text-sm font-medium">Fields</h6>
              <ul className="space-y-2">
                {(selectedForm.form_fields ?? [])
                  .slice()
                  .toSorted((a, b) => a.sort_order - b.sort_order)
                  .map((field) => (
                    <li
                      key={field.id}
                      className="flex flex-wrap items-center gap-3 rounded-md border border-subtle-1 px-3 py-2"
                    >
                      <Input
                        key={`${field.id}-${field.label}`}
                        size="md"
                        surface="field"
                        className="max-w-xs"
                        defaultValue={field.label}
                        disabled={!isAdmin}
                        onBlur={(e) => {
                          const next = e.target.value.trim();
                          if (next && next !== field.label) {
                            void handleUpdateField(field, { label: next });
                          }
                        }}
                      />
                      <span className="text-xs text-tertiary">
                        {field.target_kind === "CORE"
                          ? `Core · ${field.core_key}`
                          : `Custom · ${field.custom_property?.name ?? field.custom_property_id}`}
                      </span>
                      <label className="text-xs flex items-center gap-1">
                        <input
                          type="checkbox"
                          checked={field.is_required}
                          disabled={!isAdmin}
                          onChange={(e) => void handleUpdateField(field, { is_required: e.target.checked })}
                        />
                        Required
                      </label>
                      {isAdmin && (
                        <button
                          type="button"
                          className="text-xs ml-auto text-danger-primary"
                          onClick={() => void handleDeleteField(field)}
                        >
                          Remove
                        </button>
                      )}
                    </li>
                  ))}
              </ul>
            </section>

            {isAdmin && (
              <section className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <h6 className="text-sm font-medium">Add core field</h6>
                  <div className="flex flex-wrap gap-2">
                    {ISSUE_FORM_CORE_FIELD_OPTIONS.map((option) => (
                      <Button
                        key={option.key}
                        variant="secondary"
                        size="sm"
                        stretch="auto"
                        type="button"
                        disabled={usedCoreKeys.has(option.key)}
                        onClick={() => void handleAddCoreField(option.key)}
                        label={option.label}
                      />
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <h6 className="text-sm font-medium">Add custom property</h6>
                  <div className="flex flex-wrap gap-2">
                    {properties.map((property) => (
                      <Button
                        key={property.id}
                        variant="secondary"
                        size="sm"
                        stretch="auto"
                        type="button"
                        disabled={usedCustomPropertyIds.has(property.id)}
                        onClick={() => void handleAddCustomField(property)}
                        label={property.name}
                      />
                    ))}
                    {!properties.length && (
                      <p className="text-xs text-tertiary">
                        No compatible custom properties on this type.{" "}
                        <RouterLink to={workItemTypesHref} className="text-accent-primary hover:underline">
                          Add properties
                        </RouterLink>
                      </p>
                    )}
                  </div>
                </div>
              </section>
            )}

            <section className="space-y-3 rounded-md border border-subtle-1 p-4">
              <h6 className="text-sm font-medium">Preview</h6>
              <div className="space-y-3">
                {(selectedForm.form_fields ?? [])
                  .slice()
                  .toSorted((a, b) => a.sort_order - b.sort_order)
                  .map((field) => (
                    <div key={field.id} className="space-y-1">
                      <label className="text-sm font-medium">
                        {field.label}
                        {field.is_required && <span className="text-danger-primary"> *</span>}
                      </label>
                      {field.help_text && <p className="text-xs text-tertiary">{field.help_text}</p>}
                      <Input size="md" surface="field" disabled placeholder={field.label} className="w-full" />
                    </div>
                  ))}
              </div>
            </section>
          </div>
        ) : (
          <p className="text-sm text-tertiary">Select or create a form to configure it.</p>
        )}
      </div>
    </div>
  );
});
