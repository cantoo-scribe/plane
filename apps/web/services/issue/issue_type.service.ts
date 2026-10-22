/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { API_BASE_URL } from "@plane/constants";
import type {
  TIssueCustomProperty,
  TIssueCustomPropertyOption,
  TIssueCustomPropertyValue,
  TIssueCustomPropertyValueWrite,
  TIssueType,
} from "@plane/types";
import { APIService } from "@/services/api.service";

export class IssueTypeService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async fetchWorkspaceIssueTypes(workspaceSlug: string): Promise<TIssueType[]> {
    const { data } = await this.get(`/api/workspaces/${workspaceSlug}/issue-types/`);
    return data;
  }

  async createWorkspaceIssueType(workspaceSlug: string, payload: Partial<TIssueType>): Promise<TIssueType> {
    const { data } = await this.post(`/api/workspaces/${workspaceSlug}/issue-types/`, payload);
    return data;
  }

  async updateWorkspaceIssueType(
    workspaceSlug: string,
    typeId: string,
    payload: Partial<TIssueType>
  ): Promise<TIssueType> {
    const { data } = await this.patch(`/api/workspaces/${workspaceSlug}/issue-types/${typeId}/`, payload);
    return data;
  }

  async deleteWorkspaceIssueType(workspaceSlug: string, typeId: string): Promise<void> {
    await this.delete(`/api/workspaces/${workspaceSlug}/issue-types/${typeId}/`);
  }

  async markWorkspaceIssueTypeAsDefault(workspaceSlug: string, typeId: string): Promise<void> {
    await this.post(`/api/workspaces/${workspaceSlug}/issue-types/${typeId}/mark-default/`);
  }

  async fetchWorkspaceProperties(workspaceSlug: string, typeId: string): Promise<TIssueCustomProperty[]> {
    const { data } = await this.get(`/api/workspaces/${workspaceSlug}/issue-types/${typeId}/properties/`);
    return data;
  }

  async createWorkspaceProperty(
    workspaceSlug: string,
    typeId: string,
    payload: Partial<TIssueCustomProperty> & { options?: Partial<TIssueCustomPropertyOption>[] }
  ): Promise<TIssueCustomProperty> {
    const { data } = await this.post(`/api/workspaces/${workspaceSlug}/issue-types/${typeId}/properties/`, payload);
    return data;
  }

  async updateWorkspaceProperty(
    workspaceSlug: string,
    typeId: string,
    propertyId: string,
    payload: Partial<TIssueCustomProperty>
  ): Promise<TIssueCustomProperty> {
    const { data } = await this.patch(
      `/api/workspaces/${workspaceSlug}/issue-types/${typeId}/properties/${propertyId}/`,
      payload
    );
    return data;
  }

  async deleteWorkspaceProperty(workspaceSlug: string, typeId: string, propertyId: string): Promise<void> {
    await this.delete(`/api/workspaces/${workspaceSlug}/issue-types/${typeId}/properties/${propertyId}/`);
  }

  async fetchProjectIssueTypes(workspaceSlug: string, projectId: string): Promise<TIssueType[]> {
    const { data } = await this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/issue-types/`);
    return data;
  }

  async createIssueType(workspaceSlug: string, projectId: string, payload: Partial<TIssueType>): Promise<TIssueType> {
    const { data } = await this.post(`/api/workspaces/${workspaceSlug}/projects/${projectId}/issue-types/`, payload);
    return data;
  }

  async updateIssueType(
    workspaceSlug: string,
    projectId: string,
    typeId: string,
    payload: Partial<TIssueType>
  ): Promise<TIssueType> {
    const { data } = await this.patch(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/issue-types/${typeId}/`,
      payload
    );
    return data;
  }

  async deleteIssueType(workspaceSlug: string, projectId: string, typeId: string): Promise<void> {
    await this.delete(`/api/workspaces/${workspaceSlug}/projects/${projectId}/issue-types/${typeId}/`);
  }

  async markAsDefault(workspaceSlug: string, projectId: string, typeId: string): Promise<void> {
    await this.post(`/api/workspaces/${workspaceSlug}/projects/${projectId}/issue-types/${typeId}/mark-default/`);
  }

  async fetchProperties(workspaceSlug: string, projectId: string, typeId: string): Promise<TIssueCustomProperty[]> {
    const { data } = await this.get(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/issue-types/${typeId}/properties/`
    );
    return data;
  }

  async createProperty(
    workspaceSlug: string,
    projectId: string,
    typeId: string,
    payload: Partial<TIssueCustomProperty> & { options?: Partial<TIssueCustomPropertyOption>[] }
  ): Promise<TIssueCustomProperty> {
    const { data } = await this.post(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/issue-types/${typeId}/properties/`,
      payload
    );
    return data;
  }

  async updateProperty(
    workspaceSlug: string,
    projectId: string,
    typeId: string,
    propertyId: string,
    payload: Partial<TIssueCustomProperty>
  ): Promise<TIssueCustomProperty> {
    const { data } = await this.patch(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/issue-types/${typeId}/properties/${propertyId}/`,
      payload
    );
    return data;
  }

  async deleteProperty(workspaceSlug: string, projectId: string, typeId: string, propertyId: string): Promise<void> {
    await this.delete(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/issue-types/${typeId}/properties/${propertyId}/`
    );
  }

  async createOption(
    workspaceSlug: string,
    projectId: string,
    typeId: string,
    propertyId: string,
    payload: Partial<TIssueCustomPropertyOption>
  ): Promise<TIssueCustomPropertyOption> {
    const { data } = await this.post(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/issue-types/${typeId}/properties/${propertyId}/options/`,
      payload
    );
    return data;
  }

  async updateOption(
    workspaceSlug: string,
    projectId: string,
    typeId: string,
    propertyId: string,
    optionId: string,
    payload: Partial<TIssueCustomPropertyOption>
  ): Promise<TIssueCustomPropertyOption> {
    const { data } = await this.patch(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/issue-types/${typeId}/properties/${propertyId}/options/${optionId}/`,
      payload
    );
    return data;
  }

  async deleteOption(
    workspaceSlug: string,
    projectId: string,
    typeId: string,
    propertyId: string,
    optionId: string
  ): Promise<void> {
    await this.delete(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/issue-types/${typeId}/properties/${propertyId}/options/${optionId}/`
    );
  }

  async fetchIssuePropertyValues(
    workspaceSlug: string,
    projectId: string,
    issueId: string
  ): Promise<TIssueCustomPropertyValue[]> {
    const { data } = await this.get(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/${issueId}/custom-properties/`
    );
    return data;
  }

  async upsertIssuePropertyValues(
    workspaceSlug: string,
    projectId: string,
    issueId: string,
    payloads: TIssueCustomPropertyValueWrite[]
  ): Promise<{ values: TIssueCustomPropertyValue[]; errors: Record<string, unknown> }> {
    const { data } = await this.post(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/${issueId}/custom-properties/`,
      payloads
    );
    return data;
  }
}
