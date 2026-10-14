/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { action, computed, makeObservable, observable, runInAction } from "mobx";
import type {
  IIssueTimeEntrySummary,
  ITimeEntry,
  ITimeEntryCreatePayload,
  ITimeEntryReportParams,
  ITimeEntryReportResponse,
  ITimeEntryUpdatePayload,
} from "@plane/types";
import timeEntryService from "@/services/time-entry.service";
import type { CoreRootStore } from "./root.store";

export interface ITimeEntryStore {
  loader: boolean;
  entriesByIssueId: Record<string, ITimeEntry[]>;
  totalByIssueId: Record<string, number>;
  summaryByIssueId: Record<string, IIssueTimeEntrySummary>;
  runningEntry: ITimeEntry | null;
  report: ITimeEntryReportResponse | null;
  isTimerRunning: boolean;
  getEntriesByIssueId: (issueId: string) => ITimeEntry[];
  getTotalByIssueId: (issueId: string) => number;
  fetchIssueEntries: (workspaceSlug: string, projectId: string, issueId: string) => Promise<void>;
  fetchIssueSummary: (workspaceSlug: string, projectId: string, issueId: string) => Promise<IIssueTimeEntrySummary>;
  createEntry: (
    workspaceSlug: string,
    projectId: string,
    issueId: string,
    payload: ITimeEntryCreatePayload
  ) => Promise<ITimeEntry>;
  updateEntry: (
    workspaceSlug: string,
    projectId: string,
    entryId: string,
    payload: ITimeEntryUpdatePayload
  ) => Promise<ITimeEntry>;
  deleteEntry: (workspaceSlug: string, projectId: string, issueId: string, entryId: string) => Promise<void>;
  startTimer: (workspaceSlug: string, projectId: string, issueId: string, description?: string) => Promise<ITimeEntry>;
  stopTimer: (workspaceSlug: string) => Promise<ITimeEntry | null>;
  fetchRunning: (workspaceSlug: string) => Promise<ITimeEntry | null>;
  fetchReport: (workspaceSlug: string, params: ITimeEntryReportParams) => Promise<ITimeEntryReportResponse>;
}

export class TimeEntryStore implements ITimeEntryStore {
  loader = false;
  entriesByIssueId: Record<string, ITimeEntry[]> = {};
  totalByIssueId: Record<string, number> = {};
  summaryByIssueId: Record<string, IIssueTimeEntrySummary> = {};
  runningEntry: ITimeEntry | null = null;
  report: ITimeEntryReportResponse | null = null;

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  constructor(_store: CoreRootStore) {
    makeObservable(this, {
      loader: observable.ref,
      entriesByIssueId: observable,
      totalByIssueId: observable,
      summaryByIssueId: observable,
      runningEntry: observable.ref,
      report: observable.ref,
      isTimerRunning: computed,
      fetchIssueEntries: action,
      fetchIssueSummary: action,
      createEntry: action,
      updateEntry: action,
      deleteEntry: action,
      startTimer: action,
      stopTimer: action,
      fetchRunning: action,
      fetchReport: action,
    });
  }

  get isTimerRunning(): boolean {
    return !!this.runningEntry;
  }

  getEntriesByIssueId = (issueId: string): ITimeEntry[] => this.entriesByIssueId[issueId] || [];

  getTotalByIssueId = (issueId: string): number => this.totalByIssueId[issueId] || 0;

  fetchIssueEntries = async (workspaceSlug: string, projectId: string, issueId: string) => {
    this.loader = true;
    try {
      const response = await timeEntryService.listIssueEntries(workspaceSlug, projectId, issueId);
      runInAction(() => {
        this.entriesByIssueId[issueId] = response.results;
        this.totalByIssueId[issueId] = response.total_duration;
        this.loader = false;
      });
    } catch (error) {
      runInAction(() => {
        this.loader = false;
      });
      throw error;
    }
  };

  fetchIssueSummary = async (workspaceSlug: string, projectId: string, issueId: string) => {
    const summary = await timeEntryService.getIssueSummary(workspaceSlug, projectId, issueId);
    runInAction(() => {
      this.summaryByIssueId[issueId] = summary;
      this.totalByIssueId[issueId] = summary.total_duration;
    });
    return summary;
  };

