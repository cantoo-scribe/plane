/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { action, makeObservable, observable, computed, runInAction } from "mobx";
import { computedFn } from "mobx-utils";
import type { IWorkspaceAutomation, TWorkspaceAutomationForm } from "@plane/types";
import { WorkspaceAutomationService } from "@/services/workspace-automation.service";
import type { CoreRootStore } from "../root.store";

export interface IWorkspaceAutomationStore {
  automations: Record<string, IWorkspaceAutomation> | null;
  currentAutomation: IWorkspaceAutomation | null;
  getAutomationById: (automationId: string) => IWorkspaceAutomation | null;
  fetchAutomations: (workspaceSlug: string) => Promise<IWorkspaceAutomation[]>;
  fetchAutomationById: (workspaceSlug: string, automationId: string) => Promise<IWorkspaceAutomation>;
  createAutomation: (workspaceSlug: string, data: TWorkspaceAutomationForm) => Promise<IWorkspaceAutomation>;
  updateAutomation: (
    workspaceSlug: string,
    automationId: string,
    data: TWorkspaceAutomationForm
  ) => Promise<IWorkspaceAutomation>;
  removeAutomation: (workspaceSlug: string, automationId: string) => Promise<void>;
}

export class WorkspaceAutomationStore implements IWorkspaceAutomationStore {
  automations: Record<string, IWorkspaceAutomation> | null = null;
  automationService;
  rootStore;

  constructor(_rootStore: CoreRootStore) {
    makeObservable(this, {
      automations: observable,
      currentAutomation: computed,
      fetchAutomations: action,
      fetchAutomationById: action,
      createAutomation: action,
      updateAutomation: action,
      removeAutomation: action,
    });

    this.automationService = new WorkspaceAutomationService();
    this.rootStore = _rootStore;
  }

  get currentAutomation() {
    const automationId = this.rootStore.router.automationId;
    if (!automationId) return null;
    return this.automations?.[automationId] ?? null;
  }

  getAutomationById = computedFn((automationId: string) => this.automations?.[automationId] || null);

  fetchAutomations = async (workspaceSlug: string) =>
    await this.automationService.fetchAutomations(workspaceSlug).then((response) => {
      const automationMap: Record<string, IWorkspaceAutomation> = {};
      for (const currentAutomation of response) {
        if (currentAutomation?.id) {
          automationMap[currentAutomation.id] = currentAutomation;
        }
      }
      runInAction(() => {
        this.automations = automationMap;
      });
      return response;
    });

  fetchAutomationById = async (workspaceSlug: string, automationId: string) =>
    await this.automationService.fetchAutomation(workspaceSlug, automationId).then((response) => {
      runInAction(() => {
        this.automations = {
          ...this.automations,
          [response.id]: response,
        };
      });
      return response;
    });

  createAutomation = async (workspaceSlug: string, data: TWorkspaceAutomationForm) =>
    await this.automationService.createAutomation(workspaceSlug, data).then((response) => {
      runInAction(() => {
        this.automations = {
          ...this.automations,
          [response.id]: response,
        };
      });
      return response;
    });

  updateAutomation = async (workspaceSlug: string, automationId: string, data: TWorkspaceAutomationForm) =>
    await this.automationService.updateAutomation(workspaceSlug, automationId, data).then((response) => {
      runInAction(() => {
        this.automations = {
          ...this.automations,
          [automationId]: response,
        };
      });
      return response;
    });

  removeAutomation = async (workspaceSlug: string, automationId: string) =>
    await this.automationService.deleteAutomation(workspaceSlug, automationId).then(() => {
      const next = { ...this.automations };
      delete next[automationId];
      runInAction(() => {
        this.automations = next;
      });
      return automationId;
    });
}
