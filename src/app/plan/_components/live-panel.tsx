"use client";

import { ArrowLeftIcon, PlayIcon, WarningIcon, XIcon } from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm";
import { matchOutcome, rulesFor, type TournamentInputs } from "@/engine";
import type { PlanDraft } from "@/lib/tournament/draft";
import { entryForSlot, sidePlayers, sidesChanged } from "@/lib/tournament/entries";
import { callUp, courtQueues, finishGame, gameState, reopenGame, setScore, startGame } from "@/lib/tournament/live";
import { clock } from "@/lib/tournament/time";
import { cn } from "@/lib/utils";
import { scoreText } from "./court-board";
import { courtOf } from "./draw-panel";
import { IconButton } from "./fields";
import { categoryName } from "./labels";
import type { Update } from "./plan-editor";
import { matchText, sideLabel, type LocalSegment } from "./timeline";

/** How many games the call-up lists: the next few, not the whole day. */
const CALL_UP = 12;

/** Who of a game's players hasn't checked in. */
function notArrived(draft: PlanDraft, segment: LocalSegment): string[] {
  return [segment.match.home, segment.match.away]
    .flatMap((slot) => sidePlayers(draft, segment.match.categoryId, slot, segment.match.rubber?.number))
    .filter((p) => p.attendance !== "arrived")
    .map((p) => p.name.trim() || "A player");
}

/** The two entries playing a game, home then away; null until both are known (a knockout game's come from results). */
function sidesOf(draft: PlanDraft, segment: LocalSegment): [string, string] | null {
  const home = entryForSlot(draft, segment.match.categoryId, segment.match.home)?.id;
  const away = entryForSlot(draft, segment.match.categoryId, segment.match.away)?.id;
  return home && away ? [home, away] : null;
}

/** Both sides are known. */
function sidesKnown(draft: PlanDraft, segment: LocalSegment): boolean {
  return sidesOf(draft, segment) !== null;
}

/** Ready, or who is still to check in. */
function Readiness({ draft, segment }: { draft: PlanDraft; segment: LocalSegment }) {
  if (!sidesKnown(draft, segment)) return null;
  const waiting = notArrived(draft, segment);
  return waiting.length === 0 ? (
    <Badge variant="fits">Ready</Badge>
  ) : (
    <Badge variant="tight" title={`Not checked in: ${waiting.join(", ")}`}>
      {waiting.length} not checked in
    </Badge>
  );
}

/** A game's when and what, on one line: "09:15 · Court 3" and "Group A · Wave 2 · Mixed doubles". */
function GameLine({ draft, segment, court = true }: { draft: PlanDraft; segment: LocalSegment; court?: boolean }) {
  const { where, rubber } = matchText(draft, segment.match);
  return (
    <span className="flex justify-between gap-2 text-xs text-muted-foreground tabular-nums">
      <span className="shrink-0">
        {clock(segment.from)}
        {court ? ` · Court ${courtOf(draft, segment.courtId) ?? "?"}` : ""}
      </span>
      <span className="truncate">
        {[where, rubber?.replace(/: .*/, ""), draft.categories.length > 1 ? categoryName(draft, segment.match.categoryId) : null]
          .filter(Boolean)
          .join(" · ")}
      </span>
    </span>
  );
}

/** "Ann Lee / Raj Shah v Mo Ali / Li Wei", each side cut short if long. */
function Sides({ draft, segment }: { draft: PlanDraft; segment: LocalSegment }) {
  const home = sideLabel(draft, segment.match, segment.match.home);
  const away = sideLabel(draft, segment.match, segment.match.away);
  return (
    <span className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-baseline gap-2 text-sm font-semibold">
      <span className="truncate" title={home}>
        {home}
      </span>
      <span className="text-xs font-normal text-muted-foreground">v</span>
      <span className="truncate" title={away}>
        {away}
      </span>
    </span>
  );
}

/**
 * The Live stage's side panel, on the Court board: the call-up list, or a
 * chosen court with its current game (and its score entry), what's next on
 * it, and what it has played. Built like the Plan workbench.
 */
export function LivePanel({
  draft,
  update,
  inputs,
  segments,
  courtId,
  onCourt,
  onFold,
}: {
  draft: PlanDraft;
  update: Update;
  /** The plan as the engine reads it: each category's rules for scoring. Null if the plan can't be read. */
  inputs: TournamentInputs | null;
  segments: LocalSegment[];
  /** The court chosen on the board; null shows the call-up. */
  courtId: string | null;
  onCourt: (courtId: string | null) => void;
  onFold: () => void;
}) {
  const number = courtId ? courtOf(draft, courtId) : null;
  const shown = number !== null && courtId ? courtId : null;
  return (
    <>
      <div className="flex min-h-8 shrink-0 items-center gap-2 px-4 pb-3">
        {shown ? (
          <IconButton label="Back to the call-up" side="bottom" onClick={() => onCourt(null)}>
            <ArrowLeftIcon />
          </IconButton>
        ) : null}
        <h2 className="heading-card min-w-0 flex-1 truncate">{shown ? `Court ${number}` : "Call-up"}</h2>
        <IconButton label="Hide panel" side="left" aria-expanded onClick={onFold}>
          <XIcon />
        </IconButton>
      </div>
      <div className="scroll-pane relative min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        {shown ? (
          <CourtView key={shown} draft={draft} update={update} inputs={inputs} segments={segments} courtId={shown} />
        ) : (
          <CallUpList draft={draft} segments={segments} onCourt={onCourt} />
        )}
      </div>
    </>
  );
}

