"use client";

import { PlayIcon, WarningIcon, XIcon } from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { groupLetter, matchOutcome, rulesFor, type TournamentInputs } from "@/engine";
import { entryName, type PlanDraft } from "@/lib/tournament/draft";
import { finishMatch } from "@/lib/tournament/changes";
import { entryForSlot, matchPlayers, sidePlayers, sidesChanged } from "@/lib/tournament/entries";
import { courtBoard, courtGame, courtQueues, gameState, reopenGame, scoreText, setScore, startGame } from "@/lib/tournament/live";
import { sidesKnown } from "@/lib/tournament/live-day";
import { cn } from "@/lib/utils";
import { PlayerCheckIn } from "./attendance";
import { TimingDot, courtAttention, useLiveAttention } from "./attention";
import { TeamDetail, TeamList, TeamName, TeamOpenContext, courtOf } from "./draw-panel";
import { IconButton } from "./fields";
import { AwardDialog, LevelTies } from "./live-dialogs";
import { categoryName } from "./labels";
import { useLiveMoves } from "./live-moves";
import type { Update } from "./plan-editor";
import { matchText, sideLabel, type LocalSegment } from "./timeline";
import { useSimulation } from "./watch-only";

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

/** What a game is, without its court or time: "Group A · Wave 2 · Rubber 1 of 2 · Mixed doubles". */
function whatOf(draft: PlanDraft, segment: LocalSegment): string {
  const { where, rubber } = matchText(draft, segment.match);
  return [where, rubber?.replace(/: .*/, ""), draft.categories.length > 1 ? categoryName(draft, segment.match.categoryId) : null].filter(Boolean).join(" · ");
}