  createEntry = async (workspaceSlug: string, projectId: string, issueId: string, payload: ITimeEntryCreatePayload) => {
    const entry = await timeEntryService.createEntry(workspaceSlug, projectId, issueId, payload);
    runInAction(() => {
      const existing = this.entriesByIssueId[issueId] || [];
      this.entriesByIssueId[issueId] = [entry, ...existing];
      if (!entry.is_running) {
        this.totalByIssueId[issueId] = (this.totalByIssueId[issueId] || 0) + entry.duration;
      } else {
        this.runningEntry = entry;
      }
    });
    return entry;
  };

  updateEntry = async (workspaceSlug: string, projectId: string, entryId: string, payload: ITimeEntryUpdatePayload) => {
    const entry = await timeEntryService.updateEntry(workspaceSlug, projectId, entryId, payload);
    runInAction(() => {
      const issueId = entry.issue;
      const list = this.entriesByIssueId[issueId] || [];
      this.entriesByIssueId[issueId] = list.map((e) => (e.id === entryId ? entry : e));
      this.totalByIssueId[issueId] = (this.entriesByIssueId[issueId] || [])
        .filter((e) => !e.is_running)
        .reduce((sum, e) => sum + e.duration, 0);
      if (this.runningEntry?.id === entryId) {
        this.runningEntry = entry.is_running ? entry : null;
      }
    });
    return entry;
  };

  deleteEntry = async (workspaceSlug: string, projectId: string, issueId: string, entryId: string) => {
    await timeEntryService.deleteEntry(workspaceSlug, projectId, entryId);
    runInAction(() => {
      const list = this.entriesByIssueId[issueId] || [];
      const removed = list.find((e) => e.id === entryId);
      this.entriesByIssueId[issueId] = list.filter((e) => e.id !== entryId);
      if (removed && !removed.is_running) {
        this.totalByIssueId[issueId] = Math.max(0, (this.totalByIssueId[issueId] || 0) - removed.duration);
      }
      if (this.runningEntry?.id === entryId) {
        this.runningEntry = null;
      }
    });
  };

  startTimer = async (workspaceSlug: string, projectId: string, issueId: string, description?: string) => {
    const entry = await timeEntryService.createEntry(workspaceSlug, projectId, issueId, {
      start_timer: true,
      description: description || "",
    });
    runInAction(() => {
      // Refresh previous issue list if we stopped another timer
      if (this.runningEntry && this.runningEntry.issue !== issueId) {
        const prevIssueId = this.runningEntry.issue;
        const prevList = this.entriesByIssueId[prevIssueId];
        if (prevList) {
          const stoppedId = this.runningEntry?.id;
          this.entriesByIssueId[prevIssueId] = prevList.map((e) => {
            if (e.id !== stoppedId) return e;
            e.is_running = false;
            e.stopped_at = new Date().toISOString();
            return e;
          });
        }
      }
      const existing = this.entriesByIssueId[issueId] || [];
      this.entriesByIssueId[issueId] = [entry, ...existing.filter((e) => e.id !== entry.id)];
      this.runningEntry = entry;
    });
    return entry;
  };

  stopTimer = async (workspaceSlug: string) => {
    try {
      const entry = await timeEntryService.stopRunning(workspaceSlug);
      runInAction(() => {
        const issueId = entry.issue;
        const list = this.entriesByIssueId[issueId] || [];
        this.entriesByIssueId[issueId] = list.map((e) => (e.id === entry.id ? entry : e));
        if (!list.find((e) => e.id === entry.id)) {
          this.entriesByIssueId[issueId] = [entry, ...list];
        }
        this.totalByIssueId[issueId] = (this.totalByIssueId[issueId] || 0) + entry.duration;
        this.runningEntry = null;
      });
      return entry;
    } catch {
      runInAction(() => {
        this.runningEntry = null;
      });
      return null;
    }
  };

  fetchRunning = async (workspaceSlug: string) => {
    const entry = await timeEntryService.getRunning(workspaceSlug);
    runInAction(() => {
      this.runningEntry = entry;
    });
    return entry;
  };

  fetchReport = async (workspaceSlug: string, params: ITimeEntryReportParams) => {
    this.loader = true;
    try {
      const report = await timeEntryService.getReport(workspaceSlug, params);
      runInAction(() => {
        this.report = report;
        this.loader = false;
      });
      return report;
    } catch (error) {
      runInAction(() => {
        this.loader = false;
      });
      throw error;
    }
  };
}
