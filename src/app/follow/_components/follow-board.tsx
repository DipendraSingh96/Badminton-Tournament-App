"use client";

import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";
import { followBoard, type Followed } from "@/lib/supabase/shared-boards";
import type { BoardBracket, BoardCourt, BoardGame, BoardMatch, BoardTable } from "@/lib/tournament/audience";
import type { PublicBoard, PublicPlacing } from "@/lib/tournament/public-board";
import { cn } from "@/lib/utils";

// The players' link: one page for a phone. It shows the public snapshot the
// desk keeps up to date (see public-board.ts) and asks for it again every few
// seconds. There is nothing on it to press that changes the tournament.

/** How often the page asks for the day again, and how old a Live snapshot may be before the page says the desk has gone quiet. */
const REFRESH_MS = 15_000;
const STALE_MS = 120_000;

const subscribeNothing = () => () => {};

type Tab = "results" | "courts" | "next" | "groups" | "knockout";

const PLACE = ["", "1st", "2nd", "3rd"];

function formatDate(iso: string): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date(y!, m! - 1, d!));
}

function formatTime(at: number): string {
  return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" }).format(new Date(at));
}

function Notice({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <main className="workspace-dots grid min-h-[100dvh] place-items-center px-4 py-16 text-center">
      <div className="flex max-w-[36ch] flex-col gap-2">
        <h1 className="heading-card text-xl">{title}</h1>
        {children ? <p className="text-sm text-muted-foreground">{children}</p> : null}
      </div>
    </main>
  );
}

export function FollowBoard() {
  const isClient = useSyncExternalStore(subscribeNothing, () => true, () => false);
  // The address holds only the link's own id.
  const [link] = useState(() => (typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("t")));
  if (!isClient) return <Notice title="Loading…" />;
  if (!link) return <Notice title="No tournament to follow">Open the link the organiser sent you.</Notice>;
  return <Following link={link} />;
}

function Following({ link }: { link: string }) {
  // Undefined until the first answer; null when the link isn't shared.
  const [found, setFound] = useState<Followed | null | undefined>(undefined);
  const [failed, setFailed] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let gone = false;
    const supabase = createClient();
    const ask = async () => {
      try {
        const next = await followBoard(supabase, link);
        if (gone) return;
        setFound(next);
        setFailed(false);
      } catch {
        // Whatever was last shown stays up; the page says it couldn't refresh.
        if (!gone) setFailed(true);
      }
      if (!gone) setNow(Date.now());
    };
    void ask();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void ask();
    }, REFRESH_MS);
    const back = () => {
      if (document.visibilityState === "visible") void ask();
    };
    document.addEventListener("visibilitychange", back);
    return () => {
      gone = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", back);
    };
  }, [link]);

  if (found === undefined) {
    return failed ? <Notice title="Couldn’t load the tournament">Check your connection. This page tries again by itself.</Notice> : <Notice title="Loading…" />;
  }
  if (found === null) return <Notice title="This link is no longer shared">Ask the organiser for the current link.</Notice>;
  return <Board board={found.board} updatedAt={found.updatedAt} now={now} failed={failed} />;
}

function Board({ board, updatedAt, now, failed }: { board: PublicBoard; updatedAt: number; now: number; failed: boolean }) {
  const tabs: { value: Tab; label: string }[] = [
    ...(board.stage === "finished" && board.placings.length > 0 ? [{ value: "results" as const, label: "Results" }] : []),
    ...(board.stage === "live" ? [{ value: "courts" as const, label: "Courts" }] : []),
    ...(board.stage !== "finished" && board.upNext.length > 0 ? [{ value: "next" as const, label: board.stage === "before" ? "Schedule" : "Up next" }] : []),
    ...(board.tables.length > 0 ? [{ value: "groups" as const, label: "Groups" }] : []),
    ...(board.brackets.length > 0 ? [{ value: "knockout" as const, label: "Knockout" }] : []),
  ];
  const [chosen, setChosen] = useState<Tab | null>(null);
  // The chosen page while it is still there; otherwise the first (what matters most at this point of the day).
  const tab = tabs.some((t) => t.value === chosen) ? chosen! : (tabs[0]?.value ?? "courts");
  const stale = board.stage === "live" && now - updatedAt > STALE_MS;

  return (
    <main className="workspace-dots min-h-[100dvh] pb-12 text-sm">
      <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur">
        {board.rehearsal ? (
          <p role="status" data-rehearsal className="bg-tight px-4 py-1.5 text-center text-xs font-semibold text-tight-foreground">
            Rehearsal: not real results
          </p>
        ) : null}
        <div className="mx-auto flex w-full max-w-[960px] flex-col gap-1 px-4 pt-3">
          <h1 className="font-display text-2xl leading-tight font-bold uppercase">{board.name || "Tournament"}</h1>
          <p className="text-muted-foreground">{[formatDate(board.date), board.progress].filter(Boolean).join(" · ")}</p>
          <p
            data-updated
            className={cn("text-xs", stale || failed ? "font-medium text-tight-text" : "text-muted-foreground")}
            aria-live="polite"
          >
            {stale
              ? `Last updated ${formatTime(updatedAt)}. The desk may be offline.`
              : failed
                ? `Couldn’t refresh. Last updated ${formatTime(updatedAt)}.`
                : `Updated ${formatTime(updatedAt)} · refreshes by itself`}
          </p>
          {tabs.length > 1 ? (
            <nav aria-label="Pages" className="-mx-4 mt-1 flex gap-4 overflow-x-auto px-4">
              {tabs.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  aria-current={tab === t.value ? "page" : undefined}
                  onClick={() => setChosen(t.value)}
                  className="-mb-px shrink-0 border-b-2 border-transparent py-2 text-base font-semibold whitespace-nowrap text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring aria-[current=page]:border-primary aria-[current=page]:text-foreground"
                >
                  {t.label}
                </button>
              ))}
            </nav>
          ) : null}
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-[960px] flex-col gap-6 px-4 pt-4">
        {tabs.length === 0 ? <p className="text-muted-foreground">Nothing to show yet. The draw appears here once it is made.</p> : null}
        {tab === "results" ? <Results placings={board.placings} /> : null}
        {tab === "courts" ? <Courts board={board} /> : null}
        {tab === "next" ? <UpNext games={board.upNext} /> : null}
        {tab === "groups" ? <Groups tables={board.tables} /> : null}
        {tab === "knockout" ? <Knockout brackets={board.brackets} /> : null}
      </div>
    </main>
  );
}