/**
 * The Live stage's side panel, on every Live page. Games: every court with
 * the game on it (or due on it next), then what is up next, each game
 * opening in place to be started, scored and finished; narrowed to a court or
 * a group when one is chosen in the main area. Entries: everyone entered, by
 * group. The clock (the timeline cursor's time) sits beside the tabs.
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
  time,
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
  /** The time now, "11:44": the real clock, or a simulated day's. */
  time: string | null;
  onFold: () => void;
}) {
  return (
    <Tabs value={tab} onValueChange={(value) => onTab(value as LiveTab)} className="min-h-0 flex-1 gap-0">
      {/* The soft divider runs under the tabs, the clock and the fold button alike. */}
      <div className="mx-4 flex shrink-0 items-center gap-2 shadow-[inset_0_-1px_0_var(--border)]">
        <TabsList variant="line" className="min-w-0 flex-1 justify-start shadow-none">
          <TabsTrigger value="games">Games</TabsTrigger>
          <TabsTrigger value="entries">{draft.unit === "team" ? "Teams" : "Entries"}</TabsTrigger>
        </TabsList>
        {time ? (
          <span role="timer" aria-label={`The time is ${time}`} className="font-display text-2xl leading-none font-bold tabular-nums">
            {time}
          </span>
        ) : null}
        <IconButton label="Hide panel" side="left" aria-expanded onClick={onFold}>
          <XIcon />
        </IconButton>
      </div>
      <div className="scroll-pane relative min-h-0 flex-1 overflow-y-auto px-4 pt-3 pb-4">
        <TabsContent value="games">
          {/* A knockout tie that ended level holds up the next round until the desk decides it. */}
          <LevelTies draft={draft} update={update} />
          <GamesTab
            // A court or a group chosen in the main area starts its own list.
            key={filter ? JSON.stringify(filter) : "all"}
            draft={draft}
            update={update}
            inputs={inputs}
            segments={segments}
            filter={filter}
            onFilter={onFilter}
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
}: {
  draft: PlanDraft;
  update: Update;
  inputs: TournamentInputs | null;
  segments: LocalSegment[];
  filter: LiveFilter;
  onFilter: (filter: LiveFilter) => void;
}) {
  const order = useMemo(() => draft.frame.halls.flatMap((h) => h.courts.map((c) => c.id)), [draft.frame.halls]);
  // A court shows its game only once the game's sides are known: until then it is free.
  const known = (g: LocalSegment) => sidesKnown(draft, g);
  const board = courtBoard(segments, draft.results, order, known);
  const queue = filter?.kind === "court" ? (courtQueues(segments, draft.results).get(filter.id) ?? null) : null;
  // The game opened to run it; a chosen court opens on its game.
  const [openId, setOpenId] = useState<string | null>((filter?.kind === "court" ? filter.game : undefined) ?? courtGame(queue ?? undefined, draft.results, known)?.id ?? null);
  // A game chosen on the timeline may be far down its court's list: bring it into view.
  const root = useRef<HTMLElement>(null);
  const chosen = filter?.kind === "court" ? (filter.game ?? null) : null;
  useEffect(() => {
    if (chosen) root.current?.querySelector(`[data-game="${CSS.escape(chosen)}"]`)?.scrollIntoView({ block: "nearest" });
  }, [chosen]);

  const attention = useLiveAttention();
  // Putting a waiting game on a court: shared with the Court board, so a card can be dropped on a court there too.
  const moves = useLiveMoves();
  const dragging = moves?.dragging ?? null;
  const takes = (segment: LocalSegment, courtId: string) => Boolean(moves?.takes(segment, courtId));
  const move = (segment: LocalSegment, courtId: string) => moves?.move(segment, courtId);
  /** The courts a waiting game could be played on instead. */
  const courtsFor = (segment: LocalSegment) =>
    gameState(draft.results, segment.id) !== "waiting"
      ? []
      : board.courts.filter((c) => takes(segment, c.courtId)).map((c) => ({ id: c.courtId, number: courtOf(draft, c.courtId) ?? 0, free: c.game === null }));
  // Matches given to a side (a walkover or a retirement) have left their courts: they are listed last.
  const given = segments.filter((s) => draft.results[s.id]?.award).sort((a, b) => a.from - b.from);

  const card = (s: LocalSegment, label: string | null, given = false, putOn: string | null = null) => (
    <GameCard
      given={given}
      // In a chosen court's lists: one press puts the game on that court.
      put={putOn && takes(s, putOn) ? { number: courtOf(draft, putOn) ?? 0, onPut: () => move(s, putOn) } : null}
      draft={draft}
      update={update}
      inputs={inputs}
      segments={segments}
      segment={s}
      label={label}
      open={s.id === openId}
      onToggle={() => {
        attention?.attend(s.courtId);
        setOpenId(s.id === openId ? null : s.id);
      }}
      freeCourts={courtsFor(s)}
      onMove={(courtId) => move(s, courtId)}
      onDrag={(segment) => moves?.setDragging(segment)}
    />
  );
  /** A card on its own (not in a court's frame) says which court and what it is. */
  const labelled = (s: LocalSegment, court = true, given = false, putOn: string | null = null) =>
    card(s, [court ? `Court ${courtOf(draft, s.courtId) ?? "?"}` : null, whatOf(draft, s)].filter(Boolean).join(" · "), given, putOn);
  /** A court in its place: the green frame, with the game on it or due on it next, or nothing (a free court). A game dropped on it goes on next. */
  const frame = (courtId: string, game: LocalSegment | null) => {
    const takesIt = dragging !== null && takes(dragging, courtId);
    const playing = game !== null && gameState(draft.results, game.id) === "onCourt";
    return (
      <li
        key={courtId}
        data-court-frame={courtId}
        data-free={game === null || undefined}
        // A click anywhere on the frame, its header band included, opens or closes its game.
        onClick={(e) => {
          const target = e.target as Element;
          if (!e.currentTarget.contains(target)) return;
          attention?.attend(courtId);
          if (game && !target.closest("[data-game]")) setOpenId(game.id === openId ? null : game.id);
        }}
        onDragOver={(e) => {
          if (!takesIt) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
        }}
        onDrop={(e) => {
          if (!takesIt || !dragging) return;
          e.preventDefault();
          move(dragging, courtId);
          moves?.setDragging(null);
        }}
        // The court is the green frame; the game on it keeps the card's colour.
        className={cn(
          "flex flex-col gap-1 rounded-lg bg-court p-1 text-white transition-[opacity,box-shadow]",
          game && "cursor-pointer",
          !dragging && courtAttention(attention, courtId),
          takesIt && "ring-[3px] ring-primary ring-offset-2 ring-offset-background",
          dragging !== null && !takesIt && "opacity-50",
        )}
      >
        <span className="flex items-center gap-2 px-2 pt-0.5 text-xs leading-4 tabular-nums">
          <span className="shrink-0 font-semibold">Court {courtOf(draft, courtId) ?? "?"}</span>
          <span className="min-w-0 flex-1 truncate">{game ? whatOf(draft, game) : "Free"}</span>
          {/* The game's time, as a dot in the corner: nothing while it is on time. */}
          {playing ? <TimingDot timing={attention?.timing(game.id)} className="mr-1" /> : null}
        </span>
        {game ? (
          <div className="text-foreground">{card(game, null)}</div>
        ) : (
          // The same height as a card, so the list doesn't jump when a court empties.
          <div className="grid h-9 place-items-center rounded-md border border-dashed border-white/50 text-xs">
            {dragging ? (takesIt ? "Drop here" : "Can't be played here") : "No game on this court"}
          </div>
        )}
      </li>
    );
  };
  const list = (title: string, games: LocalSegment[], court = true, more = 0, given = false, putOn: string | null = null) =>
    games.length === 0 ? null : (
      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold">
          {title} <span className="font-normal text-muted-foreground tabular-nums">({games.length + more})</span>
        </h3>
        <ol className="flex flex-col gap-1">
          {games.map((s) => (
            <li key={s.id}>{labelled(s, court, given, putOn)}</li>
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
    // The court itself, as in the full list; then what is coming on it, and what else could go on it now.
    const shown = courtGame(queue ?? undefined, draft.results, known);
    const own = queue ? [...(queue.current ? [queue.current] : []), ...queue.next].filter((g) => g.id !== shown?.id) : [];
    const others = segments
      .filter((g) => g.courtId !== filter.id && takes(g, filter.id))
      // What can be played now comes first; then the soonest.
      .sort((x, y) => Number(Boolean(attention?.held.has(x.id))) - Number(Boolean(attention?.held.has(y.id))) || x.from - y.from);
    return narrowed(
      `Court ${number ?? "?"}`,
      <>
        <ol aria-label={`Court ${number ?? "?"}`} className="flex flex-col gap-1">
          {frame(filter.id, shown)}
        </ol>
        {!queue?.current && queue ? <p className="text-sm text-muted-foreground">This court has played all its games.</p> : null}
        {list("Next on this court", own, false, 0, false, filter.id)}
        {list("Other games that could go on now", others.slice(0, UP_NEXT), true, Math.max(0, others.length - UP_NEXT), false, filter.id)}
        {list("Played on this court", queue?.played ?? [], false)}
      </>,
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

  return (
    <section aria-label="Games" className="flex flex-col gap-4">
      {/* Every court in its own place: the game on it or due on it next, or nothing (a free court). */}
      <ol aria-label="Courts" className="flex flex-col gap-1">
        {board.courts.map(({ courtId, game }) => frame(courtId, game))}
      </ol>
      {board.upNext.length === 0 && board.courts.every((c) => c.game === null) ? (
        <p className="text-sm text-muted-foreground">Every game has been played.</p>
      ) : null}
      {list("Up next", board.upNext.slice(0, UP_NEXT), true, Math.max(0, board.upNext.length - UP_NEXT))}
      {board.upNext.length > 0 ? (
        <p className="text-xs text-muted-foreground">
          Drag a game onto a court that isn&apos;t playing, here or on the Court board, to put it on next there; the game that was waiting goes back to Up next. The move is logged.
        </p>
      ) : null}
      {list("Walkovers", given, true, 0, true)}
    </section>
  );
}

/**
 * One game. Closed, it is one line: the two sides, with "V/S" (or the score)
 * between them; greyed while a player it needs hasn't checked in. A click
 * anywhere on it opens it: started (or a score typed, which starts it),
 * scored and finished there, with everyone playing it and their check-in.
 * Once open, a side's name opens that entry underneath.
 */
function GameCard({
  draft,
  update,
  inputs,
  segments,
  segment,
  label,
  open,
  onToggle,
  freeCourts,
  onMove,
  onDrag,
  given = false,
  put = null,
}: {
  /** In a chosen court's lists: puts this waiting game on that court. */
  put?: { number: number; onPut: () => void } | null;
  /** Listed under Walkovers: the heading says what it is, so the card shows only the score and who won. */
  given?: boolean;
  draft: PlanDraft;
  update: Update;
  inputs: TournamentInputs | null;
  segments: LocalSegment[];
  segment: LocalSegment;
  /** Which court and what it is, for a card that isn't in a court's frame; null inside one. */
  label: string | null;
  open: boolean;
  onToggle: () => void;
  /** The free courts this waiting game could be moved to. */
  freeCourts: { id: string; number: number; free: boolean }[];
  onMove: (courtId: string) => void;
  onDrag: (segment: LocalSegment | null) => void;
}) {
  const attention = useLiveAttention();
  // The entry opened under the card from one of its names.
  const [peek, setPeek] = useState<string | null>(null);
  const peeked = open && peek ? draft.entries.find((e) => e.id === peek) : undefined;
  const { id, match } = segment;
  const result = draft.results[id];
  const state = gameState(draft.results, id);
  const award = result?.award;
  // Under Walkovers the "W/O" goes: the points sit under their own sides and the winner's name is bold.
  const score = scoreText(result?.games, given && award?.reason === "walkover" ? undefined : award);
  const waiting = matchPlayers(draft, match).filter((p) => p.attendance !== "arrived").length;
  // A waiting game drags from anywhere on it (closed: an open one is being worked on).
  const movable = state === "waiting" && freeCourts.length > 0 && !open;
  // It can't start: a player hasn't checked in. Greyed out, until they are or it is given as a walkover.
  const held = state === "waiting" && Boolean(attention?.held.has(id));
  // On court: how its time is going, as a dot (in its court's frame; on the card itself when it stands alone).
  const timing = state === "onCourt" ? (attention?.timing(id) ?? "ok") : "ok";
  const side = (slot: string, index: 0 | 1, align: string) => {
    const name = sideLabel(draft, match, slot);
    // A match given to a side: the winner in bold, the other side quieter.
    const won = given && award ? (award.winner === index ? "font-bold" : "font-normal text-muted-foreground") : "";
    return open ? (
      // Opened, a long name wraps rather than being cut short. Only the name's own text is clickable, not the space beside it.
      <span className={align}>
        <TeamName entryId={entryForSlot(draft, match.categoryId, slot)?.id} className={cn("leading-tight text-balance", align, won)}>
          {name}
        </TeamName>
      </span>
    ) : (
      <span className={cn("truncate", align, won)} title={name}>
        {name}
      </span>
    );
  };
  return (
    <TeamOpenContext value={(entryId) => setPeek((now) => (now === entryId ? null : entryId))}>
      <div
        data-game={id}
        data-state={state}
        data-held={held || undefined}
        draggable={movable || undefined}
        onDragStart={(e) => {
          e.dataTransfer.setData("text/plain", id);
          e.dataTransfer.effectAllowed = "move";
          onDrag(segment);
        }}
        onDragEnd={() => onDrag(null)}
        title={
          held && !open
            ? `Can't start: ${waiting} ${waiting === 1 ? "player" : "players"} not checked in`
            : timing === "over"
              ? "Past its time on the schedule"
              : timing === "near"
                ? "Near the end of its time on the schedule"
                : undefined
        }
        // A click anywhere on the card opens or closes it, except on a name, a field, a button or the check-in controls.
        onClick={(e) => {
          const target = e.target as Element;
          if (!e.currentTarget.contains(target) || target.closest("button, input, select, textarea, a, label, [role=radiogroup]")) return;
          e.stopPropagation();
          onToggle();
        }}
        className={cn(
          "flex cursor-pointer flex-col gap-3 rounded-md px-2 py-2 select-none",
          "bg-card-system",
          held && !open && "opacity-50 grayscale",
          movable && "active:cursor-grabbing",
        )}
      >
        {/* The whole of the closed card opens it; opened, this line folds it away (the names open their entries). */}
        <div
          role="button"
          tabIndex={0}
          aria-expanded={open}
          aria-label={open ? "Close this game" : "Open this game"}
          className="flex flex-col gap-1 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onKeyDown={(e) => {
            if (e.target !== e.currentTarget || (e.key !== "Enter" && e.key !== " ")) return;
            e.preventDefault();
            onToggle();
          }}
        >
          {label ? (
            <span className="flex items-center gap-2 text-xs text-muted-foreground tabular-nums">
              <span className="min-w-0 flex-1 truncate">{label}</span>
              <TimingDot timing={timing} ringed />
              {put && !open ? (
                <Button variant="outline" size="sm" className="-my-1 h-6 shrink-0 px-2 text-xs" onClick={put.onPut}>
                  Put on court {put.number}
                </Button>
              ) : null}
            </span>
          ) : null}
          <span className={cn("grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 font-semibold", open ? "text-xl" : "text-sm")}>
            {side(match.home, 0, "text-left")}
            {/* Larger than the names' line but light, so it parts the two sides without drawing the eye. */}
            <span className={cn("shrink-0 text-center text-xl leading-none tabular-nums", score ? "font-display font-bold" : "font-normal text-muted-foreground")}>
              {score ?? (given && award ? "–" : "V/S")}
            </span>
            {side(match.away, 1, "text-right")}
          </span>
        </div>
        {peeked ? (
          <div className="flex flex-col gap-2 rounded-md bg-card-inset p-3">
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

/** An open game's working part: its scores (home's under home, away's under away), its one action, and its players. */
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
  freeCourts: { id: string; number: number; free: boolean }[];
  onMove: (courtId: string) => void;
}) {
  const confirm = useConfirm();
  // During a simulation the simulation starts games; it scores and finishes them too unless the desk has taken the scores.
  const sim = useSimulation();
  const watch = sim.on && !sim.deskScores;
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
            disabled={blocked || sim.on}
            title={sim.on ? "The simulation starts the games" : blocked ? "Every player has to be checked in first; or give a walkover" : undefined}
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
          <Button variant="ghost" size="sm" title="Give the match to a side: the other didn't play, or retired" onClick={() => setAwarding(true)}>
            Walkover…
          </Button>
        )}
        {blocked ? (
          <span className="text-xs font-semibold text-tight-text tabular-nums">
            {waiting} {waiting === 1 ? "player" : "players"} not checked in
          </span>
        ) : null}
      </div>
      {players.length > 0 ? (
        // Each side's players under its own name, so it is plain who is missing from which side.
        <div className="flex flex-col gap-3">
          {([match.home, match.away] as const).map((slot, i) => {
            const own = sidePlayers(draft, match.categoryId, slot, match.rubber?.number);
            const out = own.filter((p) => p.attendance !== "arrived").length;
            return own.length === 0 ? null : (
              <div key={slot} data-side-players className="flex flex-col gap-1">
                <h4 className="flex items-baseline justify-between gap-2 text-sm font-semibold">
                  <span className="min-w-0 truncate">{i === 0 ? home : away}</span>
                  {out > 0 ? <span className="shrink-0 text-xs text-tight-text tabular-nums">{out} not checked in</span> : null}
                </h4>
                <PlayerCheckIn players={own} update={update} />
              </div>
            );
          })}
        </div>
      ) : null}
      {state === "waiting" && freeCourts.length > 0 ? (
        <NativeSelect
          aria-label="Move this game to another court"
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
              Court {c.number} ({c.free ? "free" : "its game goes back to Up next"})
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
