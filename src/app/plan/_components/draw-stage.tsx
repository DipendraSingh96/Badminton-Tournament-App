"use client";

import { useState, type ReactNode } from "react";
import type { PlanDraft } from "@/lib/tournament/draft";
import { cn } from "@/lib/utils";
import { BracketView } from "./bracket-view";
import { DrawView } from "./draw-view";
import { EntriesView } from "./entries-view";
import { GroupsView } from "./groups-view";
import type { Update } from "./plan-editor";
import { TeamsView } from "./teams-view";
import type { LocalSegment } from "./timeline";

type DrawStageView = "entries" | "draw" | "courts" | "teams" | "groups" | "bracket";

/** The Draw stage's views; those not built yet say when they arrive. */
const VIEWS: { value: DrawStageView; label: string; comingIn?: string }[] = [
  { value: "entries", label: "Entries" },
  { value: "draw", label: "Draw" },
  { value: "courts", label: "Courts" },
  { value: "teams", label: "Teams" },
  { value: "groups", label: "Groups" },
  { value: "bracket", label: "Bracket" },
];

/** The Draw stage: entries, the draw, and the post-draw views (built step by step). */
export function DrawStage({
  draft,
  update,
  locked,
  courts,
  segments,
  moment,
}: {
  draft: PlanDraft;
  update: Update;
  locked: boolean;
  /** The schedule's matches and the timeline's playhead, for the Teams view. */
  segments: LocalSegment[];
  moment: number | null;
  /** The Courts view: the venue and timeline with names, and the court panel. */
  courts: ReactNode;
}) {
  const [view, setView] = useState<DrawStageView>("entries");
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
      {view === "courts" ? (
        <>
          {Object.keys(draft.draw).length === 0 ? (
            <p className="shrink-0 border-b bg-inset px-4 py-2 text-sm">
              No draw yet: courts show draw slots (A1, B2…) until the draw places teams.
            </p>
          ) : null}
          {courts}
        </>
      ) : (
        <div className="scroll-pane min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto flex max-w-6xl flex-col gap-4 px-(--pane-x) py-4">
            {view === "entries" ? <EntriesView draft={draft} update={update} locked={locked} /> : null}
            {view === "draw" ? <DrawView draft={draft} update={update} /> : null}
            {view === "teams" ? <TeamsView draft={draft} update={update} segments={segments} moment={moment} /> : null}
            {view === "groups" ? <GroupsView draft={draft} /> : null}
            {view === "bracket" ? <BracketView draft={draft} segments={segments} /> : null}
          </div>
        </div>
      )}
    </main>
  );
}
