/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import { observer } from "mobx-react";
import { Button } from "@makeplane/propel/components/button";
import { Dialog, DialogContent, DialogMain, DialogTitle } from "@makeplane/propel/components/dialog";
import { useTranslation } from "@plane/i18n";
import type { ITimeEntry } from "@plane/types";
import { convertHoursMinutesToMinutes, convertMinutesToHoursAndMinutes } from "@plane/utils";
import { useTimeEntry } from "@/hooks/store/use-time-entry";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  workspaceSlug: string;
  projectId: string;
  issueId: string;
  entry?: ITimeEntry | null;
};

export const LogTimeModal = observer(function LogTimeModal(props: Props) {
  const { isOpen, onClose, workspaceSlug, projectId, issueId, entry } = props;
  const { t } = useTranslation();
  const { createEntry, updateEntry } = useTimeEntry();

  const initial = entry ? convertMinutesToHoursAndMinutes(entry.duration || 0) : { hours: 0, minutes: 0 };

  const [hours, setHours] = useState(initial.hours);
  const [minutes, setMinutes] = useState(initial.minutes);
  const [description, setDescription] = useState(entry?.description || "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const next = entry ? convertMinutesToHoursAndMinutes(entry.duration || 0) : { hours: 0, minutes: 0 };
    setHours(next.hours);
    setMinutes(next.minutes);
    setDescription(entry?.description || "");
    setError(null);
  }, [isOpen, entry]);

  const handleSubmit = async () => {
    const duration = convertHoursMinutesToMinutes(Math.max(0, hours), Math.max(0, Math.min(59, minutes)));
    if (duration <= 0) {
      setError(t("time_tracking_ui.duration_required"));
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      if (entry) {
        await updateEntry(workspaceSlug, projectId, entry.id, { duration, description });
      } else {
        await createEntry(workspaceSlug, projectId, issueId, { duration, description });
      }
      onClose();
    } catch {
      setError(t("something_went_wrong"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent size="md">
        <DialogTitle>{entry ? t("time_tracking_ui.edit_entry") : t("time_tracking_ui.log_work")}</DialogTitle>
        <DialogMain>
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <div className="flex flex-1 flex-col gap-1">
                <label className="text-13 text-secondary">{t("hours")}</label>
                <input
                  type="number"
                  min={0}
                  value={hours}
                  onChange={(e) => setHours(Number(e.target.value) || 0)}
                  className="rounded-md border border-subtle bg-surface-1 px-3 py-2 text-13 outline-none focus:border-accent-strong"
                />
              </div>
              <div className="flex flex-1 flex-col gap-1">
                <label className="text-13 text-secondary">{t("minutes")}</label>
                <input
                  type="number"
                  min={0}
                  max={59}
                  value={minutes}
                  onChange={(e) => setMinutes(Math.min(59, Math.max(0, Number(e.target.value) || 0)))}
                  className="rounded-md border border-subtle bg-surface-1 px-3 py-2 text-13 outline-none focus:border-accent-strong"
                />
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-13 text-secondary">{t("common.description")}</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="resize-none rounded-md border border-subtle bg-surface-1 px-3 py-2 text-13 outline-none focus:border-accent-strong"
                placeholder={t("time_tracking_ui.description_placeholder")}
              />
            </div>
            {error && <p className="text-13 text-danger-primary">{error}</p>}
            <div className="flex justify-end gap-2">
              <Button variant="secondary" size="sm" stretch="auto" onClick={onClose} label={t("cancel")} />
              <Button
                variant="primary"
                size="sm"
                stretch="auto"
                onClick={handleSubmit}
                disabled={submitting}
                label={submitting ? t("loading") : t("save")}
              />
            </div>
          </div>
        </DialogMain>
      </DialogContent>
    </Dialog>
  );
});
