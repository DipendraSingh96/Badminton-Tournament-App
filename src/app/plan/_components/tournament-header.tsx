"use client";

import { Card, CardContent } from "@/components/ui/card";
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
    <Card>
      <CardContent className="grid grid-cols-2 items-start gap-4 *:first:col-span-2 @2xl:grid-cols-[2fr_1fr_1fr] @2xl:*:first:col-span-1">
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
      </CardContent>
    </Card>
  );
}
