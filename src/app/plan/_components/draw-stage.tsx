"use client";

import type { ReactNode } from "react";
import type { PlanDraft } from "@/lib/tournament/draft";
import { cn } from "@/lib/utils";
import { BracketView } from "./bracket-view";
import { DrawView } from "./draw-view";
import { EntriesView } from "./entries-view";
import type { Update } from "./plan-editor";
import type { LocalSegment } from "./timeline";

export type DrawStageView = "entries" | "draw" | "courts" | "bracket" | "resources";

/**
 * The Draw stage's pages, in order. Teams are in the side panel; the group
 * tables (standings) wait for Live, where scores fill them.
 */
export const DRAW_VIEWS: { value: DrawStageView; label: string; comingIn?: string }[] = [
  { value: "entries", label: "Entries" },
  { value: "draw", label: "Draw" },
  { value: "bracket", label: "KO stage" },
  { value: "courts", label: "Schedule" },
  { value: "resources", label: "Resources" },
];

/** The Draw stage: entries, the draw, and the post-draw views (built step by step). */
export function DrawStage({
  draft,
  update,
  locked,
  courts,
  segments,
  view,
  onViewChange,
  resources,
}: {
  draft: PlanDraft;
  update: Update;
  locked: boolean;
  /** The schedule's matches, for the bracket's times and courts. */
  segments: LocalSegment[];
  /** The Schedule page: the venue and timeline with names, and the court panel. */
  courts: ReactNode;
  /** The page open; kept by the editor so the top bar knows it. */
  view: DrawStageView;
  onViewChange: (view: DrawStageView) => void;
  /** The Resources page: getting ready for the day. Built by the editor, which knows the plan's counts. */
  resources: ReactNode;
}) {
  return (
    <main className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="shrink-0 px-(--pane-x)">
      <nav aria-label="Draw views" className="mx-auto flex w-full max-w-[960px] items-end gap-4 border-b">
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
          <div className="shrink-0 pt-4" />
          {courts}
        </>
      ) : (
        <div className="scroll-pane min-h-0 flex-1 overflow-y-auto px-(--pane-x)">
          <div className="@container mx-auto flex w-full max-w-[960px] flex-col gap-4 pb-4 pt-4">
            {view === "entries" ? <EntriesView draft={draft} update={update} locked={locked} /> : null}
            {view === "draw" ? <DrawView draft={draft} update={update} /> : null}
            {view === "bracket" ? <BracketView draft={draft} segments={segments} /> : null}
            {view === "resources" ? resources : null}
          </div>
        </div>
      )}
    </main>
  );
}
