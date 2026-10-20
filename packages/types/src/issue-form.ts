/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TLogoProps } from "./common";
import type { TIssueCustomProperty, TIssueCustomPropertyOption, TIssueCustomPropertySettings } from "./work-item-types";

export type TIssueFormTargetKind = "CORE" | "CUSTOM";

export type TIssueFormCoreKey = "name" | "description_html" | "priority" | "label_ids";

export type TIssueFormField = {
  id: string;
  workspace_id: string;
  project_id: string;
  form_id: string;
  sort_order: number;
  label: string;
  help_text?: string;
  is_required: boolean;
  is_visible: boolean;
  target_kind: TIssueFormTargetKind;
  core_key?: TIssueFormCoreKey | null;
  custom_property_id?: string | null;
  custom_property?: TIssueCustomProperty | null;
};

export type TIssueForm = {
  id: string;
  workspace_id: string;
  project_id: string;
  issue_type_id: string;
  name: string;
  description?: string;
  logo_props?: TLogoProps;
  is_active: boolean;
  anchor: string;
  target_state_id?: string | null;
  form_fields?: TIssueFormField[];
  public_url_path?: string;
};

export type TIssueFormPublicField = {
  id: string;
  sort_order: number;
  label: string;
  help_text?: string;
  is_required: boolean;
  target_kind: TIssueFormTargetKind;
  core_key?: TIssueFormCoreKey | null;
  custom_property_id?: string | null;
  property_type?: string | null;
  settings?: TIssueCustomPropertySettings | null;
  options?: TIssueCustomPropertyOption[];
};

export type TIssueFormPublic = {
  id: string;
  name: string;
  description?: string;
  logo_props?: TLogoProps;
  issue_type_id: string;
  fields: TIssueFormPublicField[];
};

export type TIssueFormSubmitResult = {
  id: string;
  sequence_id: number;
  name: string;
  project_identifier: string;
};

export const ISSUE_FORM_CORE_FIELD_OPTIONS: { key: TIssueFormCoreKey; label: string }[] = [
  { key: "name", label: "Title" },
  { key: "description_html", label: "Description" },
  { key: "priority", label: "Priority" },
  { key: "label_ids", label: "Labels" },
];
