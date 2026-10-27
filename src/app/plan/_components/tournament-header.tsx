"use client";

import type { PlanDraft } from "@/lib/tournament/draft";
import { SelectField, TextField } from "./fields";
import type { Update } from "./plan-editor";

const TIME_ZONES = Intl.supportedValuesOf("timeZone").map((tz) => ({
  value: tz,
  label: tz.replaceAll("_", " "),
}));

/** Name, date and time zone across the top of the working area. */
export function TournamentHeader({ draft, update }: { draft: PlanDraft; update: Update }) {
  return (
    <div className="grid grid-cols-2 items-start gap-4 border-b pb-4 *:first:col-span-2 @xl:grid-cols-[minmax(0,1fr)_10.5rem_14rem] @xl:*:first:col-span-1">
        <TextField
          label="Tournament name"
          placeholder="Untitled tournament"
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
