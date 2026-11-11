"use client";

import { CaretDownIcon, PlayIcon, WarningIcon, XIcon } from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { groupLetter, matchOutcome, rulesFor, type TournamentInputs } from "@/engine";
import { entryName, type PlanDraft } from "@/lib/tournament/draft";
import { finishMatch, moveGame } from "@/lib/tournament/changes";
import { entryForSlot, matchPlayers, sidesChanged } from "@/lib/tournament/entries";
import { boardSections, courtQueues, gameState, reopenGame, scoreText, setScore, startGame } from "@/lib/tournament/live";
import { clock } from "@/lib/tournament/time";
import { cn } from "@/lib/utils";
import { PlayerCheckIn } from "./attendance";
import { TeamDetail, TeamList, TeamName, TeamOpenContext, courtOf } from "./draw-panel";
import { IconButton } from "./fields";
import { AwardDialog } from "./live-dialogs";
import { categoryName } from "./labels";
import type { Update } from "./plan-editor";
import { matchText, sideLabel, type LocalSegment } from "./timeline";
import { useWatchOnly } from "./watch-only";

/** How many waiting games the Games tab lists after the courts' own: the next few, not the whole day. */
const UP_NEXT = 12;

/** What the main area has narrowed the Games tab to: a court, or a group; null for every game. */
export type LiveFilter =
  // A court chosen on the board; with `game`, a game chosen on the timeline (its court, with that game opened).
  | { kind: "court"; id: string; game?: string }
  | { kind: "group"; categoryId: string; group: number }
  | null;

export type LiveTab = "games" | "entries";

/** May this game be played on that court? (A group game stays in its hall; a knockout game in a hall with its stage.) */
export type CanMove = (segment: LocalSegment, courtId: string) => boolean;

/** The two entries playing a game, home then away; null until both are known (a knockout game's come from results). */
function sidesOf(draft: PlanDraft, segment: LocalSegment): [string, string] | null {
  const home = entryForSlot(draft, segment.match.categoryId, segment.match.home)?.id;
  const away = entryForSlot(draft, segment.match.categoryId, segment.match.away)?.id;
  return home && away ? [home, away] : null;
}

