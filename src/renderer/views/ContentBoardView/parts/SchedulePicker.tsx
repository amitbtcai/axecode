import { useState } from "react";
import { Button } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import type { ScheduleSlotId } from "../contentBoardUtils";
import {
  SCHEDULE_SLOTS,
  SCHEDULE_TIMEZONES,
  nextDays,
  scheduleSlotIso,
} from "../contentBoardUtils";

/**
 * Quick scheduler: pick a day (next 14), a timezone, and a time-of-day slot —
 * the ISO instant is computed in the chosen timezone, not the local one.
 */
export function SchedulePicker(props: { onSchedule: (iso: string) => void; onCancel: () => void }) {
  const { t } = useLingui();
  const days = nextDays(14);
  const [dateStr, setDateStr] = useState(days[1]?.dateStr ?? days[0]!.dateStr);
  const [tz, setTz] = useState<string>(
    () =>
      SCHEDULE_TIMEZONES.find((z) => z.id === Intl.DateTimeFormat().resolvedOptions().timeZone)
        ?.id ?? "America/New_York",
  );
  const [slot, setSlot] = useState<ScheduleSlotId>("morning");

  const slotLabels: Record<ScheduleSlotId, string> = {
    morning: t`Morning`,
    noon: t`Noon`,
    evening: t`Evening`,
    night: t`Night`,
  };

  const chip = (active: boolean) =>
    `rounded-md border px-2 py-1 text-xs transition ${
      active
        ? "border-accent bg-accent/10 text-foreground"
        : "border-[var(--hairline)] text-muted hover:text-foreground"
    }`;

  const preview = () => {
    const hour = SCHEDULE_SLOTS.find((s) => s.id === slot)!.hour;
    const iso = scheduleSlotIso(dateStr, tz, hour);
    if (!iso) return null;
    return new Date(iso).toLocaleString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  };

  return (
    <div className="space-y-3 rounded-lg border border-[var(--hairline)] bg-surface-secondary/50 p-3">
      <div>
        <p className="mb-1.5 text-[11px] font-medium text-muted">
          <Trans>Day</Trans>
        </p>
        <div className="flex flex-wrap gap-1.5">
          {days.map(({ dateStr: d, day }) => (
            <button
              key={d}
              type="button"
              className={chip(dateStr === d)}
              onClick={() => setDateStr(d)}
            >
              {day.toLocaleDateString(undefined, { weekday: "short", day: "numeric" })}
            </button>
          ))}
        </div>
      </div>
      <div>
        <p className="mb-1.5 text-[11px] font-medium text-muted">
          <Trans>Time zone</Trans>
        </p>
        <div className="flex flex-wrap gap-1.5">
          {SCHEDULE_TIMEZONES.map((z) => (
            <button
              key={z.id}
              type="button"
              className={chip(tz === z.id)}
              onClick={() => setTz(z.id)}
            >
              {z.label}
            </button>
          ))}
        </div>
      </div>
      <div>
        <p className="mb-1.5 text-[11px] font-medium text-muted">
          <Trans>Time</Trans>
        </p>
        <div className="flex flex-wrap gap-1.5">
          {SCHEDULE_SLOTS.map((s) => (
            <button
              key={s.id}
              type="button"
              className={chip(slot === s.id)}
              onClick={() => setSlot(s.id)}
            >
              {slotLabels[s.id]} · {s.hour}:00
            </button>
          ))}
        </div>
      </div>
      <div className="flex items-center justify-between pt-1">
        <span className="text-xs text-muted">{preview()}</span>
        <div className="flex gap-2">
          <Button variant="tertiary" size="sm" onPress={props.onCancel}>
            <Trans>Cancel</Trans>
          </Button>
          <Button
            size="sm"
            onPress={() => {
              const hour = SCHEDULE_SLOTS.find((s) => s.id === slot)!.hour;
              const iso = scheduleSlotIso(dateStr, tz, hour);
              if (iso) props.onSchedule(iso);
            }}
          >
            <Trans>Schedule</Trans>
          </Button>
        </div>
      </div>
    </div>
  );
}
