"use client";

import { PlusIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import type { PlanDraft } from "@/lib/tournament/draft";

function formatDate(iso: string): string {
  if (!iso) return "No date yet";
  const [y, m, d] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" }).format(
    new Date(y!, m! - 1, d!),
  );
}

/**
 * Left panel. Holds the tournament being planned; the list of previous
 * tournaments and Duplicate arrive with saved tournaments.
 */
export function TournamentList({ draft, onNew }: { draft: PlanDraft; onNew: () => void }) {
  return (
    <aside className="flex w-(--pane-left) shrink-0 flex-col gap-5 overflow-y-auto border-r bg-card p-5">
      <Button className="w-full" onClick={onNew}>
        <PlusIcon /> New tournament
      </Button>
      <section aria-labelledby="tournaments-heading" className="flex flex-col gap-2">
        <h2 id="tournaments-heading" className="heading-card text-xl">
          Tournaments
        </h2>
        <div aria-current="true" className="rounded-lg border border-tile-border bg-tile px-4 py-3">
          <p className="truncate text-[17px] font-semibold text-turf">{draft.name.trim() || "Untitled tournament"}</p>
          <p className="text-sm text-muted-foreground tabular-nums">{formatDate(draft.frame.date)}</p>
        </div>
      </section>
    </aside>
  );
}
