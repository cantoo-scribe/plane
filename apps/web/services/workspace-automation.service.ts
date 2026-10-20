/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { API_BASE_URL } from "@plane/constants";
import type { IWorkspaceAutomation, IWorkspaceAutomationRun, TWorkspaceAutomationForm } from "@plane/types";
import { APIService } from "@/services/api.service";

export class WorkspaceAutomationService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async fetchAutomations(workspaceSlug: string): Promise<IWorkspaceAutomation[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/automations/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async fetchAutomation(workspaceSlug: string, automationId: string): Promise<IWorkspaceAutomation> {
    return this.get(`/api/workspaces/${workspaceSlug}/automations/${automationId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async createAutomation(workspaceSlug: string, data: TWorkspaceAutomationForm): Promise<IWorkspaceAutomation> {
    return this.post(`/api/workspaces/${workspaceSlug}/automations/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async updateAutomation(
    workspaceSlug: string,
    automationId: string,
    data: TWorkspaceAutomationForm
  ): Promise<IWorkspaceAutomation> {
    return this.patch(`/api/workspaces/${workspaceSlug}/automations/${automationId}/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async deleteAutomation(workspaceSlug: string, automationId: string): Promise<void> {
    return this.delete(`/api/workspaces/${workspaceSlug}/automations/${automationId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async fetchAutomationRuns(workspaceSlug: string, automationId: string): Promise<IWorkspaceAutomationRun[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/automations/${automationId}/runs/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}
