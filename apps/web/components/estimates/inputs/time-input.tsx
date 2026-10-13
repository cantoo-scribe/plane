/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import { useTranslation } from "@plane/i18n";
import { convertHoursMinutesToMinutes, convertMinutesToHoursAndMinutes } from "@plane/utils";

type TEstimateTimeInputProps = {
  value?: string;
  handleEstimateInputValue: (value: string) => void;
};

export function EstimateTimeInput(props: TEstimateTimeInputProps) {
  const { value, handleEstimateInputValue } = props;
  const { t } = useTranslation();

  const initial = value ? convertMinutesToHoursAndMinutes(Number(value) || 0) : { hours: 0, minutes: 0 };
  const [hours, setHours] = useState<number>(initial.hours);
  const [minutes, setMinutes] = useState<number>(initial.minutes);

  useEffect(() => {
    if (value === undefined || value === "") return;
    const parsed = convertMinutesToHoursAndMinutes(Number(value) || 0);
    setHours(parsed.hours);
    setMinutes(parsed.minutes);
  }, [value]);

  const emit = (nextHours: number, nextMinutes: number) => {
    const total = convertHoursMinutesToMinutes(Math.max(0, nextHours), Math.max(0, Math.min(59, nextMinutes)));
    handleEstimateInputValue(String(total));
  };

  return (
    <div className="flex w-full items-center gap-2 px-2 py-1">
      <input
        type="number"
        min={0}
        value={Number.isFinite(hours) ? hours : 0}
        onChange={(e) => {
          const next = Number(e.target.value) || 0;
          setHours(next);
          emit(next, minutes);
        }}
        className="w-16 border-none bg-transparent text-13 focus:border-0 focus:ring-0 focus:outline-none"
        placeholder={t("hours")}
      />
      <span className="text-13 text-tertiary">h</span>
      <input
        type="number"
        min={0}
        max={59}
        value={Number.isFinite(minutes) ? minutes : 0}
        onChange={(e) => {
          const next = Math.min(59, Math.max(0, Number(e.target.value) || 0));
          setMinutes(next);
          emit(hours, next);
        }}
        className="w-16 border-none bg-transparent text-13 focus:border-0 focus:ring-0 focus:outline-none"
        placeholder={t("minutes")}
      />
      <span className="text-13 text-tertiary">m</span>
    </div>
  );
}
