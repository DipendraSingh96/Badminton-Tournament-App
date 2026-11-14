"use client";

import {
  CaretLeftIcon,
  CaretRightIcon,
  CornersInIcon,
  CornersOutIcon,
  MoonIcon,
  PauseIcon,
  PlayIcon,
  SunIcon,
} from "@phosphor-icons/react";
import { useTheme } from "next-themes";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { TooltipProvider } from "@/components/ui/tooltip";
import { analyseTournament, estimateSchedule } from "@/engine";
import {
  boardBracket,
  boardCalls,
  boardCourts,
  boardPages,
  boardProgress,
  boardTables,
  boardUpNext,
  type BoardPage,
} from "@/lib/tournament/audience";
import { BOARD_LOST_MS, BOARD_PING_MS, boardChannel, type BoardDay, type BoardMessage } from "@/lib/tournament/board-channel";
import type { PlanDraft } from "@/lib/tournament/draft";
import { liveDay } from "@/lib/tournament/live-day";
import { parsePlan, timingInputs } from "@/lib/tournament/schema";
import { loadTournament } from "@/lib/tournament/storage";
import { minutesOfDay } from "@/lib/tournament/time";
import { cn } from "@/lib/utils";
import { IconButton } from "../../plan/_components/fields";
import { localSegments } from "../../plan/_components/timeline";
import { formatClock } from "../../plan/_components/workings";
import { CallBand, CourtsPage, KnockoutPage, TablesPage, UP_NEXT_ROW_EM, UpNextPanel, tableHeightEm } from "./board-pages";

// The audience board: the hall's screen. It is read-only, sized to its
// window with no scrolling, and turns its own pages. It shows the day as the
// desk's window sends it; with no desk window open, the tournament as saved.

const subscribeNothing = () => () => {};

/** A beat every few seconds: the clock, and whether the desk has gone quiet. */
function subscribeBeat(listener: () => void): () => void {
  const timer = window.setInterval(listener, 1000);
  return () => window.clearInterval(timer);
}
const beatNow = () => Math.floor(Date.now() / BOARD_PING_MS);

function subscribeFullscreen(listener: () => void): () => void {
  document.addEventListener("fullscreenchange", listener);
  return () => document.removeEventListener("fullscreenchange", listener);
}

// How long each page stays up, chosen on the board and kept on this device. Not a tournament value.
const TURN_KEY = "badminton:board-turn";
const TURN_SECONDS = [10, 15, 20, 30, 45, 60];
const TURN_DEFAULT = 15;
/** How long each pair of calls to the desk stays up when there are more than fit. */
const CALL_TURN_MS = 6000;
/** How long the controls stay after the mouse stops. */
const CONTROLS_MS = 3000;

interface Turn {
  seconds: number;
  paused: boolean;
}

function loadTurn(): Turn {
  try {
    const saved = JSON.parse(window.localStorage.getItem(TURN_KEY) ?? "null") as Partial<Turn> | null;
    return { seconds: TURN_SECONDS.includes(saved?.seconds ?? 0) ? saved!.seconds! : TURN_DEFAULT, paused: saved?.paused === true };
  } catch {
    return { seconds: TURN_DEFAULT, paused: false };
  }
}

function saveTurn(turn: Turn) {
  try {
    window.localStorage.setItem(TURN_KEY, JSON.stringify(turn));
  } catch {
    // Not remembered; the board turns at its usual pace next time.
  }
}

/** An element's size, and the size of its text, as the window changes. */
function useSize<T extends HTMLElement>(): [React.RefObject<T | null>, { width: number; height: number; em: number } | null] {
  const ref = useRef<T | null>(null);
  const [size, setSize] = useState<{ width: number; height: number; em: number } | null>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const measure = () => {
      const box = element.getBoundingClientRect();
      const em = parseFloat(getComputedStyle(element).fontSize) || 16;
      setSize((was) => (was && was.width === box.width && was.height === box.height && was.em === em ? was : { width: box.width, height: box.height, em }));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, size];
}

/**
 * Courts with something new on them, each for about three seconds: a new
 * game has come onto the court, or it was waiting for the desk and the desk
 * has dealt with it.
 */
