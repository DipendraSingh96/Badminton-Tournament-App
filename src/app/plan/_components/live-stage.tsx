"use client";

import { useContext, type ReactNode } from "react";
import type { PlanDraft } from "@/lib/tournament/draft";
import { cn } from "@/lib/utils";
import { CheckInView } from "./check-in-view";
import { ChangesView } from "./changes-view";
import { CourtSelectionContext } from "./court-card";
import type { LiveFilter } from "./live-panel";
import type { Update } from "./plan-editor";
import { StandingsView } from "./standings-view";
import type { LocalSegment } from "./timeline";

export type LiveStageView = "checkin" | "board" | "standings" | "knockout" | "changes";

/** The Live stage's pages, in the order the day uses them; those not built yet say so. */
export const LIVE_VIEWS: { value: LiveStageView; label: string; comingIn?: string }[] = [
  { value: "checkin", label: "Check-in" },
  { value: "board", label: "Court board" },
  { value: "standings", label: "Group stage standings" },
  { value: "knockout", label: "Knockout stage" },
  { value: "changes", label: "Changes" },
];

/**
 * The Live stage: the day itself, run from the desk. Laid out like the Draw
 * stage (a row of pages over the central column). Nothing about money is
 * shown anywhere in it.
 */
export function LiveStage({
  draft,
  update,
  segments,
  view,
  onViewChange,
  dock,
  courtBoard,
  filter,
  onFilter,
}: {
  draft: PlanDraft;
  update: Update;
  /** The schedule's matches: who plays first, and where. */
  segments: LocalSegment[];
  /** The page open; kept by the editor. */
  view: LiveStageView;
  onViewChange: (view: LiveStageView) => void;
  /** Puts a page over the timeline, which the editor shares with Plan and Draw. */
  dock: (content: ReactNode) => ReactNode;
  courtBoard: ReactNode;
  /** What the side panel's games are narrowed to: a court or a group chosen here. */
  filter: LiveFilter;
  onFilter: (filter: LiveFilter) => void;
}) {
  const selection = useContext(CourtSelectionContext);
  return (
    <main
      className="flex min-h-0 min-w-0 flex-1 flex-col"
      // A click anywhere here that isn't on a court or a group goes back to every game.
      onClick={(e) => {
        const target = e.target as Element;
        if (filter === null || !e.currentTarget.contains(target)) return;
        if (target.closest("[data-court-card], [data-group-card], [data-court-id]")) return;
        onFilter(null);
      }}
    >
      <div className="shrink-0 px-(--pane-x)">
        <nav aria-label="Live views" className="mx-auto flex w-full max-w-[960px] items-end gap-4 border-b">
          {LIVE_VIEWS.map((v) => (
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
      <div className="min-h-0 min-w-0 flex-1 pt-4">
        {dock(
          view === "board" ? (
            courtBoard
          ) : (
            <>
          {view === "checkin" ? <CheckInView draft={draft} update={update} segments={segments} /> : null}
          {view === "changes" ? <ChangesView draft={draft} update={update} /> : null}
          {view === "standings" || view === "knockout" ? (
            <StandingsView
              part={view === "standings" ? "groups" : "knockout"}
              draft={draft}
              update={update}
              segments={segments}
              group={filter?.kind === "group" ? filter : null}
              onGroup={(categoryId, group) => onFilter({ kind: "group", categoryId, group })}
              onCourt={(courtId) => {
                onViewChange("board");
                selection?.onSelect(courtId);
              }}
            />
          ) : null}
            </>
          ),
        )}
      </div>
    </main>
  );
}
