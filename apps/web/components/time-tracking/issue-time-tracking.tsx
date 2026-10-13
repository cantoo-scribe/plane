/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import { observer } from "mobx-react";
import { Button } from "@makeplane/propel/components/button";
import { Icon } from "@makeplane/propel/components/icon";
import { IconButton } from "@makeplane/propel/components/icon-button";
import { Tooltip } from "@makeplane/propel/components/tooltip";
import { TimeTrackingOutline } from "@makeplane/propel/icons";
import { useTranslation } from "@plane/i18n";
import type { ITimeEntry } from "@plane/types";
import { convertMinutesToHoursMinutesString } from "@plane/utils";
import { SidebarPropertyListItem } from "@/components/common/layout/sidebar/property-list-item";
import { useProject } from "@/hooks/store/use-project";
import { useTimeEntry } from "@/hooks/store/use-time-entry";
import { LogTimeModal } from "./log-time-modal";

type Props = {
  workspaceSlug: string;
  projectId: string;
  issueId: string;
  isEditable: boolean;
};

export const IssueTimeTracking = observer(function IssueTimeTracking(props: Props) {
  const { workspaceSlug, projectId, issueId, isEditable } = props;
  const { t } = useTranslation();
  const { getProjectById } = useProject();
  const {
    fetchIssueEntries,
    fetchIssueSummary,
    getEntriesByIssueId,
    getTotalByIssueId,
    summaryByIssueId,
    runningEntry,
    startTimer,
    stopTimer,
    deleteEntry,
  } = useTimeEntry();

  const [isLogOpen, setIsLogOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<ITimeEntry | null>(null);
  const [showEntries, setShowEntries] = useState(false);

  const project = getProjectById(projectId);
  const enabled = Boolean(project?.is_time_tracking_enabled);

  useEffect(() => {
    if (!enabled || !workspaceSlug || !projectId || !issueId) return;
    void fetchIssueEntries(workspaceSlug, projectId, issueId);
    void fetchIssueSummary(workspaceSlug, projectId, issueId);
  }, [enabled, workspaceSlug, projectId, issueId, fetchIssueEntries, fetchIssueSummary]);

  if (!enabled) return null;

  const entries = getEntriesByIssueId(issueId);
  const total = getTotalByIssueId(issueId);
  const summary = summaryByIssueId[issueId];
  const isRunningHere = runningEntry?.issue === issueId && runningEntry?.is_running;

  const handleToggleTimer = async () => {
    if (!isEditable) return;
    if (isRunningHere) {
      await stopTimer(workspaceSlug);
      await fetchIssueEntries(workspaceSlug, projectId, issueId);
      await fetchIssueSummary(workspaceSlug, projectId, issueId);
    } else {
      await startTimer(workspaceSlug, projectId, issueId);
    }
  };

  const trackedLabel = convertMinutesToHoursMinutesString(total) || "0m";
  const estimated =
    summary?.estimate_type === "time" && summary.estimated_duration != null
      ? convertMinutesToHoursMinutesString(summary.estimated_duration)
      : null;

  return (
    <>
      <SidebarPropertyListItem icon={TimeTrackingOutline} label={t("time_tracking")}>
        <div className="flex w-full flex-col gap-2 py-1">
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              className="text-left text-13 text-secondary hover:text-primary"
              onClick={() => setShowEntries((v) => !v)}
            >
              <span className="font-medium text-primary">{trackedLabel}</span>
              {estimated ? <span className="text-tertiary"> / {estimated.trim()}</span> : null}
            </button>
            <div className="flex items-center gap-1">
              {isEditable && (
                <>
                  <Tooltip label={isRunningHere ? t("time_tracking_ui.stop") : t("time_tracking_ui.start")}>
                    <IconButton
                      size="sm"
                      variant={isRunningHere ? "accent" : "secondary"}
                      onClick={handleToggleTimer}
                      aria-label={isRunningHere ? "Stop timer" : "Start timer"}
                      icon={<Icon icon={TimeTrackingOutline} />}
                    />
                  </Tooltip>
                  <Button
                    size="sm"
                    variant="secondary"
                    stretch="auto"
                    label={t("time_tracking_ui.log")}
                    onClick={() => {
                      setEditingEntry(null);
                      setIsLogOpen(true);
                    }}
                  />
                </>
              )}
            </div>
          </div>

          {showEntries && entries.length > 0 && (
            <ul className="max-h-48 space-y-1 overflow-y-auto rounded-md border border-subtle bg-layer-1 p-2">
              {entries.map((entry) => (
                <li key={entry.id} className="flex items-start justify-between gap-2 text-12">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-primary">
                      {entry.is_running
                        ? t("time_tracking_ui.running")
                        : convertMinutesToHoursMinutesString(entry.duration) || "0m"}
                    </div>
                    {entry.description ? <div className="truncate text-tertiary">{entry.description}</div> : null}
                  </div>
                  {isEditable && !entry.is_running && (
                    <div className="flex shrink-0 gap-1">
                      <button
                        type="button"
                        className="text-tertiary hover:text-primary"
                        onClick={() => {
                          setEditingEntry(entry);
                          setIsLogOpen(true);
                        }}
                      >
                        {t("edit")}
                      </button>
                      <button
                        type="button"
                        className="text-tertiary hover:text-danger-primary"
                        onClick={() => void deleteEntry(workspaceSlug, projectId, issueId, entry.id)}
                      >
                        {t("delete")}
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </SidebarPropertyListItem>

      <LogTimeModal
        isOpen={isLogOpen}
        onClose={() => {
          setIsLogOpen(false);
          setEditingEntry(null);
          void fetchIssueSummary(workspaceSlug, projectId, issueId);
        }}
        workspaceSlug={workspaceSlug}
        projectId={projectId}
        issueId={issueId}
        entry={editingEntry}
      />
    </>
  );
});