function useCourtNews(byCourt: Map<string, string>, stuck: Map<string, string>): readonly string[] {
  const [news, setNews] = useState<readonly string[]>([]);
  const last = useRef<{ byCourt: Map<string, string>; stuck: Map<string, string> } | null>(null);
  const key = [...byCourt].map(([court, game]) => `${court}=${game}${stuck.has(court) ? "!" : ""}`).join("|");
  useEffect(() => {
    const before = last.current;
    last.current = { byCourt, stuck };
    if (!before || before.byCourt.size === 0) return;
    const changed = [...byCourt]
      .filter(([court, game]) => (before.byCourt.has(court) && before.byCourt.get(court) !== game) || (before.stuck.has(court) && !stuck.has(court)))
      .map(([court]) => court);
    for (const court of before.stuck.keys()) if (!byCourt.has(court) && !changed.includes(court)) changed.push(court);
    if (changed.length === 0) return;
    const on = window.setTimeout(() => setNews((list) => [...list, ...changed]), 0);
    window.setTimeout(() => setNews((list) => list.filter((c) => !changed.includes(c))), 3000);
    return () => window.clearTimeout(on);
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return news;
}

function Notice({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-background p-6">
      <p className="max-w-md text-center text-sm text-muted-foreground">{children}</p>
    </main>
  );
}

export function AudienceBoard() {
  const isClient = useSyncExternalStore(subscribeNothing, () => true, () => false);
  // The address holds only the tournament's id.
  const [id] = useState(() => (typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("t")));
  if (!isClient) return <Notice>Loading the board…</Notice>;
  if (!id) return <Notice>No tournament chosen. Open the audience board from the tournament&apos;s Live stage.</Notice>;
  return (
    <TooltipProvider>
      <Board id={id} />
    </TooltipProvider>
  );
}

function Board({ id }: { id: string }) {
  // The tournament as saved, for when no desk window is open; and the day as the desk last sent it.
  const [saved, setSaved] = useState<PlanDraft | null>(() => loadTournament(id));
  const [sent, setSent] = useState<BoardDay | null>(null);
  const [heard, setHeard] = useState<number | null>(null);
  const beat = useSyncExternalStore(subscribeBeat, beatNow, () => 0);

  useEffect(() => {
    const channel = boardChannel(id);
    if (!channel) return;
    channel.onmessage = (event: MessageEvent<BoardMessage>) => {
      const message = event.data;
      if (message.type === "day") setSent({ draft: message.draft, now: message.now, clock: message.clock });
      else if (message.type === "ping") setSent((was) => (was ? { ...was, now: message.now, clock: message.clock } : was));
      else return;
      setHeard(Date.now());
    };
    channel.postMessage({ type: "hello" } satisfies BoardMessage);
    return () => channel.close();
  }, [id]);

  // The saved tournament, read again whenever the desk saves it.
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key.endsWith(id)) setSaved(loadTournament(id));
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [id]);

  const connected = sent !== null && heard !== null && beat * BOARD_PING_MS - heard < BOARD_LOST_MS;
  const draft = connected ? sent.draft : saved;

  if (!draft) return <Notice>This tournament isn&apos;t on this device. Open the audience board from the tournament&apos;s Live stage.</Notice>;
  if (draft.stage !== "live") return <Notice>This tournament isn&apos;t Live yet. The board fills in once it goes Live.</Notice>;
  return <LiveBoard draft={draft} desk={connected ? sent : null} beat={beat} />;
}