/** A game's when and what, on one line: "09:15 · Court 3" and "Group A · Wave 2 · Mixed doubles". */
function GameLine({ draft, segment, court = true }: { draft: PlanDraft; segment: LocalSegment; court?: boolean }) {
  const { where, rubber } = matchText(draft, segment.match);
  return (
    <span className="flex min-w-0 flex-1 justify-between gap-2 text-xs text-muted-foreground tabular-nums">
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

/** "Ann Lee / Raj Shah v Mo Ali / Li Wei": each side opens its entry under the card. */
function Sides({ draft, segment }: { draft: PlanDraft; segment: LocalSegment }) {
  const side = (slot: string) => {
    const label = sideLabel(draft, segment.match, slot);
    return (
      <TeamName entryId={entryForSlot(draft, segment.match.categoryId, slot)?.id} className="truncate">
        <span title={label}>{label}</span>
      </TeamName>
    );
  };
  return (
    <span className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-baseline gap-2 text-sm font-semibold">
      {side(segment.match.home)}
      <span className="text-xs font-normal text-muted-foreground">v</span>
      {side(segment.match.away)}
    </span>
  );
}

/**
 * The Live stage's side panel, on every Live page. Games: what is on court,
 * the courts standing free and what is up next, each game opening in place to
 * be started, scored and finished; narrowed to a court or a group when one is
 * chosen in the main area. Entries: everyone entered, by group.
 */
export function LivePanel({
  draft,
  update,
  inputs,
  segments,
  tab,
  onTab,
  filter,
  onFilter,
  entryId,
  onEntry,
  canMove,
  onFold,
}: {
  draft: PlanDraft;
  update: Update;
  /** The plan as the engine reads it: each category's rules for scoring. Null if the plan can't be read. */
  inputs: TournamentInputs | null;
  segments: LocalSegment[];
  tab: LiveTab;
  onTab: (tab: LiveTab) => void;
  filter: LiveFilter;
  onFilter: (filter: LiveFilter) => void;
  /** The entry opened in the Entries tab. */
  entryId: string | null;
  onEntry: (entryId: string | null) => void;
  canMove: CanMove;
  onFold: () => void;
}) {
  return (
    <Tabs value={tab} onValueChange={(value) => onTab(value as LiveTab)} className="min-h-0 flex-1 gap-0">
      {/* The soft divider runs under the tabs and the fold button alike. */}
      <div className="mx-4 flex shrink-0 items-center gap-2 shadow-[inset_0_-1px_0_var(--border)]">
        <TabsList variant="line" className="min-w-0 flex-1 justify-start shadow-none">
          <TabsTrigger value="games">Games</TabsTrigger>
          <TabsTrigger value="entries">{draft.unit === "team" ? "Teams" : "Entries"}</TabsTrigger>
        </TabsList>
        <IconButton label="Hide panel" side="left" aria-expanded onClick={onFold}>
          <XIcon />
        </IconButton>
      </div>
      <div className="scroll-pane relative min-h-0 flex-1 overflow-y-auto px-4 pt-4 pb-4">
        <TabsContent value="games">
          <GamesTab
            // A court or a group chosen in the main area starts its own list.
            key={filter ? JSON.stringify(filter) : "all"}
            draft={draft}
            update={update}
            inputs={inputs}
            segments={segments}
            filter={filter}
            onFilter={onFilter}
            canMove={canMove}
          />
        </TabsContent>
        <TabsContent value="entries">
          <TeamList
            draft={draft}
            update={update}
            segments={segments}
            at={-Infinity}
            live
            openId={entryId}
            // A second click on the open one closes it.
            onToggle={(id) => onEntry(id === entryId ? null : id)}
          />
        </TabsContent>
      </div>
    </Tabs>
  );
}

function GamesTab({
  draft,
  update,
  inputs,
  segments,
  filter,
  onFilter,
  canMove,
}: {
  draft: PlanDraft;
  update: Update;
  inputs: TournamentInputs | null;
  segments: LocalSegment[];
  filter: LiveFilter;
  onFilter: (filter: LiveFilter) => void;
  canMove: CanMove;
}) {
  const order = useMemo(() => draft.frame.halls.flatMap((h) => h.courts.map((c) => c.id)), [draft.frame.halls]);
  const board = useMemo(() => boardSections(segments, draft.results, order), [segments, draft.results, order]);
  const queue = filter?.kind === "court" ? (courtQueues(segments, draft.results).get(filter.id) ?? null) : null;
  // The game opened to run it; a chosen court opens on its current game.
  const [openId, setOpenId] = useState<string | null>((filter?.kind === "court" ? filter.game : undefined) ?? queue?.current?.id ?? null);
  // A game chosen on the timeline may be far down its court's list: bring it into view.
  const root = useRef<HTMLElement>(null);
  const chosen = filter?.kind === "court" ? (filter.game ?? null) : null;
  useEffect(() => {
    if (chosen) root.current?.querySelector(`[data-game="${CSS.escape(chosen)}"]`)?.scrollIntoView({ block: "nearest" });
  }, [chosen]);
  // The waiting game being dragged to a free court.
  const [dragging, setDragging] = useState<LocalSegment | null>(null);

  const move = (segment: LocalSegment, courtId: string) => {
    const before = board.free.find((f) => f.courtId === courtId)?.next?.id ?? null;
    update((d) => void moveGame(d, { matchId: segment.id, fromCourtId: segment.courtId, target: { courtId, before }, now: new Date().toISOString() }));
  };
  /** The free courts a waiting game could go to (not the one it is already next on). */
  const courtsFor = (segment: LocalSegment) =>
    board.free
      .filter((f) => f.next?.id !== segment.id && canMove(segment, f.courtId))
      .map((f) => ({ id: f.courtId, number: courtOf(draft, f.courtId) ?? 0 }));

  const card = (s: LocalSegment, court = true) => (
    <GameCard
      draft={draft}
      update={update}
      inputs={inputs}
      segments={segments}
      segment={s}
      court={court}
      open={s.id === openId}
      onToggle={() => setOpenId(s.id === openId ? null : s.id)}
      freeCourts={gameState(draft.results, s.id) === "waiting" ? courtsFor(s) : []}
      onMove={(courtId) => move(s, courtId)}
      onDrag={setDragging}
    />
  );
  const list = (title: string, games: LocalSegment[], court = true, more = 0) =>
    games.length === 0 ? null : (
      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold">
          {title} <span className="font-normal text-muted-foreground tabular-nums">({games.length + more})</span>
        </h3>
        <ol className="flex flex-col gap-1">
          {games.map((s) => (
            <li key={s.id}>{card(s, court)}</li>
          ))}
        </ol>
        {more > 0 ? <p className="text-xs text-muted-foreground tabular-nums">And {more} more after these.</p> : null}
      </div>
    );
  const narrowed = (label: string, body: ReactNode) => (
    <section ref={root} aria-label={label} className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2 rounded-md bg-inset py-1 pr-1 pl-3">
        <span className="min-w-0 truncate text-sm font-semibold">{label}</span>
        <Button variant="ghost" size="sm" onClick={() => onFilter(null)}>
          <XIcon /> All games
        </Button>
      </div>
      {body}
    </section>
  );

  if (segments.length === 0) return <p className="text-sm text-muted-foreground">No games on the schedule.</p>;

  if (filter?.kind === "court") {
    const number = courtOf(draft, filter.id);
    return narrowed(
      `Court ${number ?? "?"}`,
      !queue ? (
        <p className="text-sm text-muted-foreground">No games on this court.</p>
      ) : (
        <>
          {queue.current ? (
            list(gameState(draft.results, queue.current.id) === "onCourt" ? "On court" : "Up next", [queue.current], false)
          ) : (
            <p className="text-sm text-muted-foreground">This court has played all its games.</p>
          )}
          {list("Next on this court", queue.next, false)}
          {list("Played on this court", queue.played, false)}
        </>
      ),
    );
  }

  if (filter?.kind === "group") {
    const letter = groupLetter(filter.group);
    const own = segments
      .filter((s) => s.match.categoryId === filter.categoryId && s.match.stage === "group" && s.match.group === letter)
      .sort((a, b) => a.from - b.from);
    const of = (state: ReturnType<typeof gameState>) => own.filter((s) => gameState(draft.results, s.id) === state);
    return narrowed(
      `${draft.categories.length > 1 ? `${categoryName(draft, filter.categoryId)} · ` : ""}Group ${letter}`,
      own.length === 0 ? (
        <p className="text-sm text-muted-foreground">No games for this group on the schedule.</p>
      ) : (
        <>
          {list("On court", of("onCourt"))}
          {list("Up next", of("waiting"))}
          {list("Played", of("finished"))}
        </>
      ),
    );
  }

  const done = board.onCourt.length === 0 && board.upNext.length === 0 && board.free.every((f) => f.next === null);
  if (done) return <p className="text-sm text-muted-foreground">Every game has been played.</p>;
  return (
    <section aria-label="Games" className="flex flex-col gap-4">
      {list("On court", board.onCourt)}
      <div className={cn("flex flex-col gap-2", board.free.length === 0 && "hidden")}>
        <h3 className="text-sm font-semibold">
          {board.started ? "Free courts" : "First games"}{" "}
          <span className="font-normal text-muted-foreground tabular-nums">({board.free.length})</span>
        </h3>
        {board.started && board.upNext.length > 0 ? (
          <p className="text-xs text-muted-foreground">Drag a game from Up next onto a free court to play it there. The move is logged.</p>
        ) : null}
        <ol className="flex flex-col gap-1">
          {board.free.map((f) => {
            const takes = dragging !== null && f.next?.id !== dragging.id && canMove(dragging, f.courtId);
            return (
              <li
                key={f.courtId}
                data-free-court={f.courtId}
                onDragOver={(e) => {
                  if (!takes) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                }}
                onDrop={(e) => {
                  if (!takes || !dragging) return;
                  e.preventDefault();
                  move(dragging, f.courtId);
                  setDragging(null);
                }}
                // The court is the green frame; the game on it keeps the card's colour.
                className={cn(
                  "flex flex-col gap-1 rounded-lg bg-court p-1 text-white transition-[opacity,box-shadow]",
                  takes && "ring-[3px] ring-primary ring-offset-2 ring-offset-background",
                  dragging !== null && !takes && "opacity-50",
                )}
              >
                <span className="px-2 pt-1 text-xs font-semibold tabular-nums">
                  Court {courtOf(draft, f.courtId) ?? "?"}
                  {board.started ? <span className="font-normal"> · Free</span> : null}
                </span>
                {f.next ? <div className="text-foreground">{card(f.next, false)}</div> : <p className="px-2 pb-1 text-xs">No game waiting.</p>}
              </li>
            );
          })}
        </ol>
      </div>
      {list("Up next", board.upNext.slice(0, UP_NEXT), true, Math.max(0, board.upNext.length - UP_NEXT))}
    </section>
  );
}

/**
 * One game. Closed: when, where, who, and its score. Open: started (or a
 * score typed, which starts it), scored and finished there, with everyone
 * playing it and their check-in. A game can't start until all of them have
 * arrived. A side's name opens that entry underneath.
 */
function GameCard({
  draft,
  update,
  inputs,
  segments,
  segment,
  court,
  open,
  onToggle,
  freeCourts,
  onMove,
  onDrag,
}: {
  draft: PlanDraft;
  update: Update;
  inputs: TournamentInputs | null;
  segments: LocalSegment[];
  segment: LocalSegment;
  /** Say which court (not where the list is one court's). */
  court: boolean;
  open: boolean;
  onToggle: () => void;
  /** The free courts this waiting game could be moved to. */
  freeCourts: { id: string; number: number }[];
  onMove: (courtId: string) => void;
  onDrag: (segment: LocalSegment | null) => void;
}) {
  // The entry opened under the card from one of its names.
  const [peek, setPeek] = useState<string | null>(null);
  const peeked = peek ? draft.entries.find((e) => e.id === peek) : undefined;
  const { id } = segment;
  const result = draft.results[id];
  const state = gameState(draft.results, id);
  const score = scoreText(result?.games, result?.award);
  const waiting = matchPlayers(draft, segment.match).filter((p) => p.attendance !== "arrived").length;
  const watch = useWatchOnly();
  const movable = state === "waiting" && freeCourts.length > 0 && !watch;
  return (
    <TeamOpenContext value={(entryId) => setPeek((now) => (now === entryId ? null : entryId))}>
      <div
        data-game={id}
        data-state={state}
        draggable={movable || undefined}
        onDragStart={(e) => {
          e.dataTransfer.setData("text/plain", id);
          e.dataTransfer.effectAllowed = "move";
          onDrag(segment);
        }}
        onDragEnd={() => onDrag(null)}
        className={cn("flex flex-col gap-3 rounded-lg bg-card-system p-3", movable && "cursor-grab active:cursor-grabbing")}
      >
        <div className={cn("flex flex-col gap-1", !movable && "cursor-pointer")} onClick={onToggle}>
          <span className="flex items-center gap-2">
            <GameLine draft={draft} segment={segment} court={court} />
            <button
              type="button"
              aria-expanded={open}
              aria-label={open ? "Close this game" : "Open this game"}
              className="grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground outline-none hover:bg-(--field-raised) hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            >
              <CaretDownIcon weight="bold" className={cn("size-4 transition-transform motion-reduce:transition-none", open && "rotate-180")} />
            </button>
          </span>
          <Sides draft={draft} segment={segment} />
          {state !== "waiting" || (waiting > 0 && !open) ? (
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
              {state === "onCourt" ? <Badge className="bg-shuttle text-shuttle-foreground">On court</Badge> : null}
              {score ? <span className="font-display text-xl leading-none font-bold tabular-nums">{score}</span> : null}
              {state === "waiting" && waiting > 0 && !open ? (
                <span className="text-xs font-semibold text-tight-text tabular-nums">
                  {waiting} {waiting === 1 ? "player" : "players"} not checked in
                </span>
              ) : null}
            </span>
          ) : null}
        </div>
        {peeked ? (
          <div className="flex flex-col gap-3 rounded-md bg-card-inset p-3">
            <div className="flex items-center justify-between gap-2">
              <h4 className="min-w-0 truncate text-sm font-semibold">{entryName(peeked) ?? "Unnamed entry"}</h4>
              <IconButton label="Close this entry" side="left" onClick={() => setPeek(null)}>
                <XIcon />
              </IconButton>
            </div>
            <TeamDetail draft={draft} update={update} entry={peeked} segments={segments} at={-Infinity} live />
          </div>
        ) : null}
        {open ? (
          <GameBody draft={draft} update={update} inputs={inputs} segment={segment} waiting={waiting} freeCourts={freeCourts} onMove={onMove} />
        ) : null}
      </div>
    </TeamOpenContext>
  );
}

/** An open game's working part: its scores, its one action, and its players. */
function GameBody({
  draft,
  update,
  inputs,
  segment,
  waiting,
  freeCourts,
  onMove,
}: {
  draft: PlanDraft;
  update: Update;
  inputs: TournamentInputs | null;
  segment: LocalSegment;
  /** How many of its players haven't arrived. */
  waiting: number;
  freeCourts: { id: string; number: number }[];
  onMove: (courtId: string) => void;
}) {
  const confirm = useConfirm();
  const watch = useWatchOnly();
  const [awarding, setAwarding] = useState(false);
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
  const players = matchPlayers(draft, match);
  const now = () => new Date().toISOString();
  // Nobody starts a game with a player missing: check them in, or award the match.
  const blocked = state === "waiting" && waiting > 0;

  if (!known) {
    return (
      <p className="text-sm text-muted-foreground">
        {match.stage === "group"
          ? "The draw hasn't placed both sides yet."
          : "The sides come from results still to be played: a group's final places, or the winner of an earlier match."}{" "}
        This game can&apos;t be started yet.
      </p>
    );
  }
  if (!rules) {
    return <p className="text-sm text-over-text">This category&apos;s scoring rules for the stage aren&apos;t set, so scores can&apos;t be checked.</p>;
  }
  const outcome = matchOutcome(rules, result?.games ?? []);
  const finished = state === "finished";
  return (
    <>
      {changed ? (
        <p className="flex items-start gap-2 text-xs text-over-text">
          <WarningIcon className="mt-0.5 size-3 shrink-0" aria-hidden="true" />
          The sides have changed since this was played: a corrected score put someone else in this game.
        </p>
      ) : null}
      <div className="grid grid-cols-2 gap-2">
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
          const name = rules.bestOf === 1 ? "Score" : `Game ${g + 1}`;
          return (
            <div key={g} className="col-span-2 grid grid-cols-subgrid">
              {([0, 1] as const).map((side) => (
                <input
                  key={side}
                  type="number"
                  inputMode="numeric"
                  min={0}
                  step={1}
                  disabled={closed || blocked || watch}
                  value={score[side] ?? ""}
                  placeholder={name}
                  aria-label={`${name}, ${side === 0 ? home : away}`}
                  aria-invalid={game.problem !== null || undefined}
                  data-slot="input"
                  onChange={(e) => {
                    const raw = e.target.value;
                    const value = raw === "" ? null : Number(raw);
                    // The first score typed puts the game on court.
                    update((d) => setScore(d, id, g, side, value !== null && Number.isNaN(value) ? null : value, now(), playing ?? undefined));
                  }}
                  className={cn(
                    "h-10 w-full min-w-0 [appearance:textfield] rounded-md border text-center font-display text-xl tabular-nums outline-none placeholder:font-sans placeholder:text-sm placeholder:font-normal focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
                    game.winner === (side === 0 ? "home" : "away") ? "font-bold" : "font-medium",
                  )}
                />
              ))}
              {game.problem ? <p className="col-span-2 text-xs text-over-text">{game.problem}</p> : null}
            </div>
          );
        })}
      </div>
      {result?.award ? (
        <p className="text-sm">
          <span className="font-semibold">{result.award.winner === 0 ? home : away}</span>{" "}
          <span className="text-muted-foreground">
            {result.award.reason === "walkover"
              ? `won by walkover: ${result.award.winner === 0 ? away : home} didn't play`
              : `won: ${result.award.winner === 0 ? away : home} retired`}
          </span>
        </p>
      ) : outcome.winner ? (
        <p className="text-sm">
          <span className="font-semibold">{outcome.winner === "home" ? home : away}</span>{" "}
          <span className="text-muted-foreground">
            {finished ? "won" : "wins"}
            {rules.bestOf > 1 ? ` ${outcome.home}–${outcome.away}` : ""}
          </span>
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        {/* One button, three states: start it, finish it, then correct it. */}
        {state === "waiting" ? (
          <Button
            size="sm"
            disabled={blocked || watch}
            title={blocked ? "Every player has to be checked in first; or award the match" : undefined}
            onClick={() => update((d) => startGame(d, id, now(), playing ?? undefined))}
          >
            <PlayIcon /> Start game
          </Button>
        ) : state === "onCourt" ? (
          <Button
            size="sm"
            disabled={!outcome.finished || watch}
            title={outcome.finished ? undefined : "Enter the scores first"}
            onClick={() => update((d) => finishMatch(d, id, now()))}
          >
            Finish match
          </Button>
        ) : (
          <Button
            variant="outline"
            size="sm"
            disabled={watch}
            onClick={async () => {
              if (
                await confirm({
                  title: "Correct this score?",
                  body: result?.award
                    ? "The match goes back on court, to be decided by its scores, then finished again. The change is logged."
                    : "The match goes back on court so its score can be changed, then finished again. The change is logged.",
                  action: "Correct score",
                })
              )
                update((d) => reopenGame(d, id));
            }}
          >
            Correct score
          </Button>
        )}
        {finished ? null : (
          <Button variant="ghost" size="sm" disabled={watch} title="A walkover, or a side retired" onClick={() => setAwarding(true)}>
            Award match…
          </Button>
        )}
        {blocked ? (
          <span className="text-xs font-semibold text-tight-text tabular-nums">
            {waiting} {waiting === 1 ? "player" : "players"} not checked in
          </span>
        ) : null}
      </div>
      {players.length > 0 ? (
        <div className="flex flex-col gap-2">
          <h4 className="text-sm font-semibold">Players in this match</h4>
          <PlayerCheckIn players={players} update={update} />
        </div>
      ) : null}
      {state === "waiting" && freeCourts.length > 0 && !watch ? (
        <NativeSelect
          aria-label="Move this game to a free court"
          className="w-full"
          value=""
          data-empty
          onChange={(e) => {
            if (e.target.value) onMove(e.target.value);
          }}
        >
          <NativeSelectOption value="">Move to court…</NativeSelectOption>
          {freeCourts.map((c) => (
            <NativeSelectOption key={c.id} value={c.id}>
              Court {c.number} (free)
            </NativeSelectOption>
          ))}
        </NativeSelect>
      ) : null}
      {awarding ? (
        <AwardDialog
          draft={draft}
          update={update}
          matchId={id}
          started={(result?.games ?? []).some(([h, a]) => h !== null || a !== null)}
          // The last game entered has no winner yet: it stopped mid-game.
          midGame={outcome.games.some((game, g) => game.winner === null && (result?.games[g] ?? []).some((n) => n !== null && n !== undefined))}
          onClose={() => setAwarding(false)}
        />
      ) : null}
    </>
  );
}
