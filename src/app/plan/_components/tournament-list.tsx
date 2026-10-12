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
    <aside className="flex w-72 shrink-0 flex-col gap-6 overflow-y-auto border-r bg-card p-5">
      <Button size="lg" className="h-11 w-full" onClick={onNew}>
        <PlusIcon /> New tournament
      </Button>
      <section className="flex flex-col gap-3">
        <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Tournaments</h2>
        <div aria-current="true" className="rounded-xl bg-accent px-4 py-3 ring-1 ring-foreground/15">
          <p className="truncate font-medium">{draft.name.trim() || "Untitled tournament"}</p>
          <p className="text-sm text-muted-foreground">{formatDate(draft.frame.date)}</p>
        </div>
      </section>
    </aside>
  );
}