function LiveBoard({ draft, desk, beat }: { draft: PlanDraft; desk: BoardDay | null; beat: number }) {
  const timeZone = draft.frame.timeZone;
  const realClock = formatClock(new Date(beat * BOARD_PING_MS).toISOString(), timeZone);
  const now = desk ? desk.now : minutesOfDay(realClock);
  const clockText = desk?.clock ?? realClock;

  // The schedule, worked out as the desk works it out.
  const { segments, groups } = useMemo(() => {
    const inputs = timingInputs(parsePlan(draft));
    const analysis = inputs ? analyseTournament(inputs) : null;
    const schedule = inputs && analysis?.ok ? estimateSchedule(inputs, analysis.analysis) : null;
    // The group each court is kept for, where groups have their own courts.
    const groups = new Map(
      (schedule?.courtGroups ?? [])
        .filter((c) => c.groups.length > 0)
        .map((c) => [c.courtId, `${c.groups.length > 1 ? "Groups" : "Group"} ${c.groups.map((g) => g.group).join(", ")}`]),
    );
    return { segments: localSegments(draft, schedule), groups };
  }, [draft]);
  const day = useMemo(() => {
    const courtIds = draft.frame.halls.flatMap((h) => h.courts.map((c) => c.id));
    return liveDay(draft, segments, { now, minuteOf: (iso) => minutesOfDay(formatClock(iso, timeZone)), courtIds });
  }, [draft, segments, now, timeZone]);

  const halls = useMemo(() => boardCourts(draft, segments, day), [draft, segments, day]);
  const upNext = useMemo(() => boardUpNext(draft, segments, day), [draft, segments, day]);
  const calls = useMemo(() => boardCalls(draft, segments, day), [draft, segments, day]);
  const tables = useMemo(() => boardTables(draft), [draft]);
  const brackets = useMemo(() => draft.categories.flatMap((c) => boardBracket(draft, segments, day, c) ?? []), [draft, segments, day]);
  const progress = boardProgress(draft, segments, day);
  const news = useCourtNews(day.byCourt, day.stuck);

  // What fits: the main area's tables to a page, and the rows of Up next.
  const [mainRef, mainSize] = useSize<HTMLDivElement>();
  const [nextRef, nextSize] = useSize<HTMLDivElement>();
  const tableColumns = !mainSize ? 2 : mainSize.width / mainSize.em >= 100 ? 3 : mainSize.width / mainSize.em >= 50 ? 2 : 1;
  const tallest = Math.max(1, ...tables.map((t) => t.rows.length));
  const tablesPerPage = !mainSize ? tableColumns * 2 : tableColumns * Math.max(1, Math.floor((mainSize.height / mainSize.em + 0.75) / (tableHeightEm(tallest) + 0.75)));
  const upNextFit = !nextSize ? 0 : Math.floor((nextSize.height / nextSize.em - 5.4) / UP_NEXT_ROW_EM);

  const pages = useMemo(
    () => boardPages(tables, brackets, draft.categories.map((c) => c.id), tablesPerPage),
    [tables, brackets, draft.categories, tablesPerPage],
  );

  // The turning: by itself, at the pace chosen on the board.
  const [turn, setTurn] = useState(loadTurn);
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (turn.paused || pages.length < 2) return;
    const timer = window.setInterval(() => setIndex((i) => i + 1), turn.seconds * 1000);
    return () => window.clearInterval(timer);
  }, [turn.paused, turn.seconds, pages.length]);
  // Calls to the desk take turns too, a little faster than the pages.
  const [callTurn, setCallTurn] = useState(0);
  const manyCalls = calls.length > 2;
  useEffect(() => {
    if (!manyCalls) return;
    const timer = window.setInterval(() => setCallTurn((t) => t + 1), CALL_TURN_MS);
    return () => window.clearInterval(timer);
  }, [manyCalls]);
  const at = ((index % pages.length) + pages.length) % pages.length;
  const page = pages[at]!;
  function changeTurn(next: Turn) {
    setTurn(next);
    saveTurn(next);
  }

  // The controls: there when the mouse moves, gone a few seconds after it stops.
  const [controls, setControls] = useState(false);
  const hide = useRef<number | null>(null);
  function wake() {
    setControls(true);
    if (hide.current !== null) window.clearTimeout(hide.current);
    hide.current = window.setTimeout(() => setControls(false), CONTROLS_MS);
  }
  useEffect(
    () => () => {
      if (hide.current !== null) window.clearTimeout(hide.current);
    },
    [],
  );

  const { resolvedTheme, setTheme } = useTheme();
  const dark = resolvedTheme === "dark";
  const fullscreen = useSyncExternalStore(subscribeFullscreen, () => document.fullscreenElement !== null, () => false);

  return (
    <main
      data-board
      onMouseMove={wake}
      className={cn("fixed inset-0 flex flex-col gap-[0.75em] overflow-hidden bg-background p-[1em] text-foreground", !controls && "cursor-none")}
      // The board's own scale: every size on it is in em, and grows with the window.
      style={{ fontSize: "clamp(10px, min(1.05vw, 1.9vh), 32px)" }}
    >
      <header className="flex shrink-0 items-center gap-[1.5em]">
        <h1 className="min-w-0 flex-1 truncate font-display text-[2em] leading-none font-bold">{draft.name.trim() || "Tournament"}</h1>
        <p data-board-progress className="shrink-0 text-[1.1em] text-muted-foreground tabular-nums">
          {progress}
        </p>
        <p data-board-clock className="shrink-0 font-display text-[2.2em] leading-none font-bold tabular-nums">
          {clockText}
        </p>
      </header>

      <CallBand calls={calls} turn={callTurn} />

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_minmax(0,27%)] gap-[0.75em]">
        <section aria-label={pageTitle(page)} className="relative flex min-h-0 min-w-0 flex-col gap-[0.6em]">
          {/* The courts page has no heading of its own: each hall's name heads its courts. The dots sit over them, at the right. */}
          <div data-board-page={page.kind} className={cn("flex shrink-0 items-center justify-between gap-[1em]", page.kind === "courts" && "absolute top-0 right-0 z-10 h-[1.3em]")}>
            {page.kind === "courts" ? null : <h2 className="truncate font-display text-[1.3em] leading-none font-bold">{pageTitle(page)}</h2>}
            {pages.length > 1 ? (
              <ol aria-label={`Page ${at + 1} of ${pages.length}`} className="flex shrink-0 items-center gap-[0.35em]">
                {pages.map((_, i) => (
                  <li key={i} className={cn("size-[0.5em] rounded-full", i === at ? "bg-primary" : "bg-border")} />
                ))}
              </ol>
            ) : null}
          </div>
          <div ref={mainRef} className="flex min-h-0 flex-1 flex-col">
            {page.kind === "courts" ? <CourtsPage halls={halls} groups={groups} news={news} /> : null}
            {page.kind === "tables" ? (
              <TablesPage
                tables={tables.filter((t) => t.categoryId === page.categoryId).slice(page.from, page.from + page.count)}
                columns={tableColumns}
                room={mainSize ? { width: mainSize.width / mainSize.em, height: mainSize.height / mainSize.em } : null}
              />
            ) : null}
            {page.kind === "knockout" ? <KnockoutPage bracket={brackets.find((b) => b.categoryId === page.categoryId)!} /> : null}
          </div>
        </section>
        <div ref={nextRef} className="flex min-h-0 min-w-0 flex-col">
          <div className="flex min-h-0 flex-1 flex-col [&>aside]:flex-1">
            <UpNextPanel games={upNext} fit={upNextFit} />
          </div>
        </div>
      </div>

      {!desk ? (
        <p data-board-lost className="pointer-events-none absolute bottom-[0.6em] left-[1em] text-[0.7em] text-muted-foreground">
          Not connected to the desk
        </p>
      ) : null}

      <div
        role="toolbar"
        aria-label="Board controls"
        // Sized for the person at the laptop, not the hall: the app's own sizes.
        style={{ fontSize: "14px" }}
        className={cn(
          "absolute bottom-4 left-1/2 flex -translate-x-1/2 cursor-auto items-center gap-1 rounded-lg border bg-card p-1 shadow-lg transition-opacity focus-within:opacity-100",
          controls ? "opacity-100" : "pointer-events-none opacity-0 focus-within:pointer-events-auto",
        )}
      >
        <IconButton label="Previous page" disabled={pages.length < 2} onClick={() => setIndex((i) => i - 1)}>
          <CaretLeftIcon />
        </IconButton>
        <IconButton label={turn.paused ? "Turn the pages again" : "Hold this page"} disabled={pages.length < 2} onClick={() => changeTurn({ ...turn, paused: !turn.paused })}>
          {turn.paused ? <PlayIcon /> : <PauseIcon />}
        </IconButton>
        <IconButton label="Next page" disabled={pages.length < 2} onClick={() => setIndex((i) => i + 1)}>
          <CaretRightIcon />
        </IconButton>
        <NativeSelect size="sm" aria-label="Seconds each page stays up" value={turn.seconds} onChange={(e) => changeTurn({ ...turn, seconds: Number(e.target.value) })}>
          {TURN_SECONDS.map((s) => (
            <NativeSelectOption key={s} value={s}>
              {s} seconds a page
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <IconButton label={dark ? "Light board" : "Dark board"} onClick={() => setTheme(dark ? "light" : "dark")}>
          {dark ? <SunIcon /> : <MoonIcon />}
        </IconButton>
        <IconButton
          label={fullscreen ? "Leave full screen" : "Full screen"}
          onClick={() => {
            if (document.fullscreenElement) void document.exitFullscreen();
            else void document.documentElement.requestFullscreen().catch(() => {});
          }}
        >
          {fullscreen ? <CornersInIcon /> : <CornersOutIcon />}
        </IconButton>
      </div>
    </main>
  );
}

function pageTitle(page: BoardPage): string {
  if (page.kind === "courts") return "Courts";
  if (page.kind === "knockout") return `${page.category} · Knockout`;
  return `${page.category} · Group tables${page.parts > 1 ? ` (${page.part} of ${page.parts})` : ""}`;
}