function Section({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="flex items-baseline justify-between gap-3">
        <span className="heading-card text-xl">{title}</span>
        {note ? <span className="text-xs text-muted-foreground">{note}</span> : null}
      </h2>
      {children}
    </section>
  );
}

/** A side's name, and for a team the players of this match under it. */
function SideName({ side, strong = false }: { side: BoardGame["sides"][number]; strong?: boolean }) {
  return (
    <span className="min-w-0 flex-1">
      <span className={cn("block truncate", strong ? "font-bold" : "font-semibold", !side.known && "text-muted-foreground")}>{side.name}</span>
      {side.players.length > 0 ? <span className="block truncate text-xs text-muted-foreground">{side.players.join(" / ")}</span> : null}
    </span>
  );
}

const COURT_STATE: Record<BoardCourt["state"], string> = { onCourt: "On court", upNext: "Next", free: "Free", done: "Done for today" };

function Courts({ board }: { board: PublicBoard }) {
  return (
    <>
      {board.halls.map((hall) => (
        <Section key={hall.id} title={board.halls.length > 1 ? hall.name : "Courts"}>
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {hall.courts.map((court) => (
              <li key={court.courtId} data-follow-court={court.number} className="flex flex-col gap-2 rounded-lg bg-card p-3">
                <p className="flex items-baseline justify-between gap-2">
                  <span className="font-display text-lg leading-none font-bold">Court {court.number}</span>
                  <span className={cn("text-xs font-semibold", court.state === "onCourt" ? "text-primary" : "text-muted-foreground")}>
                    {court.state === "upNext" && court.game ? `Next · ${court.game.time}` : COURT_STATE[court.state]}
                  </span>
                </p>
                {court.game ? (
                  <>
                    <p className="truncate text-xs text-muted-foreground">{[court.game.category, court.game.where, court.game.rubber].filter(Boolean).join(" · ")}</p>
                    <div className={cn("flex flex-col gap-1", court.state !== "onCourt" && "opacity-70")}>
                      {court.game.sides.map((side, i) => (
                        <p key={i} className="flex items-center gap-3">
                          <SideName side={side} />
                          {court.state === "onCourt" ? (
                            <span className="flex shrink-0 gap-2 font-display text-lg leading-none font-bold tabular-nums">
                              {court.game!.games.length === 0 ? <span className="text-muted-foreground">–</span> : null}
                              {court.game!.games.map((points, g) => (
                                <span key={g}>{points[i] ?? "–"}</span>
                              ))}
                            </span>
                          ) : null}
                        </p>
                      ))}
                    </div>
                    {court.game.tie ? (
                      <p className="text-xs text-muted-foreground">
                        Matches won: {court.game.tie[0]}–{court.game.tie[1]}
                      </p>
                    ) : null}
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground">{court.state === "done" ? "No more games on this court." : "Nothing on it just now."}</p>
                )}
              </li>
            ))}
          </ul>
        </Section>
      ))}
    </>
  );
}

function UpNext({ games }: { games: BoardGame[] }) {
  return (
    <Section title="In order" note="Times move as the day does">
      <ol className="flex flex-col gap-2">
        {games.map((game) => (
          <li key={game.id} className="flex items-center gap-3 rounded-lg bg-card p-3">
            <span className="flex w-14 shrink-0 flex-col">
              <span className="font-display text-lg leading-none font-bold tabular-nums">{game.time}</span>
              <span className="text-xs text-muted-foreground">{game.court === null ? "" : `Court ${game.court}`}</span>
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="truncate text-xs text-muted-foreground">{[game.category, game.where, game.rubber].filter(Boolean).join(" · ")}</span>
              <span className="flex flex-col">
                <SideName side={game.sides[0]} />
                <SideName side={game.sides[1]} />
              </span>
            </span>
          </li>
        ))}
      </ol>
    </Section>
  );
}

