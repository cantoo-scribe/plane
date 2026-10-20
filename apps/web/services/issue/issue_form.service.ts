/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { API_BASE_URL } from "@plane/constants";
import type { TIssueForm, TIssueFormField } from "@plane/types";
import { APIService } from "@/services/api.service";

export class IssueFormService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async list(workspaceSlug: string, projectId: string): Promise<TIssueForm[]> {
    const { data } = await this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/forms/`);
    return data;
  }

  async retrieve(workspaceSlug: string, projectId: string, formId: string): Promise<TIssueForm> {
    const { data } = await this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/forms/${formId}/`);
    return data;
  }

  async create(workspaceSlug: string, projectId: string, payload: Partial<TIssueForm>): Promise<TIssueForm> {
    const { data } = await this.post(`/api/workspaces/${workspaceSlug}/projects/${projectId}/forms/`, payload);
    return data;
  }

  async update(
    workspaceSlug: string,
    projectId: string,
    formId: string,
    payload: Partial<TIssueForm>
  ): Promise<TIssueForm> {
    const { data } = await this.patch(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/forms/${formId}/`,
      payload
    );
    return data;
  }

  async destroy(workspaceSlug: string, projectId: string, formId: string): Promise<void> {
    await this.delete(`/api/workspaces/${workspaceSlug}/projects/${projectId}/forms/${formId}/`);
  }

  async renewAnchor(workspaceSlug: string, projectId: string, formId: string): Promise<TIssueForm> {
    const { data } = await this.post(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/forms/${formId}/renew-anchor/`
    );
    return data;
  }

  async createField(
    workspaceSlug: string,
    projectId: string,
    formId: string,
    payload: Partial<TIssueFormField>
  ): Promise<TIssueFormField> {
    const { data } = await this.post(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/forms/${formId}/fields/`,
      payload
    );
    return data;
  }

  async updateField(
    workspaceSlug: string,
    projectId: string,
    formId: string,
    fieldId: string,
    payload: Partial<TIssueFormField>
  ): Promise<TIssueFormField> {
    const { data } = await this.patch(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/forms/${formId}/fields/${fieldId}/`,
      payload
    );
    return data;
  }

  async destroyField(workspaceSlug: string, projectId: string, formId: string, fieldId: string): Promise<void> {
    await this.delete(`/api/workspaces/${workspaceSlug}/projects/${projectId}/forms/${formId}/fields/${fieldId}/`);
  }
}
