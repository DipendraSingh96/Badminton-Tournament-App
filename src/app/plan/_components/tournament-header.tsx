"use client";

import type { PlanDraft } from "@/lib/tournament/draft";
import { SelectField, TextField } from "./fields";
import type { Update } from "./plan-editor";

const TIME_ZONES = Intl.supportedValuesOf("timeZone").map((tz) => ({
  value: tz,
  label: tz.replaceAll("_", " "),
}));

/** Name, date and time zone: the tournament's first row. */
export function TournamentHeader({ draft, update }: { draft: PlanDraft; update: Update }) {
  return (
    <div className="flex items-start gap-4 *:shrink-0 *:first:w-40 @min-[720px]:*:first:w-[200px] @min-[840px]:*:first:w-80 *:nth-2:w-40 *:nth-3:w-60">
        <TextField
          label="Tournament name"
          path={["name"]}
          value={draft.name}
          onChange={(v) => update((d) => void (d.name = v))}
        />
        <TextField
          label="Date"
          type="date"
          path={["frame", "date"]}
          value={draft.frame.date}
          onChange={(v) => update((d) => void (d.frame.date = v))}
        />
        <SelectField
          label="Time zone"
          path={["frame", "timeZone"]}
          value={draft.frame.timeZone || null}
          options={TIME_ZONES}
          onChange={(v) => update((d) => void (d.frame.timeZone = v))}
        />
    </div>
  );
}
