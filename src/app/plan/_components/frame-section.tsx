"use client";

import { PlusIcon, TrashIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { emptyCourtWindow, type PlanDraft } from "@/lib/tournament/draft";
import { FieldGrid, NumberField, Section, SelectField, TextField } from "./fields";
import type { Update } from "./plan-editor";

const TIME_ZONES = Intl.supportedValuesOf("timeZone").map((tz) => ({
  value: tz,
  label: tz.replaceAll("_", " "),
}));

export function FrameSection({ draft, update }: { draft: PlanDraft; update: Update }) {
  const { frame } = draft;
  return (
    <Section
      title="Frame"
      description="The outer bounds. The tournament may finish earlier than the end time, never later."
    >
      <FieldGrid>
        <TextField
          label="Date"
          type="date"
          path={["frame", "date"]}
          value={frame.date}
          onChange={(v) => update((d) => void (d.frame.date = v))}
        />
        <SelectField
          label="Time zone"
          path={["frame", "timeZone"]}
          value={frame.timeZone || null}
          options={TIME_ZONES}
          onChange={(v) => update((d) => void (d.frame.timeZone = v))}
        />
        <TextField
          label="Start time"
          type="time"
          path={["frame", "startTime"]}
          value={frame.startTime}
          onChange={(v) => update((d) => void (d.frame.startTime = v))}
        />
        <TextField
          label="End time"
          type="time"
          path={["frame", "endTime"]}
          value={frame.endTime}
          onChange={(v) => update((d) => void (d.frame.endTime = v))}
        />
        <NumberField
          label="Buffer (minutes)"
          step="1"
          hint="Held back at the end of the day for miscellaneous activity like prize distribution."
          path={["frame", "bufferMinutes"]}
          value={frame.bufferMinutes}
          onChange={(v) => update((d) => void (d.frame.bufferMinutes = v))}
        />
      </FieldGrid>

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium">Courts</h3>
          <Button
            variant="outline"
            size="sm"
            onClick={() => update((d) => void d.frame.courtWindows.push(emptyCourtWindow()))}
          >
            <PlusIcon /> Add time window
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Use more than one window if the number of courts changes during the day.
        </p>
        {frame.courtWindows.map((window, i) => (
          <div
            key={window.id}
            className="grid grid-cols-2 items-end gap-2 sm:grid-cols-[1fr_1fr_1fr_1fr_auto]"
          >
            <TextField
              label="From"
              type="time"
              path={["frame", "courtWindows", i, "from"]}
              value={window.from}
              onChange={(v) => update((d) => void (d.frame.courtWindows[i]!.from = v))}
            />
            <TextField
              label="Until"
              type="time"
              path={["frame", "courtWindows", i, "to"]}
              value={window.to}
              onChange={(v) => update((d) => void (d.frame.courtWindows[i]!.to = v))}
            />
            <NumberField
              label="Courts"
              step="1"
              path={["frame", "courtWindows", i, "courts"]}
              value={window.courts}
              onChange={(v) => update((d) => void (d.frame.courtWindows[i]!.courts = v))}
            />
            <NumberField
              label="Rate per court/hour (£)"
              path={["frame", "courtWindows", i, "rate"]}
              value={window.rate}
              onChange={(v) => update((d) => void (d.frame.courtWindows[i]!.rate = v))}
            />
            <Button
              className="col-span-2 justify-self-end sm:col-span-1"
              variant="ghost"
              size="icon"
              aria-label="Remove time window"
              disabled={frame.courtWindows.length === 1}
              onClick={() => update((d) => void d.frame.courtWindows.splice(i, 1))}
            >
              <TrashIcon />
            </Button>
          </div>
        ))}
      </div>

      <FieldGrid>
        <NumberField
          label="Umpires available"
          step="1"
          path={["frame", "umpires"]}
          value={frame.umpires}
          onChange={(v) => update((d) => void (d.frame.umpires = v))}
        />
      </FieldGrid>
    </Section>
  );
}
