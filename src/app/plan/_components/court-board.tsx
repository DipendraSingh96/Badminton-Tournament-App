"use client";

import { MagnifyingGlassMinusIcon, MagnifyingGlassPlusIcon } from "@phosphor-icons/react";
import { useContext, useMemo } from "react";
import { courtNumber, hallName, type PlanDraft } from "@/lib/tournament/draft";
import { awardMark, courtQueues, gameState, scoreText } from "@/lib/tournament/live";
import {
  COURT_SIZES,
  COURT_WIDTH,
  CourtCard,
  CourtSizeContext,
  VenueFixedContext,
  type CourtLive,
} from "./court-card";
import { useLiveAttention } from "./attention";
import { CourtStrip } from "./court-strip";
import { IconButton } from "./fields";
import type { Update } from "./plan-editor";
import { playingStatus, type CourtStatus, type LocalSegment } from "./timeline";

export { awardMark, scoreText };

/**
 * The Live stage's Court board: every court with the game on it now (the
 * first it hasn't finished), its score so far, and whether it's on court, up
 * next, free or done. The venue is as planned and can't be changed here; a
 * click on a court opens it in the side panel, where scores are entered.
 */
export function CourtBoard({ draft, update, segments }: { draft: PlanDraft; update: Update; segments: LocalSegment[] }) {
  const queues = useMemo(() => courtQueues(segments, draft.results), [segments, draft.results]);
  const attention = useLiveAttention();
  const { size, setSize } = useContext(CourtSizeContext);
  const sizeStep = COURT_SIZES.indexOf(size);
  const played = segments.filter((s) => gameState(draft.results, s.id) === "finished").length;
  const onCourt = segments.filter((s) => gameState(draft.results, s.id) === "onCourt").length;

  return (
    <VenueFixedContext value>
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h2 className="heading-card">Court board</h2>
            <p className="text-sm tabular-nums" aria-live="polite">
              <span className="font-semibold">
                {played} of {segments.length}
              </span>{" "}
              <span className="text-muted-foreground">games played</span>
              {onCourt > 0 ? <span className="text-muted-foreground"> · {onCourt} on court</span> : null}
            </p>
          </div>
          <div className="flex items-center gap-1">
            <IconButton label="Smaller courts, to see more halls" disabled={sizeStep === 0} onClick={() => setSize(COURT_SIZES[sizeStep - 1]!)}>
              <MagnifyingGlassMinusIcon />
            </IconButton>
            <IconButton
              label="Larger courts, with more detail"
              disabled={sizeStep === COURT_SIZES.length - 1}
              onClick={() => setSize(COURT_SIZES[sizeStep + 1]!)}
            >
              <MagnifyingGlassPlusIcon />
            </IconButton>
          </div>
        </div>

        {draft.frame.halls.map((hall, h) => (
          <section key={hall.id} aria-label={hallName(hall, h)} className="flex flex-col gap-3 border-t pt-4 first:border-t-0 first:pt-0">
            <h3 className="heading-card">{hallName(hall, h)}</h3>
            <CourtStrip count={hall.courts.length} width={COURT_WIDTH[size]} reversed={Boolean(hall.flipped)}>
              {(hall.flipped ? [...hall.courts.keys()].reverse() : [...hall.courts.keys()]).map((c) => {
                const court = hall.courts[c]!;
                const queue = queues.get(court.id);
                const current = queue?.current ?? null;
                const status: CourtStatus = current ? playingStatus(draft, current) : { kind: "free" };
                const live: CourtLive = current
                  ? {
                      state: gameState(draft.results, current.id) === "onCourt" ? "onCourt" : "upNext",
                      timing: attention?.timing(current.id) ?? undefined,
                      score: scoreText(draft.results[current.id]?.games, draft.results[current.id]?.award),
                    }
                  : { state: queue && queue.played.length > 0 ? "done" : "free", score: null };
                return (
                  <CourtCard
                    key={court.id}
                    hall={hall}
                    hallIndex={h}
                    courtIndex={c}
                    number={courtNumber(draft.frame.halls, h, c)}
                    status={status}
                    groups={null}
                    allGroups={[]}
                    update={update}
                    live={live}
                  />
                );
              })}
            </CourtStrip>
          </section>
        ))}
      </div>
    </VenueFixedContext>
  );
}
