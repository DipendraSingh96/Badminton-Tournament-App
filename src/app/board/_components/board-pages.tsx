"use client";

import { MegaphoneIcon, TrophyIcon } from "@phosphor-icons/react";
import type { CSSProperties } from "react";
import type {
  BoardBracket,
  BoardCall,
  BoardCourt,
  BoardCourtState,
  BoardGame,
  BoardHall,
  BoardMatch,
  BoardTable,
} from "@/lib/tournament/audience";
import { cn } from "@/lib/utils";

// The audience board's pieces. Every size here is in em, from the board's own
// scale (it grows with the window): this screen is read from across a hall,
// so the app's fixed text sizes don't apply to it (docs/design-system.md).

/** A status word in its colour, sized by the board's scale. */
function Chip({ className, children }: { className: string; children: string }) {
  return (
    <span className={cn("inline-flex shrink-0 items-center rounded-full px-[0.75em] py-[0.15em] text-[0.7em] font-bold tracking-[.04em] whitespace-nowrap", className)}>
      {children}
    </span>
  );
}

/** A pair is two people: one to a line. A team or a single is one line. */
function lines(name: string): string[] {
  return name.split(" / ");
}

/** How many columns the courts are laid out in: as few as keep the page to three rows of courts. */
export function courtColumns(halls: BoardHall[]): number {
  const most = Math.max(1, ...halls.map((h) => h.courts.length));
  for (let columns = Math.min(2, most); columns <= 6; columns++) {
    const rows = halls.reduce((sum, h) => sum + Math.ceil(h.courts.length / columns), 0);
    if (rows <= 3 || columns >= most) return columns;
  }
  return 6;
}

const STATE_TEXT: Record<BoardCourtState, string> = { onCourt: "on court", upNext: "next", free: "free", done: "no more games" };

/**
 * Every court, hall by hall, drawn as the product draws a court: who is on
 * it is simply on it. No badge, no time and no score.
 */
