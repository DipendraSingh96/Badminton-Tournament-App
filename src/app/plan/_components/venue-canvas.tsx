"use client";

import { PlusIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { emptyHall, type PlanDraft } from "@/lib/tournament/draft";
import { HallCard } from "./hall-card";
import type { Update } from "./plan-editor";

/** The venue: halls holding courts. Add a hall below the last one. */
export function VenueCanvas({ draft, update }: { draft: PlanDraft; update: Update }) {
  const [openCourtId, setOpenCourtId] = useState<string | null>(null);
  return (
    <section aria-labelledby="venue-heading" className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h2 id="venue-heading" className="text-lg">
          Venue
        </h2>
        <Button variant="outline" onClick={() => update((d) => void d.frame.halls.push(emptyHall()))}>
          <PlusIcon /> Add hall
        </Button>
      </div>
      {draft.frame.halls.map((hall, i) => (
        <HallCard
          key={hall.id}
          draft={draft}
          hallIndex={i}
          update={update}
          openCourtId={openCourtId}
          onOpenCourt={setOpenCourtId}
        />
      ))}
    </section>
  );
}
