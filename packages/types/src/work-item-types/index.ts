/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TLogoProps } from "../common";

export type TIssueCustomPropertyType = "TEXT" | "NUMBER" | "DROPDOWN" | "BOOLEAN" | "DATE" | "MEMBER" | "FORMULA";

export type TIssueCustomPropertySettings = {
  is_multi_line?: boolean;
  is_multi_select?: boolean;
  formula?: string;
  readonly?: boolean;
};

export type TIssueCustomPropertyOption = {
  id: string;
  workspace_id: string;
  property_id: string;
  name: string;
  description?: string;
  sort_order: number;
  is_active: boolean;
  logo_props?: TLogoProps;
  is_default: boolean;
};

export type TIssueCustomProperty = {
  id: string;
  workspace_id: string;
  issue_type_id: string;
  name: string;
  description?: string;
  property_type: TIssueCustomPropertyType;
  is_required: boolean;
  is_active: boolean;
  settings: TIssueCustomPropertySettings;
  default_value?: unknown;
  sort_order: number;
  logo_props?: TLogoProps;
  options?: TIssueCustomPropertyOption[];
};

export type TIssueType = {
  id: string;
  workspace_id: string;
  name: string;
  description?: string;
  logo_props?: TLogoProps;
  is_epic: boolean;
  is_default: boolean;
  is_active: boolean;
  level: number;
  project_ids?: string[];
};

export type TIssueCustomPropertyValue = {
  id: string;
  workspace_id: string;
  project_id: string;
  issue_id: string;
  property_id: string;
  value_text?: string | null;
  value_number?: number | null;
  value_boolean?: boolean | null;
  value_datetime?: string | null;
  value_option_ids?: string[];
  value_member_ids?: string[];
};

export type TIssueCustomPropertyValueWrite = {
  property_id: string;
  value_text?: string | null;
  value_number?: number | null;
  value_boolean?: boolean | null;
  value_datetime?: string | null;
  value_option_ids?: string[];
  value_member_ids?: string[];
};