function Groups({ tables }: { tables: BoardTable[] }) {
  const several = new Set(tables.map((t) => t.categoryId)).size > 1;
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {tables.map((table) => (
        <section key={`${table.categoryId}:${table.letter}`} className="flex flex-col gap-2 rounded-lg bg-card p-3">
          <h2 className="flex items-baseline justify-between gap-3">
            <span className="font-semibold">{several ? `${table.category} · Group ${table.letter}` : `Group ${table.letter}`}</span>
            <span className="text-xs text-muted-foreground">{table.progress}</span>
          </h2>
          <table className="w-full text-left">
            <thead>
              <tr className="text-xs text-muted-foreground">
                <th scope="col" className="w-6 py-1 font-normal">
                  <span className="sr-only">Place</span>
                </th>
                <th scope="col" className="py-1 font-normal">
                  <span className="sr-only">Entry</span>
                </th>
                <th scope="col" className="w-7 py-1 text-right font-normal" title="Played">P</th>
                <th scope="col" className="w-7 py-1 text-right font-normal" title="Won">W</th>
                <th scope="col" className="w-7 py-1 text-right font-normal" title="Lost">L</th>
                <th scope="col" className="w-10 py-1 text-right font-normal" title="Points for less points against">+/−</th>
              </tr>
            </thead>
            <tbody>
              {table.rows.map((row, i) => (
                <tr key={i} className={cn("border-t", row.cut && "border-b-2 border-b-primary")}>
                  <td className="py-1.5 text-muted-foreground tabular-nums">{row.place}</td>
                  <td className="max-w-0 py-1.5">
                    <span className="block truncate font-semibold">{row.name}</span>
                    {row.standing ? <span className="block text-xs text-muted-foreground">{row.standing}</span> : null}
                  </td>
                  <td className="py-1.5 text-right tabular-nums">{row.played}</td>
                  <td className="py-1.5 text-right tabular-nums">{row.won}</td>
                  <td className="py-1.5 text-right tabular-nums">{row.lost}</td>
                  <td className="py-1.5 text-right tabular-nums">{row.difference}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
    </div>
  );
}

function Match({ match }: { match: BoardMatch }) {
  return (
    <li className="flex flex-col gap-1 rounded-lg bg-card p-3">
      <p className="flex items-baseline justify-between gap-3 text-xs text-muted-foreground">
        <span className="font-semibold">{match.label}</span>
        <span>{match.mark ?? match.when ?? ""}</span>
      </p>
      {match.sides.map((side, i) => (
        <p key={i} className="flex items-center gap-3">
          <SideName side={side} strong={side.won} />
          <span className={cn("flex shrink-0 gap-2 tabular-nums", side.won ? "font-bold" : "text-muted-foreground")}>
            {match.scores[i]!.map((score, g) => (
              <span key={g}>{score}</span>
            ))}
          </span>
        </p>
      ))}
    </li>
  );
}

function Knockout({ brackets }: { brackets: BoardBracket[] }) {
  return (
    <>
      {brackets.map((bracket) => (
        <Section key={bracket.categoryId} title={brackets.length > 1 ? bracket.category : "Knockout"} note={bracket.champion ? `Winner: ${bracket.champion}` : undefined}>
          {/* The latest round first: the final is what people come to see. */}
          {[...bracket.rounds].reverse().map((round) => (
            <div key={round.name} className="flex flex-col gap-2">
              <h3 className="text-xs font-semibold text-muted-foreground">{round.name}</h3>
              <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {round.matches.map((match) => (
                  <Match key={match.code} match={match} />
                ))}
                {round === bracket.rounds.at(-1) && bracket.bronze ? <Match match={bracket.bronze} /> : null}
              </ul>
            </div>
          ))}
        </Section>
      ))}
    </>
  );
}

function Results({ placings }: { placings: PublicPlacing[] }) {
  return (
    <>
      {placings.map((category) => (
        <Section key={category.categoryId} title={category.category}>
          <ol className="flex flex-col gap-2">
            {category.places.map((place, i) => (
              <li key={i} className={cn("flex items-center gap-3 rounded-lg bg-card p-3", place.place === 1 && "ring-1 ring-primary")}>
                <span className="w-10 shrink-0 font-display text-xl leading-none font-bold">{PLACE[place.place] ?? `${place.place}th`}</span>
                <span className="min-w-0 flex-1">
                  {place.names.map((name) => (
                    <span key={name} className="block truncate font-semibold">
                      {name}
                    </span>
                  ))}
                </span>
                {place.group ? <span className="shrink-0 text-xs text-muted-foreground">Group {place.group}</span> : null}
              </li>
            ))}
          </ol>
        </Section>
      ))}
    </>
  );
}
