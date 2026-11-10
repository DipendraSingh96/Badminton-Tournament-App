"use client";

import type { ReactNode } from "react";
import type { PlanDraft } from "@/lib/tournament/draft";
import { cn } from "@/lib/utils";
import { BracketView } from "./bracket-view";
import { DrawView } from "./draw-view";
import { EntriesView } from "./entries-view";
import { GroupsView } from "./groups-view";
import type { Update } from "./plan-editor";
import { TeamsView } from "./teams-view";
import type { LocalSegment } from "./timeline";

export type DrawStageView = "entries" | "draw" | "courts" | "teams" | "groups" | "bracket";

/** The Draw stage's pages, in order; those not built yet say when they arrive. */
export const DRAW_VIEWS: { value: DrawStageView; label: string; comingIn?: string }[] = [
  { value: "entries", label: "Entries" },
  { value: "draw", label: "Draw" },
  { value: "teams", label: "Teams" },
  { value: "groups", label: "Group stage" },
  { value: "bracket", label: "KO stage" },
  { value: "courts", label: "Schedule" },
];

/** The Draw stage: entries, the draw, and the post-draw views (built step by step). */
export function DrawStage({
  draft,
  update,
  locked,
  courts,
  segments,
  moment,
  view,
  onViewChange,
}: {
  draft: PlanDraft;
  update: Update;
  locked: boolean;
  /** The schedule's matches and the timeline's playhead, for the Teams view. */
  segments: LocalSegment[];
  moment: number | null;
  /** The Schedule page: the venue and timeline with names, and the court panel. */
  courts: ReactNode;
  /** The page open; kept by the editor so the top bar knows it. */
  view: DrawStageView;
  onViewChange: (view: DrawStageView) => void;
}) {
  return (
    <main className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 px-(--pane-x)">
      <nav aria-label="Draw views" className="mx-auto flex w-full max-w-[960px] items-end gap-4 border-b bg-background">
        {DRAW_VIEWS.map((v) => (
          <button
            key={v.value}
            type="button"
            aria-current={view === v.value ? "page" : undefined}
            disabled={v.comingIn !== undefined}
            title={v.comingIn}
            onClick={() => onViewChange(v.value)}
            className={cn(
              "-mb-px border-b-[3px] py-3 text-sm font-semibold transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50",
              view === v.value ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {v.label}
          </button>
        ))}
      </nav>
      </div>
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
        <div className="scroll-pane min-h-0 flex-1 overflow-y-auto px-(--pane-x)">
          <div className="mx-auto flex w-full max-w-[960px] flex-col gap-4 pb-4 pt-4">
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