function CallUpList({ draft, segments, onCourt }: { draft: PlanDraft; segments: LocalSegment[]; onCourt: (courtId: string) => void }) {
  const order = draft.frame.halls.flatMap((h) => h.courts.map((c) => c.id));
  const waiting = callUp(segments, draft.results, order);
  if (segments.length === 0) return <p className="text-sm text-muted-foreground">No games on the schedule.</p>;
  if (waiting.length === 0) return <p className="text-sm text-muted-foreground">Every game has been called.</p>;
  return (
    <section aria-label="Call-up" className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">The next games to call, soonest first. Choose one to open its court.</p>
      <ol className="flex flex-col gap-1">
        {waiting.slice(0, CALL_UP).map((s) => (
          <li key={s.id}>
            <button
              type="button"
              onClick={() => onCourt(s.courtId)}
              className="flex w-full flex-col gap-1 rounded-lg bg-card-system px-3 py-2 text-left transition-colors outline-none hover:bg-(--field-raised) focus-visible:ring-2 focus-visible:ring-ring"
            >
              <GameLine draft={draft} segment={s} />
              <Sides draft={draft} segment={s} />
              <span className="flex">
                <Readiness draft={draft} segment={s} />
              </span>
            </button>
          </li>
        ))}
      </ol>
      {waiting.length > CALL_UP ? (
        <p className="text-xs text-muted-foreground tabular-nums">And {waiting.length - CALL_UP} more after these.</p>
      ) : null}
    </section>
  );
}

function CourtView({
  draft,
  update,
  inputs,
  segments,
  courtId,
}: {
  draft: PlanDraft;
  update: Update;
  inputs: TournamentInputs | null;
  segments: LocalSegment[];
  courtId: string;
}) {
  const queue = useMemo(() => courtQueues(segments, draft.results).get(courtId) ?? null, [segments, draft.results, courtId]);
  // A game opened from the lists below, to score it out of turn or correct it.
  const [openId, setOpenId] = useState<string | null>(null);
  if (!queue) return <p className="text-sm text-muted-foreground">No games on this court.</p>;
  const list = (title: string, games: LocalSegment[]) =>
    games.length === 0 ? null : (
      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold">
          {title} ({games.length})
        </h3>
        <ol className="flex flex-col gap-1">
          {games.map((s) =>
            s.id === openId ? (
              <li key={s.id}>
                <GameEditor draft={draft} update={update} inputs={inputs} segment={s} onClose={() => setOpenId(null)} />
              </li>
            ) : (
              <li key={s.id}>
                <button
                  type="button"
                  aria-expanded={false}
                  onClick={() => setOpenId(s.id)}
                  className="flex w-full flex-col gap-1 rounded-lg bg-card-system px-3 py-2 text-left transition-colors outline-none hover:bg-(--field-raised) focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <GameLine draft={draft} segment={s} court={false} />
                  <Sides draft={draft} segment={s} />
                  {gameState(draft.results, s.id) === "finished" ? (
                    <span className="font-display text-xl leading-none font-bold tabular-nums">{scoreText(draft.results[s.id]?.games)}</span>
                  ) : null}
                </button>
              </li>
            ),
          )}
        </ol>
      </div>
    );
  return (
    <section aria-label="This court" className="flex flex-col gap-4">
      {queue.current ? (
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold">{gameState(draft.results, queue.current.id) === "onCourt" ? "On court" : "Up next"}</h3>
          <GameEditor draft={draft} update={update} inputs={inputs} segment={queue.current} />
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">This court has played all its games.</p>
      )}
      {list("Next on this court", queue.next)}
      {list("Played on this court", queue.played)}
    </section>
  );
}

/**
 * One game, to run it: start it, enter each game's two scores, and finish
 * the match once the scores make a result. A finished match shows its score
 * and can be reopened to correct it.
 */
