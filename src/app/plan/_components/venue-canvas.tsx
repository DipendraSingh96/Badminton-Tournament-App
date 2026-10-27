"use client";

import { PlusIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { emptyHall, type PlanDraft } from "@/lib/tournament/draft";
import { HallCard } from "./hall-card";
import type { Update } from "./plan-editor";
import type { CourtStatus } from "./timeline";

/** The venue: halls holding courts. Add a hall below the last one. */
export function VenueCanvas({
  draft,
  update,
  statuses,
}: {
  draft: PlanDraft;
  update: Update;
  /** What each court is doing at the timeline's playhead; null without an estimate. */
  statuses: Map<string, CourtStatus> | null;
}) {
  return (
    <section aria-labelledby="venue-heading" className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h2 id="venue-heading" className="heading-screen">
          Venue
        </h2>
        <Button variant="outline" onClick={() => update((d) => void d.frame.halls.push(emptyHall()))}>
          <PlusIcon /> Add hall
        </Button>
      </div>
      <div className="flex flex-col gap-4">
        {draft.frame.halls.map((hall, i) => (
          <HallCard
            key={hall.id}
            draft={draft}
            hallIndex={i}
            update={update}
            statuses={statuses}
          />
        ))}
      </div>
    </section>
  );
}
