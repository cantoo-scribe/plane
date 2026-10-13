/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

export type TTimeEntryGroupBy = "user" | "project" | "issue" | "day" | "user_project";

export interface ITimeEntryIssueDetail {
  id: string;
  name: string;
  sequence_id: number;
  project_id: string;
}

export interface ITimeEntryProjectDetail {
  id: string;
  name: string;
  identifier: string;
}

export interface ITimeEntryUserDetail {
  id: string;
  display_name: string;
  email: string;
  first_name: string;
  last_name: string;
  avatar_url?: string | null;
}

export interface ITimeEntry {
  id: string;
  workspace: string;
  project: string;
  issue: string;
  logged_by: string;
  description: string;
  started_at: string;
  stopped_at: string | null;
  duration: number;
  is_running: boolean;
  created_at: string;
  updated_at: string;
  issue_detail?: ITimeEntryIssueDetail | null;
  project_detail?: ITimeEntryProjectDetail | null;
  logged_by_detail?: ITimeEntryUserDetail | null;
}

export interface ITimeEntryListResponse {
  results: ITimeEntry[];
  total_duration: number;
}

export interface ITimeEntryCreatePayload {
  description?: string;
  duration?: number;
  started_at?: string;
  stopped_at?: string;
  start_timer?: boolean;
}

export interface ITimeEntryUpdatePayload {
  description?: string;
  duration?: number;
  started_at?: string;
  stopped_at?: string | null;
}

export interface IIssueTimeEntrySummary {
  issue_id: string;
  total_duration: number;
  estimated_duration: number | null;
  estimate_type: string | null;
}

export interface ITimeEntryReportAggregate {
  group_id: string;
  group_by: TTimeEntryGroupBy;
  total_duration: number;
  entry_count: number;
  name?: string;
  identifier?: string;
  sequence_id?: number;
  project_id?: string;
  project_identifier?: string;
  user_id?: string;
  project_name?: string;
}

export interface ITimeEntryReportParams {
  start_date?: string;
  end_date?: string;
  project_ids?: string;
  user_ids?: string;
  group_by?: TTimeEntryGroupBy;
  cycle_id?: string;
  include_entries?: boolean;
}

export interface ITimeEntryReportResponse {
  aggregates: ITimeEntryReportAggregate[];
  total_duration: number;
  group_by: TTimeEntryGroupBy;
  entries?: ITimeEntry[];
}
