"use client";

import { useState } from "react";
import type { PlanDraft } from "@/lib/tournament/draft";
import { cn } from "@/lib/utils";
import { EntriesView } from "./entries-view";
import type { Update } from "./plan-editor";

type DrawView = "entries" | "draw" | "courts" | "teams" | "groups" | "bracket";

/** The Draw stage's views; those not built yet say when they arrive. */
const VIEWS: { value: DrawView; label: string; comingIn?: string }[] = [
  { value: "entries", label: "Entries" },
  { value: "draw", label: "Draw", comingIn: "Making the draw comes in the next step." },
  { value: "courts", label: "Courts", comingIn: "Courts come once the draw can be made." },
  { value: "teams", label: "Teams", comingIn: "Teams and check-in come once the draw can be made." },
  { value: "groups", label: "Groups", comingIn: "Group standings come once the draw can be made." },
  { value: "bracket", label: "Bracket", comingIn: "The bracket comes once the draw can be made." },
];

/** The Draw stage: entries, the draw, and the post-draw views (built step by step). */
export function DrawStage({ draft, update, locked }: { draft: PlanDraft; update: Update; locked: boolean }) {
  const [view, setView] = useState<DrawView>("entries");
  return (
    <main className="flex min-h-0 flex-1 flex-col">
      <nav aria-label="Draw views" className="flex shrink-0 items-end gap-4 border-b bg-card px-4">
        {VIEWS.map((v) => (
          <button
            key={v.value}
            type="button"
            aria-current={view === v.value ? "page" : undefined}
            disabled={v.comingIn !== undefined}
            title={v.comingIn}
            onClick={() => setView(v.value)}
            className={cn(
              "-mb-px border-b-[3px] py-3 text-[15px] font-semibold transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50",
              view === v.value ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {v.label}
          </button>
        ))}
      </nav>
      <div className="scroll-pane min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-(--pane-x) py-4">
          {view === "entries" ? <EntriesView draft={draft} update={update} locked={locked} /> : null}
        </div>
      </div>
    </main>
  );
}