function GameEditor({
  draft,
  update,
  inputs,
  segment,
  onClose,
}: {
  draft: PlanDraft;
  update: Update;
  inputs: TournamentInputs | null;
  segment: LocalSegment;
  /** Shown for a game opened out of turn: closes it again. */
  onClose?: () => void;
}) {
  const confirm = useConfirm();
  const { match, id } = segment;
  const category = inputs?.categories.find((c) => c.id === match.categoryId);
  const rules = inputs && category ? rulesFor(inputs, category, match.stage) : undefined;
  const result = draft.results[id];
  const state = gameState(draft.results, id);
  const playing = sidesOf(draft, segment);
  // A game already started keeps its score entry even if a correction has since left a side open.
  const known = playing !== null || result !== undefined;
  const changed = sidesChanged(draft, match.categoryId, id, match.home, match.away);
  const home = sideLabel(draft, match, match.home);
  const away = sideLabel(draft, match, match.away);
  const now = () => new Date().toISOString();

  const body = !known ? (
    <p className="text-sm text-muted-foreground">
      {match.stage === "group"
        ? "The draw hasn't placed both sides yet."
        : "The sides come from results still to be played: a group's final places, or the winner of an earlier match."}{" "}
      This game can&apos;t be started yet.
    </p>
  ) : !rules ? (
    <p className="text-sm text-over-text">This category&apos;s scoring rules for the stage aren&apos;t set, so scores can&apos;t be checked.</p>
  ) : (
    (() => {
      const outcome = matchOutcome(rules, result?.games ?? []);
      const finished = state === "finished";
      return (
        <>
          <div className="grid grid-cols-[auto_minmax(0,1fr)_minmax(0,1fr)] items-center gap-x-2 gap-y-2">
            <span />
            <span className="truncate text-xs text-muted-foreground" title={home}>
              {home}
            </span>
            <span className="truncate text-xs text-muted-foreground" title={away}>
              {away}
            </span>
            {outcome.games.map((game, g) => {
              const score = result?.games[g] ?? [null, null];
              // A game after the match is won, or after one still open, isn't played.
              const closed = finished || (g > 0 && (outcome.games[g - 1]!.winner === null || (outcome.winner !== null && score[0] === null && score[1] === null)));
              return (
                <div key={g} className="col-span-3 grid grid-cols-subgrid items-center gap-x-2">
                  <span className="text-xs text-muted-foreground tabular-nums">{rules.bestOf === 1 ? "Score" : `Game ${g + 1}`}</span>
                  {([0, 1] as const).map((side) => (
                    <input
                      key={side}
                      type="number"
                      inputMode="numeric"
                      min={0}
                      step={1}
                      disabled={closed}
                      value={score[side] ?? ""}
                      aria-label={`${rules.bestOf === 1 ? "Score" : `Game ${g + 1}`}, ${side === 0 ? home : away}`}
                      aria-invalid={game.problem !== null || undefined}
                      data-slot="input"
                      onChange={(e) => {
                        const raw = e.target.value;
                        const value = raw === "" ? null : Number(raw);
                        update((d) => setScore(d, id, g, side, value !== null && Number.isNaN(value) ? null : value, now(), playing ?? undefined));
                      }}
                      className={cn(
                        "h-10 w-full min-w-0 [appearance:textfield] rounded-md border text-center font-display text-xl tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
                        game.winner === (side === 0 ? "home" : "away") ? "font-bold" : "font-medium",
                      )}
                    />
                  ))}
                  {game.problem ? <p className="col-span-2 col-start-2 text-xs text-over-text">{game.problem}</p> : null}
                </div>
              );
            })}
          </div>
          {outcome.winner ? (
            <p className="text-sm">
              <span className="font-semibold">{outcome.winner === "home" ? home : away}</span>{" "}
              <span className="text-muted-foreground">
                {finished ? "won" : "wins"}
                {rules.bestOf > 1 ? ` ${outcome.home}–${outcome.away}` : ""}
              </span>
            </p>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            {state === "waiting" ? (
              <Button variant="outline" size="sm" onClick={() => update((d) => startGame(d, id, now(), playing ?? undefined))}>
                <PlayIcon /> Start game
              </Button>
            ) : null}
            {finished ? (
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  if (
                    await confirm({
                      title: "Correct this score?",
                      body: "The match goes back on court so its score can be changed, then finished again.",
                      action: "Correct score",
                    })
                  )
                    update((d) => reopenGame(d, id));
                }}
              >
                Correct score
              </Button>
            ) : (
              <Button size="sm" disabled={!outcome.finished} onClick={() => update((d) => finishGame(d, id, now()))}>
                Finish match
              </Button>
            )}
            {state !== "finished" ? <Readiness draft={draft} segment={segment} /> : null}
          </div>
        </>
      );
    })()
  );

  return (
    <div className="flex flex-col gap-3 rounded-lg bg-card-system p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <GameLine draft={draft} segment={segment} court={false} />
          <Sides draft={draft} segment={segment} />
        </div>
        {onClose ? (
          <IconButton label="Close this game" side="left" onClick={onClose}>
            <XIcon />
          </IconButton>
        ) : null}
      </div>
      {changed ? (
        <p className="flex items-start gap-2 text-xs text-over-text">
          <WarningIcon className="mt-0.5 size-3 shrink-0" aria-hidden="true" />
          The sides have changed since this was played: a corrected score put someone else in this game.
        </p>
      ) : null}
      {body}
    </div>
  );
}
