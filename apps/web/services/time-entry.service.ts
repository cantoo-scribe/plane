/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { API_BASE_URL } from "@plane/constants";
import type {
  IIssueTimeEntrySummary,
  ITimeEntry,
  ITimeEntryCreatePayload,
  ITimeEntryListResponse,
  ITimeEntryReportParams,
  ITimeEntryReportResponse,
  ITimeEntryUpdatePayload,
} from "@plane/types";
import { APIService } from "@/services/api.service";

export class TimeEntryService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async listIssueEntries(workspaceSlug: string, projectId: string, issueId: string): Promise<ITimeEntryListResponse> {
    const { data } = await this.get(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/${issueId}/time-entries/`
    );
    return data;
  }

  async getIssueSummary(workspaceSlug: string, projectId: string, issueId: string): Promise<IIssueTimeEntrySummary> {
    const { data } = await this.get(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/${issueId}/time-entries/summary/`
    );
    return data;
  }

  async createEntry(
    workspaceSlug: string,
    projectId: string,
    issueId: string,
    payload: ITimeEntryCreatePayload
  ): Promise<ITimeEntry> {
    const { data } = await this.post(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/${issueId}/time-entries/`,
      payload
    );
    return data;
  }

  async updateEntry(
    workspaceSlug: string,
    projectId: string,
    entryId: string,
    payload: ITimeEntryUpdatePayload
  ): Promise<ITimeEntry> {
    const { data } = await this.patch(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/time-entries/${entryId}/`,
      payload
    );
    return data;
  }

  async deleteEntry(workspaceSlug: string, projectId: string, entryId: string): Promise<void> {
    await this.delete(`/api/workspaces/${workspaceSlug}/projects/${projectId}/time-entries/${entryId}/`);
  }

  async stopRunning(workspaceSlug: string): Promise<ITimeEntry> {
    const { data } = await this.post(`/api/workspaces/${workspaceSlug}/time-entries/stop/`);
    return data;
  }

  async getRunning(workspaceSlug: string): Promise<ITimeEntry | null> {
    const { data } = await this.get(`/api/workspaces/${workspaceSlug}/time-entries/running/`);
    return data ?? null;
  }

  async getReport(workspaceSlug: string, params: ITimeEntryReportParams): Promise<ITimeEntryReportResponse> {
    const { data } = await this.get(`/api/workspaces/${workspaceSlug}/time-entries/report/`, { params });
    return data;
  }
}

const timeEntryService = new TimeEntryService();

export default timeEntryService;
