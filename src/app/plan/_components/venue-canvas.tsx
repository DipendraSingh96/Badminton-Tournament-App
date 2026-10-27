"use client";

import { PlusIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import type { CourtGroups } from "@/engine";
import { courtNumber, emptyHall, type PlanDraft } from "@/lib/tournament/draft";
import type { GroupOption } from "./court-card";
import { HallCard } from "./hall-card";
import { categoryName } from "./labels";
import type { Update } from "./plan-editor";
import type { CourtStatus } from "./timeline";

/** The venue: halls holding courts. Add a hall below the last one. */
export function VenueCanvas({
  draft,
  update,
  statuses,
  courtGroups,
}: {
  draft: PlanDraft;
  update: Update;
  /** What each court is doing at the timeline's playhead; null without an estimate. */
  statuses: Map<string, CourtStatus> | null;
  /** Each court's groups when groups keep their own courts; null when courts are shared or there's no estimate. */
  courtGroups: Map<string, CourtGroups> | null;
}) {
  // Every group, with the courts it plays on now, for the courts' group menus.
  const allGroups: GroupOption[] = [];
  if (courtGroups) {
    const found = new Map<string, { categoryId: string; groupIndex: number; group: string; courts: number[] }>();
    draft.frame.halls.forEach((hall, h) =>
      hall.courts.forEach((court, c) => {
        for (const g of courtGroups.get(court.id)?.groups ?? []) {
          const key = `${g.categoryId}:${g.groupIndex}`;
          const entry = found.get(key) ?? { ...g, courts: [] };
          entry.courts.push(courtNumber(draft.frame.halls, h, c));
          found.set(key, entry);
        }
      }),
    );
    const order = (id: string) => draft.categories.findIndex((c) => c.id === id);
    for (const [key, g] of [...found].sort(
      ([, a], [, b]) => order(a.categoryId) - order(b.categoryId) || a.groupIndex - b.groupIndex,
    )) {
      allGroups.push({
        key,
        label: draft.categories.length > 1 ? `Group ${g.group} · ${categoryName(draft, g.categoryId)}` : `Group ${g.group}`,
        courts: g.courts.map((n) => `C${n}`).join(", "),
      });
    }
  }
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
            courtGroups={courtGroups}
            allGroups={allGroups}
          />
        ))}
      </div>
    </section>
  );
}
