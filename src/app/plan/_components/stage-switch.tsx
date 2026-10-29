"use client";

import { CheckIcon } from "@phosphor-icons/react";
import type { TournamentStage } from "@/lib/tournament/draft";
import { cn } from "@/lib/utils";

export const STAGES: { value: TournamentStage; label: string }[] = [
  { value: "plan", label: "Plan" },
  { value: "draw", label: "Draw" },
  { value: "live", label: "Live" },
  { value: "results", label: "Results" },
];

/** Stages that can't be reached yet in this build, and why. */
const NOT_YET: Partial<Record<TournamentStage, string>> = {
  live: "Live comes with the next slice: scores, live standings and the moving bracket.",
  results: "Results come after Live.",
};

/**
 * Where the tournament is, as steps: Plan, Draw, Live, Results. Any stage
 * reached so far can be viewed; the next one is reached by choosing it (which
 * asks first). Stages after that wait.
 */
export function StageSwitch({
  stage,
  view,
  onView,
  onAdvance,
}: {
  /** The furthest stage reached. */
  stage: TournamentStage;
  /** The stage being looked at. */
  view: TournamentStage;
  onView: (stage: TournamentStage) => void;
  /** Move the tournament on to the next stage. */
  onAdvance: (stage: TournamentStage) => void;
}) {
  const reached = STAGES.findIndex((s) => s.value === stage);
  return (
    <nav aria-label="Stages" className="flex gap-1 rounded-md bg-inset p-1">
      {STAGES.map((s, i) => {
        const done = i < reached;
        const next = i === reached + 1;
        const blocked = (i > reached && !next) || (next && NOT_YET[s.value] !== undefined);
        const title = blocked ? (NOT_YET[s.value] ?? `Reach ${STAGES[i - 1]!.label} first.`) : next ? `Move on to ${s.label}` : undefined;
        return (
          <button
            key={s.value}
            type="button"
            aria-current={view === s.value ? "step" : undefined}
            disabled={blocked}
            title={title}
            onClick={() => (next ? onAdvance(s.value) : onView(s.value))}
            className={cn(
              "flex h-6 items-center gap-1 rounded-sm px-3 text-sm font-semibold transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50",
              view === s.value
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-card hover:text-foreground disabled:hover:bg-transparent",
            )}
          >
            {done ? <CheckIcon weight="bold" className="size-3.5" aria-hidden="true" /> : null}
            {s.label}
            {done ? <span className="sr-only"> (done)</span> : null}
          </button>
        );
      })}
    </nav>
  );
}
