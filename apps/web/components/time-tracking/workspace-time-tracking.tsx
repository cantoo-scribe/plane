/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { observer } from "mobx-react";
import { Button } from "@makeplane/propel/components/button";
import { useTranslation } from "@plane/i18n";
import type { ITimeEntryReportAggregate, TTimeEntryGroupBy } from "@plane/types";
import { convertMinutesToHoursMinutesString } from "@plane/utils";
import { useMember } from "@/hooks/store/use-member";
import { useProject } from "@/hooks/store/use-project";
import { useTimeEntry } from "@/hooks/store/use-time-entry";
import { useWorkspace } from "@/hooks/store/use-workspace";

type PeriodPreset = "day" | "month" | "custom";

function formatCsvDuration(minutes: number): string {
  return convertMinutesToHoursMinutesString(minutes).trim() || "0m";
}

function toDateInputValue(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function startOfMonth(date = new Date()): string {
  return toDateInputValue(new Date(date.getFullYear(), date.getMonth(), 1));
}

function endOfMonth(date = new Date()): string {
  return toDateInputValue(new Date(date.getFullYear(), date.getMonth() + 1, 0));
}

function downloadCsv(filename: string, rows: string[][]) {
  const content = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export const WorkspaceTimeTracking = observer(function WorkspaceTimeTracking() {
  const { t } = useTranslation();
  const { currentWorkspace } = useWorkspace();
  const { workspaceProjectIds, getProjectById } = useProject();
  const {
    workspace: { workspaceMemberIds, getWorkspaceMemberDetails },
  } = useMember();
  const { fetchReport, report, loader } = useTimeEntry();

  const workspaceSlug = currentWorkspace?.slug || "";

  const [preset, setPreset] = useState<PeriodPreset>("month");
  const [startDate, setStartDate] = useState(startOfMonth());
  const [endDate, setEndDate] = useState(endOfMonth());
  const [projectId, setProjectId] = useState<string>("");
  const [userId, setUserId] = useState<string>("");
  const [groupBy, setGroupBy] = useState<TTimeEntryGroupBy>("user");
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  const applyPreset = useCallback((next: PeriodPreset) => {
    setPreset(next);
    const today = new Date();
    if (next === "day") {
      const d = toDateInputValue(today);
      setStartDate(d);
      setEndDate(d);
    } else if (next === "month") {
      setStartDate(startOfMonth(today));
      setEndDate(endOfMonth(today));
    }
  }, []);

  const loadReport = useCallback(async () => {
    if (!workspaceSlug) return;
    await fetchReport(workspaceSlug, {
      start_date: startDate,
      end_date: endDate,
      project_ids: projectId || undefined,
      user_ids: userId || selectedUserId || undefined,
      group_by: selectedUserId ? "issue" : groupBy,
      include_entries: true,
    });
  }, [workspaceSlug, startDate, endDate, projectId, userId, selectedUserId, groupBy, fetchReport]);

  useEffect(() => {
    void loadReport();
  }, [loadReport]);

  const aggregates = report?.aggregates || [];
  const totalDuration = report?.total_duration || 0;

  const resolveUserName = (id: string) => {
    const member = getWorkspaceMemberDetails(id);
    return member?.member?.display_name || member?.member?.email || id;
  };

  const resolveLabel = (row: ITimeEntryReportAggregate) => {
    if (row.group_by === "user") return resolveUserName(row.group_id);
    if (row.group_by === "project") return `${row.identifier} — ${row.name}`;
    if (row.group_by === "issue") return `${row.project_identifier}-${row.sequence_id} ${row.name}`;
    if (row.group_by === "day") return row.group_id;
    if (row.group_by === "user_project") {
      return `${resolveUserName(row.user_id || "")} · ${row.project_identifier}`;
    }
    return row.group_id;
  };

  const descriptionsForIssue = useCallback(
    (issueId: string) =>
      (report?.entries || [])
        .filter((entry) => entry.issue === issueId)
        .map((entry) => entry.description?.trim())
        .filter((description): description is string => Boolean(description))
        .join("\n"),
    [report?.entries]
  );

  const showDescriptionsColumn = Boolean(selectedUserId);

  const handleExport = () => {
    const rows: string[][] = showDescriptionsColumn
      ? [["Group", "Duration (minutes)", "Duration", "Descriptions"]]
      : [["Group", "Duration (minutes)", "Duration", "Entries"]];
    aggregates.forEach((row) => {
      rows.push([
        resolveLabel(row),
        String(row.total_duration),
        formatCsvDuration(row.total_duration),
        showDescriptionsColumn ? descriptionsForIssue(row.group_id) : String(row.entry_count),
      ]);
    });
    if (report?.entries?.length) {
      rows.push([]);
      rows.push(["Issue", "Project", "User", "Started", "Duration", "Description"]);
      report.entries.forEach((entry) => {
        rows.push([
          entry.issue_detail
            ? `${entry.project_detail?.identifier}-${entry.issue_detail.sequence_id} ${entry.issue_detail.name}`
            : entry.issue,
          entry.project_detail?.name || entry.project,
          entry.logged_by_detail?.display_name || entry.logged_by,
          entry.started_at,
          formatCsvDuration(entry.duration),
          entry.description || "",
        ]);
      });
    }
    downloadCsv(`time-tracking-${startDate}-${endDate}.csv`, rows);
  };

  const projects = useMemo(
    () => (workspaceProjectIds || []).map((id) => getProjectById(id)).filter(Boolean),
    [workspaceProjectIds, getProjectById]
  );

  const members = useMemo(
    () => (workspaceMemberIds || []).map((id) => getWorkspaceMemberDetails(id)).filter(Boolean),
    [workspaceMemberIds, getWorkspaceMemberDetails]
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-subtle bg-layer-1 p-4">
        <div className="flex flex-col gap-1">
          <span className="text-12 text-tertiary">{t("time_tracking_ui.period")}</span>
          <div className="flex gap-1">
            {(["day", "month", "custom"] as PeriodPreset[]).map((p) => (
              <Button
                key={p}
                size="sm"
                stretch="auto"
                variant={preset === p ? "primary" : "secondary"}
                label={t(`time_tracking_ui.period_${p}`)}
                onClick={() => applyPreset(p)}
              />
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-12 text-tertiary">{t("common.order_by.start_date")}</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => {
              setPreset("custom");
              setStartDate(e.target.value);
            }}
            className="rounded-md border border-subtle bg-surface-1 px-2 py-1.5 text-13"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-12 text-tertiary">{t("common.order_by.due_date")}</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => {
              setPreset("custom");
              setEndDate(e.target.value);
            }}
            className="rounded-md border border-subtle bg-surface-1 px-2 py-1.5 text-13"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-12 text-tertiary">{t("common.project")}</label>
          <select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className="min-w-40 rounded-md border border-subtle bg-surface-1 px-2 py-1.5 text-13"
          >
            <option value="">{t("common.all")}</option>
            {projects.map((project) =>
              project ? (
                <option key={project.id} value={project.id}>
                  {project.identifier} — {project.name}
                </option>
              ) : null
            )}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-12 text-tertiary">{t("common.member")}</label>
          <select
            value={userId}
            onChange={(e) => {
              setUserId(e.target.value);
              setSelectedUserId(null);
            }}
            className="min-w-40 rounded-md border border-subtle bg-surface-1 px-2 py-1.5 text-13"
          >
            <option value="">{t("common.all")}</option>
            {members.map((member) =>
              member?.member ? (
                <option key={member.member.id} value={member.member.id}>
                  {member.member.display_name || member.member.email}
                </option>
              ) : null
            )}
          </select>
        </div>
        {!selectedUserId && (
          <div className="flex flex-col gap-1">
            <label className="text-12 text-tertiary">{t("time_tracking_ui.group_by")}</label>
            <select
              value={groupBy}
              onChange={(e) => setGroupBy(e.target.value as TTimeEntryGroupBy)}
              className="min-w-36 rounded-md border border-subtle bg-surface-1 px-2 py-1.5 text-13"
            >
              <option value="user">{t("common.members")}</option>
              <option value="project">{t("common.projects")}</option>
              <option value="issue">{t("work_items")}</option>
              <option value="day">{t("time_tracking_ui.period_day")}</option>
              <option value="user_project">{t("time_tracking_ui.user_project")}</option>
            </select>
          </div>
        )}
        <div className="ml-auto flex gap-2">
          {selectedUserId && (
            <Button
              size="sm"
              stretch="auto"
              variant="secondary"
              label={t("common.back")}
              onClick={() => setSelectedUserId(null)}
            />
          )}
          <Button
            size="sm"
            stretch="auto"
            variant="secondary"
            label={t("export")}
            onClick={handleExport}
            disabled={!aggregates.length}
          />
        </div>
      </div>

      <div className="flex items-center justify-between">
        <h3 className="text-14 font-medium text-primary">
          {selectedUserId
            ? t("time_tracking_ui.user_breakdown", { user: resolveUserName(selectedUserId) })
            : t("time_tracking_ui.summary")}
        </h3>
        <span className="text-13 text-secondary">
          {t("time_tracking_ui.total")}:{" "}
          <span className="font-medium text-primary">{formatCsvDuration(totalDuration)}</span>
        </span>
      </div>

      <div className="overflow-hidden rounded-lg border border-subtle">
        <table className="w-full text-left text-13">
          <thead className="bg-layer-1 text-12 text-tertiary">
            <tr>
              <th className="px-4 py-2 font-medium">{t("common.name")}</th>
              <th className="px-4 py-2 font-medium">{t("time_tracking_ui.duration")}</th>
              <th className="px-4 py-2 font-medium">
                {showDescriptionsColumn ? t("time_tracking_ui.descriptions") : t("time_tracking_ui.entries")}
              </th>
            </tr>
          </thead>
          <tbody>
            {loader && (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-tertiary">
                  {t("loading")}
                </td>
              </tr>
            )}
            {!loader && aggregates.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-tertiary">
                  {t("activity_empty_state.no_worklogs")}
                </td>
              </tr>
            )}
            {!loader &&
              aggregates.map((row) => (
                <tr key={row.group_id} className="border-t border-subtle hover:bg-layer-1">
                  <td className="px-4 py-2.5">
                    {row.group_by === "user" && !selectedUserId ? (
                      <button
                        type="button"
                        className="text-left text-primary hover:underline"
                        onClick={() => setSelectedUserId(row.group_id)}
                      >
                        {resolveLabel(row)}
                      </button>
                    ) : (
                      <span className="text-primary">{resolveLabel(row)}</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-secondary">{formatCsvDuration(row.total_duration)}</td>
                  <td className="px-4 py-2.5 whitespace-pre-line text-secondary">
                    {showDescriptionsColumn ? descriptionsForIssue(row.group_id) || "—" : row.entry_count}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
});
