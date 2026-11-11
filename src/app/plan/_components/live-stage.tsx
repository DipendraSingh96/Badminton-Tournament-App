"use client";

import type { PlanDraft } from "@/lib/tournament/draft";
import { cn } from "@/lib/utils";
import { CheckInView } from "./check-in-view";
import type { Update } from "./plan-editor";
import type { LocalSegment } from "./timeline";

export type LiveStageView = "checkin" | "board" | "standings" | "changes";

/** The Live stage's pages, in the order the day uses them; those not built yet say so. */
export const LIVE_VIEWS: { value: LiveStageView; label: string; comingIn?: string }[] = [
  { value: "checkin", label: "Check-in" },
  { value: "board", label: "Court board", comingIn: "Coming in the next round: courts, the call-up list and score entry." },
  { value: "standings", label: "Standings and bracket", comingIn: "Coming after the court board: group tables and the knockout, filling from scores." },
  { value: "changes", label: "Changes", comingIn: "Coming after standings: withdrawals, walkovers, court moves and score corrections, with a log." },
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
}: {
  draft: PlanDraft;
  update: Update;
  /** The schedule's matches: who plays first, and where. */
  segments: LocalSegment[];
  /** The page open; kept by the editor. */
  view: LiveStageView;
  onViewChange: (view: LiveStageView) => void;
}) {
  return (
    <main className="flex min-h-0 flex-1 flex-col">
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
      <div className="scroll-pane min-h-0 flex-1 overflow-y-auto px-(--pane-x)">
        <div className="mx-auto flex w-full max-w-[960px] flex-col gap-4 pt-4 pb-4">
          {view === "checkin" ? <CheckInView draft={draft} update={update} segments={segments} /> : null}
        </div>
      </div>
    </main>
  );
}
