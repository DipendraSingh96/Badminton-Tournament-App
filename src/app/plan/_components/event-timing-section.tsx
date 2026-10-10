"use client";

import { eventsInUse, type EventTimingDraft, type PlanDraft } from "@/lib/tournament/draft";
import { EVENT_LABELS } from "@/lib/tournament/events";
import { FieldGrid, NumberField, Section } from "./fields";
import type { Update } from "./plan-editor";

export function EventTimingSection({ draft, update }: { draft: PlanDraft; update: Update }) {
  const events = eventsInUse(draft);
  return (
    <Section
      title="Timing"
      description="Set per event and used in every stage. Singles and doubles games often run to different lengths."
    >
      {events.length === 0 ? (
        <p className="text-sm text-muted-foreground">Choose events in Categories and format first.</p>
      ) : (
        events.map((event) => {
          const timing = draft.eventTiming[event];
          const set = <K extends keyof EventTimingDraft>(key: K) => (value: EventTimingDraft[K]) =>
            update((d) => void (d.eventTiming[event][key] = value));
          return (
            <div key={event} className="flex flex-col gap-2">
              <h3 className="text-sm font-medium">{EVENT_LABELS[event]}</h3>
              <FieldGrid>
                <NumberField
                  label="Minutes per game"
                  hint="Typical playing time."
                  path={["eventTiming", event, "minutesPerGame"]}
                  value={timing.minutesPerGame}
                  onChange={set("minutesPerGame")}
                />
                <NumberField
                  label="Organising time per match (minutes)"
                  hint="Walk-on, warm-up and changeover."
                  path={["eventTiming", event, "changeoverMinutes"]}
                  value={timing.changeoverMinutes}
                  onChange={set("changeoverMinutes")}
                />
              </FieldGrid>
            </div>
          );
        })
      )}
    </Section>
  );
}
