/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useMemo, useState } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@makeplane/propel/components/button";
import { TimeTrackingOutline } from "@makeplane/propel/icons";
import { useTranslation } from "@plane/i18n";
import { convertMinutesToHoursMinutesString } from "@plane/utils";
import { useTimeEntry } from "@/hooks/store/use-time-entry";

const IDLE_TIMEOUT_MS = 15 * 60 * 1000;

function elapsedMinutes(startedAt: string): number {
  const start = new Date(startedAt).getTime();
  const mins = Math.floor((Date.now() - start) / 60000);
  return Math.max(0, mins);
}

export const RunningTimerBar = observer(function RunningTimerBar() {
  const params = useParams();
  const workspaceSlug = params?.workspaceSlug as string | undefined;
  const { t } = useTranslation();
  const { runningEntry, fetchRunning, stopTimer } = useTimeEntry();
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!workspaceSlug) return;
    void fetchRunning(workspaceSlug);
  }, [workspaceSlug, fetchRunning]);

  // Live duration tick
  useEffect(() => {
    if (!runningEntry) return;
    const id = window.setInterval(() => setTick((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, [runningEntry]);

  // Idle auto-stop
  useEffect(() => {
    if (!workspaceSlug || !runningEntry) return;

    let lastActivity = Date.now();
    const onActivity = () => {
      lastActivity = Date.now();
    };
    const events = ["mousemove", "keydown", "mousedown", "touchstart", "visibilitychange"] as const;
    events.forEach((event) => window.addEventListener(event, onActivity, { passive: true }));

    const idleCheck = window.setInterval(() => {
      if (document.visibilityState === "hidden") return;
      if (Date.now() - lastActivity >= IDLE_TIMEOUT_MS) {
        void stopTimer(workspaceSlug);
      }
    }, 30_000);

    return () => {
      events.forEach((event) => window.removeEventListener(event, onActivity));
      window.clearInterval(idleCheck);
    };
  }, [workspaceSlug, runningEntry, stopTimer]);

  const durationLabel = useMemo(() => {
    if (!runningEntry) return "";
    // tick forces recompute
    void tick;
    return convertMinutesToHoursMinutesString(elapsedMinutes(runningEntry.started_at)) || "0m";
  }, [runningEntry, tick]);

  if (!workspaceSlug || !runningEntry) return null;

  const issue = runningEntry.issue_detail;
  const project = runningEntry.project_detail;
  const issueHref =
    issue && project ? `/${workspaceSlug}/projects/${runningEntry.project}/issues/${runningEntry.issue}` : undefined;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-40 flex justify-center px-4">
      <div className="shadow-lg pointer-events-auto flex max-w-xl items-center gap-3 rounded-lg border border-subtle bg-surface-1 px-3 py-2">
        <TimeTrackingOutline className="size-4 shrink-0 text-accent-primary" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-13 font-medium text-primary">
            {issueHref ? (
              <Link href={issueHref} className="hover:underline">
                {project?.identifier}-{issue?.sequence_id} {issue?.name}
              </Link>
            ) : (
              t("time_tracking.running", { defaultValue: "Timer running" })
            )}
          </div>
          <div className="text-12 text-tertiary">{durationLabel.trim()}</div>
        </div>
        <Button
          size="sm"
          variant="accent"
          stretch="auto"
          label={t("time_tracking_ui.stop")}
          onClick={() => void stopTimer(workspaceSlug)}
        />
      </div>
    </div>
  );
});