export function CourtsPage({
  halls,
  groups,
  news,
}: {
  halls: BoardHall[];
  /** The group each court is assigned to ("Group A"), by court id: shown on a court with no game. */
  groups: Map<string, string>;
  /** Courts with something new on them, for a few seconds. */
  news: readonly string[];
}) {
  const columns = courtColumns(halls);
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-[0.75em]">
      {halls.map((hall) => {
        const rows = Math.ceil(hall.courts.length / columns);
        return (
          <section key={hall.id} aria-label={hall.name} className="flex min-h-0 flex-col gap-[0.4em]" style={{ flex: `${rows} 1 0%` }}>
            <h2 data-board-hall className="shrink-0 font-display text-[1.3em] leading-none font-bold">
              {hall.name}
            </h2>
            <div
              className="grid min-h-0 flex-1 gap-[0.75em]"
              style={{ gridTemplateColumns: `repeat(${Math.min(columns, hall.courts.length)}, minmax(0, 1fr))`, gridAutoRows: "minmax(0, 1fr)" }}
            >
              {hall.courts.map((court) => (
                <CourtTile key={court.courtId} court={court} group={groups.get(court.courtId) ?? null} news={news.includes(court.courtId)} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function CourtTile({ court, group, news }: { court: BoardCourt; group: string | null; news: boolean }) {
  const game = court.game;
  // Waiting for a game's players: greyed, and fading until the desk has dealt with it.
  const waiting = Boolean(game?.held);
  const next = court.state === "upNext" && !waiting;
  return (
    // The court sizes its own text: it shrinks when there are many courts, so names aren't cut off.
    <article
      data-board-court={court.number}
      data-waiting={waiting || undefined}
      aria-label={`Court ${court.number}: ${waiting ? "waiting for players" : STATE_TEXT[court.state]}`}
      className={cn("min-h-0 min-w-0 rounded-[0.6em] bg-court text-white [container-type:size]", waiting && "court-wait !bg-held", news && "court-news")}
    >
      <div className="flex h-full flex-col gap-[0.3em] px-[0.8em] pt-[0.4em] pb-[0.5em]" style={{ fontSize: "min(1.6em, 7.3cqh, 6cqw)" }}>
        {/* The surround, top: the court, and what is on it (or the group it is kept for). */}
        <p className="flex shrink-0 items-baseline justify-between gap-[0.6em] leading-[1.3]">
          <span className="font-display text-[1.1em] font-bold whitespace-nowrap">Court {court.number}</span>
          <span className="min-w-0 truncate text-[0.8em] font-semibold">{game ? game.where : group}</span>
        </p>
        {/* The court: its outer lines, the net across the middle, its number behind. */}
        <div className="relative flex min-h-0 flex-1 flex-col border-[0.12em] border-white/90">
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 z-0 grid place-items-center overflow-hidden font-display text-[7em] leading-none font-bold text-black/18 mix-blend-multiply select-none"
          >
            {court.number}
          </span>
          <TileSide game={game} index={0} dim={next} />
          <div className="relative z-10 flex shrink-0 flex-col">
            <span aria-hidden="true" className="h-[0.15em] bg-white" />
            <p className="truncate px-[0.5em] text-center text-[0.7em] leading-[1.7] font-semibold">
              {game ? [game.category, game.rubber].filter(Boolean).join(" · ") : court.state === "done" ? "No more games" : "Free"}
            </p>
            <span aria-hidden="true" className="h-px bg-white/50" />
          </div>
          <TileSide game={game} index={1} dim={next} />
        </div>
        {/* The surround, bottom: a game due but not on yet says so. */}
        {next || waiting ? <p className="shrink-0 text-center text-[0.75em] leading-[1.3] font-semibold">{waiting ? "Waiting for players" : "Next"}</p> : null}
      </div>
    </article>
  );
}

/** A side in its half of the court, as large as it will go: a pair's two players one to a line; a team's name with the rubber's players under it. */
function TileSide({ game, index, dim }: { game: BoardGame | null; index: 0 | 1; dim: boolean }) {
  const side = game?.sides[index];
  const team = side ? side.players.length > 0 : false;
  const names = !side ? [] : team ? [side.name] : lines(side.name);
  return (
    <div className={cn("relative z-10 flex min-h-0 flex-1 flex-col items-center justify-center px-[0.5em] text-center", dim && "opacity-60")}>
      {names.map((name, i) => (
        <span key={i} data-board-name className={cn("max-w-full truncate leading-[1.15]", side?.known ? "text-[1.5em] font-bold" : "font-display text-[1.5em] font-bold uppercase")}>
          {name}
        </span>
      ))}
      {team && side ? <span className="max-w-full truncate text-[0.95em] leading-[1.3] font-medium">{side.players.join(" / ")}</span> : null}
    </div>
  );
}

/** The em height of one Up next row, to work out how many fit. */
export const UP_NEXT_ROW_EM = 4.9;

/** The games still to come, soonest first: always on screen, beside whatever page is up. */
export function UpNextPanel({ games, fit }: { games: BoardGame[]; fit: number }) {
  const shown = games.slice(0, Math.max(0, fit));
  return (
    <aside aria-label="Up next" className="flex min-h-0 min-w-0 flex-col gap-[0.6em] rounded-[0.6em] bg-card-system p-[0.9em]">
      <h2 className="shrink-0 font-display text-[1.3em] leading-none font-bold">Up next</h2>
      {games.length === 0 ? <p className="text-[0.9em] text-muted-foreground">No more games waiting.</p> : null}
      <ol className="flex min-h-0 flex-1 flex-col gap-[0.4em] overflow-hidden">
        {shown.map((game) => (
          <li
            key={game.id}
            data-board-next={game.id}
            // A game waiting on a player who hasn't checked in is greyed, as at the desk.
            className={cn("flex shrink-0 flex-col rounded-[0.45em] bg-card-inset px-[0.7em] py-[0.45em]", game.held && "opacity-50 grayscale")}
            style={{ height: `${UP_NEXT_ROW_EM - 0.4}em` }}
          >
            <p className="flex items-baseline gap-[0.5em] leading-[1.3]">
              <span className="font-display text-[1.15em] font-bold tabular-nums">{game.time}</span>
              <span className="text-[0.85em] font-semibold whitespace-nowrap">Court {game.court ?? "?"}</span>
              <span className="ml-auto min-w-0 truncate text-[0.75em] text-muted-foreground">{game.where}</span>
            </p>
            {game.sides.map((side, i) => (
              <span key={i} className={cn("truncate text-[0.9em] leading-[1.3]", side.known ? "font-medium" : "text-muted-foreground")}>
                {side.name}
              </span>
            ))}
          </li>
        ))}
      </ol>
      {games.length > shown.length && shown.length > 0 ? (
        <p className="shrink-0 text-[0.75em] text-muted-foreground tabular-nums">and {games.length - shown.length} more</p>
      ) : null}
    </aside>
  );
}

/** Players the desk is waiting for: the one thing on the board in yellow. */
/** How many calls are up at once; with more, they take turns. */
const CALLS_AT_ONCE = 2;

export function CallBand({ calls, turn }: { calls: BoardCall[]; turn: number }) {
  if (calls.length === 0) return null;
  const start = calls.length <= CALLS_AT_ONCE ? 0 : (((turn * CALLS_AT_ONCE) % calls.length) + calls.length) % calls.length;
  const shown = calls.length <= CALLS_AT_ONCE ? calls : Array.from({ length: CALLS_AT_ONCE }, (_, i) => calls[(start + i) % calls.length]!);
  return (
    <div role="status" className="flex shrink-0 items-start gap-[0.7em] rounded-[0.6em] bg-tight px-[1em] py-[0.6em] text-tight-foreground">
      <MegaphoneIcon weight="fill" className="mt-[0.1em] size-[1.5em] shrink-0" aria-hidden="true" />
      <ul className="flex min-w-0 flex-col gap-[0.15em]">
        {shown.map((call) => (
          <li key={call.gameId} data-board-call className="text-[1.15em] leading-[1.3] font-semibold">
            Please come to the desk: {call.names.join(", ")}
            <span className="font-normal"> (Court {call.court ?? "?"})</span>
          </li>
        ))}
      </ul>
      {calls.length > shown.length ? (
        <p className="ml-auto shrink-0 self-center text-[0.85em] tabular-nums">
          {calls.length} courts waiting
        </p>
      ) : null}
    </div>
  );
}

/** A group table's height in em for a number of rows, to work out how many tables fit a page. */
export function tableHeightEm(rows: number): number {
  return 4.6 + rows * 2.05;
}

const STANDING_CHIP: Record<string, string> = {
  Through: "bg-fits text-fits-foreground",
  Winner: "bg-fits text-fits-foreground",
  Level: "bg-tight text-tight-foreground",
  Out: "border border-border text-muted-foreground",
  Withdrawn: "border border-border text-muted-foreground",
};

/** A page of group tables, as the scores stand. */
export function TablesPage({
  tables,
  columns,
  room,
}: {
  tables: BoardTable[];
  columns: number;
  /** The page's room, in em of the board's text; null until it has been measured. */
  room: { width: number; height: number } | null;
}) {
  // The standing column is there only once a group has finished (or someone has withdrawn).
  const standings = tables.some((t) => t.rows.some((r) => r.standing !== null));
  const across = Math.max(1, Math.min(columns, tables.length));
  // With room to spare the tables' text grows (never past half as large again), as far as the longest name still fits.
  const fixed = 1.8 + 1.6 + 3 * 2 + 3 + (standings ? 6 : 0);
  const longest = Math.max(1, ...tables.flatMap((t) => t.rows.map((r) => r.name.length)));
  const tallest = Math.max(1, ...tables.map((t) => t.rows.length));
  const down = Math.ceil(tables.length / across);
  const scale = !room
    ? 1
    : Math.max(1, Math.min(1.5, room.height / (down * (tableHeightEm(tallest) + 0.75)), (room.width / across - 0.75) / (fixed + longest * 0.5)));
  return (
    <div
      className="grid min-h-0 flex-1 content-start gap-[0.75em]"
      style={{ gridTemplateColumns: `repeat(${across}, minmax(0, 1fr))`, fontSize: `${scale.toFixed(3)}em` }}
    >
      {tables.map((table) => (
        <section key={`${table.categoryId}:${table.letter}`} data-board-table={table.letter} className="flex min-w-0 flex-col gap-[0.4em] rounded-[0.6em] bg-card-system p-[0.9em]">
          <div className="flex items-baseline justify-between gap-[0.6em]">
            <h3 className="font-display text-[1.3em] leading-none font-bold">Group {table.letter}</h3>
            <p className="truncate text-[0.75em] text-muted-foreground tabular-nums">{table.progress}</p>
          </div>
          <table className="w-full table-fixed tabular-nums">
            <caption className="sr-only">Group {table.letter} standings</caption>
            <colgroup>
              <col style={{ width: "1.6em" }} />
              <col />
              <col style={{ width: "2em" }} />
              <col style={{ width: "2em" }} />
              <col style={{ width: "2em" }} />
              <col style={{ width: "3em" }} />
              {standings ? <col style={{ width: "6em" }} /> : null}
            </colgroup>
            <thead>
              <tr className="text-[0.7em] text-muted-foreground">
                <th scope="col" className="pb-[0.3em] text-left font-semibold">
                  #
                </th>
                <th scope="col" className="pb-[0.3em] text-left font-semibold">
                  Name
                </th>
                {["P", "W", "L", "+/−"].map((h) => (
                  <th key={h} scope="col" className="pb-[0.3em] text-right font-semibold">
                    {h}
                  </th>
                ))}
                {standings ? (
                  <th scope="col" className="pb-[0.3em]">
                    <span className="sr-only">Standing</span>
                  </th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((row, i) => (
                <tr key={i} className={cn("border-t border-border/60", row.cut && "border-b-2 border-dashed border-b-turf")} style={{ height: "2.05em" }}>
                  <td className="text-[0.9em] text-muted-foreground">{row.place}</td>
                  <td className={cn("truncate text-[0.95em] font-semibold", row.standing === "Withdrawn" && "font-normal text-muted-foreground line-through")}>{row.name}</td>
                  <td className="text-right text-[0.95em]">{row.played}</td>
                  <td className="text-right text-[0.95em]">{row.won}</td>
                  <td className="text-right text-[0.95em]">{row.lost}</td>
                  <td className="text-right text-[0.95em]">{row.difference}</td>
                  {standings ? <td className="text-right">{row.standing ? <Chip className={STANDING_CHIP[row.standing]!}>{row.standing}</Chip> : null}</td> : null}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
    </div>
  );
}

/** A category's knockout, filling in from the results, to the champion. */
export function KnockoutPage({ bracket }: { bracket: BoardBracket }) {
  const final = bracket.rounds.at(-1);
  const earlier = bracket.rounds.slice(0, -1);
  if (!final) return null;
  // The first round is the tallest column: the text shrinks until it fits the page.
  const tallest = Math.max(1, bracket.rounds[0]!.matches.length, bracket.bronze ? 2.6 : 1.6);
  const style: CSSProperties = { fontSize: `min(1em, ${(100 / (tallest * 5.6 + 2.2)).toFixed(2)}cqh)` };
  return (
    <div className="min-h-0 flex-1 [container-type:size]">
      <div className="flex h-full gap-[1.2em]" style={style}>
        {earlier.map((round) => (
          <div key={round.name} className="flex min-w-0 flex-1 flex-col gap-[0.5em]">
            <h3 className="shrink-0 font-display text-[1.1em] leading-none font-semibold">{round.name}</h3>
            <ol className="flex min-h-0 flex-1 flex-col justify-around gap-[0.6em]">
              {round.matches.map((m) => (
                <li key={m.code}>
                  <MatchBox match={m} />
                </li>
              ))}
            </ol>
          </div>
        ))}
        <div className="flex min-w-0 flex-1 flex-col gap-[0.5em]">
          <h3 className="flex shrink-0 items-center gap-[0.4em] font-display text-[1.1em] leading-none font-semibold">
            <TrophyIcon weight="fill" className="size-[1em] text-shuttle" aria-hidden="true" /> Final
          </h3>
          <div className="flex min-h-0 flex-1 flex-col justify-center gap-[1.2em]">
            <div className="flex flex-col gap-[0.5em]">
              <MatchBox match={final.matches[0]!} final />
              {bracket.champion ? (
                <p data-board-champion className="flex flex-col">
                  <span className="text-[0.75em] text-muted-foreground">Champion</span>
                  <span className="font-display text-[1.5em] leading-[1.15] font-bold">{bracket.champion}</span>
                </p>
              ) : null}
            </div>
            {bracket.bronze ? (
              <div className="flex flex-col gap-[0.5em]">
                <h3 className="font-display text-[1.1em] leading-none font-semibold">Bronze match</h3>
                <MatchBox match={bracket.bronze} />
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function MatchBox({ match, final = false }: { match: BoardMatch; final?: boolean }) {
  return (
    <div data-board-match={match.code} className={cn("flex min-w-0 flex-col rounded-[0.5em] bg-card-system", final && "ring-2 ring-shuttle")}>
      <div className="flex items-center justify-between gap-[0.5em] border-b border-border/60 px-[0.7em] py-[0.25em] text-[0.7em] font-semibold text-muted-foreground tabular-nums">
        <span>{match.label}</span>
        <span className="truncate">{match.when ?? "Not scheduled"}</span>
      </div>
      {match.sides.map((side, i) => (
        <div key={i} className={cn("flex items-center gap-[0.5em] px-[0.7em] py-[0.35em]", i === 0 && "border-b border-border/60")}>
          <span className={cn("min-w-0 flex-1 truncate text-[0.95em]", side.won ? "font-bold" : "font-medium", !side.known && "font-normal text-muted-foreground")}>{side.name}</span>
          {match.scores[i]!.map((n, g) => (
            <span key={g} className={cn("w-[1.5em] shrink-0 text-right font-display text-[1.1em] leading-none tabular-nums", side.won ? "font-bold" : "text-muted-foreground")}>
              {n}
            </span>
          ))}
          {match.mark && side.won ? <span className="shrink-0 text-[0.7em] font-semibold">{match.mark}</span> : null}
        </div>
      ))}
    </div>
  );
}
