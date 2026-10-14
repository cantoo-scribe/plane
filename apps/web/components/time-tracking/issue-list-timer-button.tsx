/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { SyntheticEvent } from "react";
import { useState } from "react";
import { observer } from "mobx-react";
import { Tooltip } from "@makeplane/propel/components/tooltip";
import { TimeTrackingOutline } from "@makeplane/propel/icons";
import { useTranslation } from "@plane/i18n";
import { cn } from "@plane/utils";
import { useProject } from "@/hooks/store/use-project";
import { useTimeEntry } from "@/hooks/store/use-time-entry";
import { usePlatformOS } from "@/hooks/use-platform-os";

type Props = {
  workspaceSlug: string;
  projectId: string;
  issueId: string;
  disabled?: boolean;
};

export const IssueListTimerButton = observer(function IssueListTimerButton(props: Props) {
  const { workspaceSlug, projectId, issueId, disabled = false } = props;
  const { t } = useTranslation();
  const { isMobile } = usePlatformOS();
  const { getProjectById } = useProject();
  const { runningEntry, startTimer, stopTimer } = useTimeEntry();
  const [busy, setBusy] = useState(false);

  const project = getProjectById(projectId);
  if (!project?.is_time_tracking_enabled) return null;

  const isRunningHere = runningEntry?.issue === issueId && runningEntry?.is_running;

  const handleToggle = async (e: SyntheticEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (disabled || busy || !workspaceSlug) return;
    setBusy(true);
    try {
      if (isRunningHere) {
        await stopTimer(workspaceSlug);
      } else {
        await startTimer(workspaceSlug, projectId, issueId);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Tooltip label={isRunningHere ? t("time_tracking_ui.stop") : t("time_tracking_ui.start")} disabled={isMobile}>
      {/* oxlint-disable-next-line jsx_a11y/click-events-have-key-events oxlint-disable-next-line jsx_a11y/no-static-element-interactions */}
      <button
        type="button"
        disabled={disabled || busy}
        onClick={handleToggle}
        onFocus={(e) => e.stopPropagation()}
        aria-label={isRunningHere ? t("time_tracking_ui.stop") : t("time_tracking_ui.start")}
        className={cn(
          "flex h-5 flex-shrink-0 items-center justify-center gap-1 overflow-hidden rounded-sm border-[0.5px] px-2 py-1",
          isRunningHere
            ? "border-accent-strong bg-accent-subtle text-accent-primary"
            : "border-strong text-secondary hover:bg-layer-1",
          (disabled || busy) && "cursor-not-allowed opacity-50"
        )}
      >
        <TimeTrackingOutline className="h-3 w-3 flex-shrink-0" />
        {isRunningHere ? <span className="text-caption-sm-regular">{t("time_tracking_ui.running")}</span> : null}
      </button>
    </Tooltip>
  );
});
