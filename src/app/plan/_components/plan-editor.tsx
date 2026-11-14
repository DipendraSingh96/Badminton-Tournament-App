"use client";

import { produce } from "immer";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties , type ReactNode } from "react";
import { useDefaultLayout, usePanelRef } from "react-resizable-panels";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { CaretLeftIcon, PlayIcon, XIcon } from "@phosphor-icons/react";
import { ConfirmProvider, useConfirm } from "@/components/ui/confirm";
import { ScrollHints } from "@/components/ui/scroll-hints";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { analyseTournament, estimateSchedule, rulesFor, zoneOf, type LeverChange, type Stage } from "@/engine";
import { emptyHistory, record, redo as redoIn, undo as undoIn } from "@/lib/tournament/history";
import { applyLever } from "@/lib/tournament/levers";
import { canGoLive, courtNumber, duplicateDraft, emptyDraft, type PlanDraft, type TournamentStage } from "@/lib/tournament/draft";
import { fillStage } from "@/lib/tournament/dummy/fill";
import { dummySummary, liveMarks, ownDataLeft, removeDummy, sampleFields, type SampleStage } from "@/lib/tournament/dummy/marks";
import { clock, minutesOfDay } from "@/lib/tournament/time";
import { useDeveloperTools } from "@/lib/developer";
import { SIMULATION } from "@/lib/tournament/dummy/values";
import { dayAfter, eventsBy, holdEvent, holdOf, restamp, simulateDay, type SimEvent } from "@/lib/tournament/simulate";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { SimulationControls } from "./dummy-data";
import { WatchOnlyContext } from "./watch-only";
import { LiveAttentionContext, type LiveAttention } from "./attention";
import { ResourcesView } from "./resources-view";
import type { FixAt } from "@/lib/tournament/resources";
import { formatClock } from "./workings";
import type { LocalSegment } from "./timeline";
import { parsePlan, timingInputs, type PlanIssue } from "@/lib/tournament/schema";
import {
  createTournament,
  deleteTournament,
  loadIndex,
  loadTournament,
  saveTournament,
  setCurrent,
  type TournamentIndex,
} from "@/lib/tournament/storage";
import { DerivedCards } from "./dashboard";
import { COURT_SIZES, CourtSelectionContext, CourtSizeContext, VenueFixedContext, type CourtSize } from "./court-card";
import { DrawPanel, TeamOpenContext, type DrawFocus } from "./draw-panel";
import { DrawStage, type DrawStageView } from "./draw-stage";
import { SampleDataButtons } from "./dummy-data";
import { PreviewBar } from "./preview-bar";
import { StageBar } from "./stage-bar";
import { IconButton, IssuesContext, MoneyHiddenContext, ReadOnly, issueMap, pathKey } from "./fields";
import { goLive, moveGame, startReadyGames, startTournament } from "@/lib/tournament/changes";
import { matchRef } from "@/lib/tournament/entries";
import { liveDay } from "@/lib/tournament/live-day";
import { BOARD_PING_MS, boardChannel, type BoardDay, type BoardMessage } from "@/lib/tournament/board-channel";
import { AudienceBoardButton } from "./audience-button";
import { courtQueues, gameState, stapledWith, timingOf } from "@/lib/tournament/live";
import { LiveMovesContext, type LiveMoves } from "./live-moves";
import { CourtBoard } from "./court-board";
import { LivePanel, type CanMove, type LiveFilter, type LiveTab } from "./live-panel";
import { LiveStage, type LiveStageView } from "./live-stage";
import { FinanceTab } from "./finance-tab";
import { ScheduleTab } from "./schedule-tab";
import { SetupTab } from "./setup-tab";
import { RailSummary, Summary } from "./summary";
import { ViewRangeContext, viewRangeOf, type ViewRange } from "./time-window";
import { Timeline, courtStatuses, dayRange, localSegments, zoneRows, zoneWarnings } from "./timeline";
import { NameRow, StageRow } from "./tournament-bar";
import { TournamentHeader } from "./tournament-header";
import { Sidebar } from "./sidebar";
import { VenueCanvas } from "./venue-canvas";

export type Update = (recipe: (draft: PlanDraft) => void) => void;

/**
 * A simulated day (developer tools): the day it was last worked out from,
 * the events from then on, the minute that was, and the seed that keeps it
 * the same day each time it is worked out again. Never saved.
 */
interface Simulation {
  base: PlanDraft;
  events: SimEvent[];
  from: number;
  seed: number;
  /** "I enter the scores": the simulation starts games and waits for the desk to score and finish them. */
  deskScores: boolean;
}

/** A court's number from its id; null if it is no longer in the venue. */
function courtNumberOf(draft: PlanDraft, courtId: string): number | null {
  for (const [h, hall] of draft.frame.halls.entries()) {
    const c = hall.courts.findIndex((court) => court.id === courtId);
    if (c !== -1) return courtNumber(draft.frame.halls, h, c);
  }
  return null;
}

/** A draft's schedule as the timeline's games, with the plan as the engine reads it (null if it can't be read). */
function scheduleOf(draft: PlanDraft) {
  const inputs = timingInputs(parsePlan(draft));
  const analysis = inputs ? analyseTournament(inputs) : null;
  const schedule = inputs && analysis?.ok ? estimateSchedule(inputs, analysis.analysis) : null;
  return { inputs, segments: localSegments(draft, schedule) };
}

/** The rest of a simulated day from a minute; null if the plan can't be read. */
function simulateFrom(draft: PlanDraft, seed: number, from: number, deskScores: boolean): SimEvent[] | null {
  const { inputs, segments } = scheduleOf(draft);
  if (!inputs) return null;
  return simulateDay(
    draft,
    segments,
    (game) => {
      const category = inputs.categories.find((c) => c.id === game.match.categoryId);
      return category ? rulesFor(inputs, category, game.match.stage as Stage) : undefined;
    },
    seed,
    from,
    { deskScores },
  );
}

type Tab = "setup" | "schedule" | "finance";

// The workbench and the timeline are cards on the tournament's surface. Between
// them and the venue, a gutter that drags to resize and shows a line on hover.
const GUTTER =
  "bg-transparent after:bg-transparent hover:after:bg-border focus-visible:after:bg-ring aria-[orientation=vertical]:w-2 aria-[orientation=vertical]:after:w-px aria-[orientation=horizontal]:h-2 aria-[orientation=horizontal]:after:h-px focus-visible:ring-0";
/** The central column the tournament sits in: at most 960px, centred in the space the workbench leaves. */
const COLUMN = "mx-auto w-full max-w-[960px]";
/** A gutter that is also a soft divider: a faint line, stronger on hover. */
const DIVIDER =
  GUTTER.replace("after:bg-transparent", "after:bg-border") +
  // The line sits at the gutter's lower edge, flush with the timeline's glass.
  " aria-[orientation=horizontal]:after:left-4 aria-[orientation=horizontal]:after:w-[calc(100%-2rem)] aria-[orientation=horizontal]:after:top-auto aria-[orientation=horizontal]:after:bottom-0 aria-[orientation=horizontal]:after:translate-y-0";
/** The workbench, from the top of the shell, with an open divider at its left: a line that stops 16px short of the shell's edges. */
const WORKBENCH =
  "relative flex shrink-0 flex-col pt-4 before:absolute before:top-4 before:bottom-4 before:left-0 before:w-px before:bg-border";
/** Text running down the folded rail. */
const RAIL_TEXT = "text-xl font-semibold whitespace-nowrap [writing-mode:vertical-rl]";

/**
 * A side panel folded to its rail: 64px wide, and the whole of it one button
 * that opens the panel again, so it is easy to see and to hit.
 */
function Rail({ name, open, onOpen, children }: { name: string; open: string; onOpen: () => void; children: ReactNode }) {
  return (
    <aside aria-label={`${name} (hidden)`} className={cn(WORKBENCH, "w-16 overflow-hidden pt-0")}>
      <button
        type="button"
        aria-label={open}
        aria-expanded={false}
        title={open}
        onClick={onOpen}
        className="flex min-h-0 w-full flex-1 cursor-pointer flex-col items-center gap-4 pt-4 pb-4 text-foreground transition-colors outline-none hover:bg-inset focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
      >
        <CaretLeftIcon className="size-5 shrink-0" aria-hidden="true" />
        {children}
      </button>
    </aside>
  );
}

/** The timeline folded to its bar. */
const TIMELINE_FOLDED = 40;

// The real clock, a minute at a time, for the Live timeline's cursor.
function subscribeClock(listener: () => void): () => void {
  const timer = window.setInterval(listener, 5000);
  return () => window.clearInterval(timer);
}
const clockMinuteNow = () => Math.floor(Date.now() / 60000);
/** The Live cursor follows the clock: it isn't moved by hand. */
const noSeek = () => {};
const noPlaying = () => {};

const STAGE_ORDER: TournamentStage[] = ["plan", "draw", "live", "results"];
const STAGE_NAMES: Record<TournamentStage, string> = { plan: "Plan", draw: "Draw", live: "Live", results: "Results" };

const TABS: { value: Tab; label: string }[] = [
  { value: "setup", label: "Setup" },
  { value: "schedule", label: "Schedule" },
  { value: "finance", label: "Budget" },
];

// Per-viewer conveniences, kept in this browser only.
const TAB_KEY = "badminton:plan-tab";

function loadTab(): Tab {
  try {
    const saved = window.localStorage.getItem(TAB_KEY);
    return TABS.some((t) => t.value === saved) ? (saved as Tab) : "setup";
  } catch {
    return "setup";
  }
}

function saveTab(tab: Tab) {
  try {
    window.localStorage.setItem(TAB_KEY, tab);
  } catch {
    // Not remembered; nothing else depends on it.
  }
}

const SETUP_FIELDS: PropertyKey[] = ["name", "event", "lineUp"];
const FEE_FIELDS: PropertyKey[] = ["feeBasis", "feeAmount", "externalFeeAmount"];

/** Which workbench tab holds the field an issue points at; null for the middle area. */
function tabFor(issue: PlanIssue): Tab | null {
  switch (issue.path[0]) {
    case "unit":
    case "format":
    case "rules":
      return "setup";
    case "categories": {
      const field = issue.path[2];
      if (field === undefined || SETUP_FIELDS.includes(field)) return "setup";
      return FEE_FIELDS.includes(field) ? "finance" : "schedule";
    }
    case "stageRules":
    case "bestOfThreeAllowance":
      return "schedule";
    case "finance":
      return "finance";
    case "frame":
      return issue.path[1] === "bufferMinutes" || issue.path[1] === "bufferStart" ? "schedule" : null;
    default:
      return null;
  }
}

/** The parts of the plan, in order; items still missing are counted by part. */
const PROGRESS_PARTS = ["Basics", "Venue", "Setup", "Schedule", "Budget"] as const;

/** Which part of the plan a missing item belongs to. */
function partOf(issue: PlanIssue): (typeof PROGRESS_PARTS)[number] {
  if (issue.path[0] === "frame") {
    if (issue.path[1] === "halls") return "Venue";
    if (issue.path[1] === "bufferMinutes" || issue.path[1] === "bufferStart") return "Schedule";
    return "Basics";
  }
  const tab = tabFor(issue);
  return tab === "setup" ? "Setup" : tab === "schedule" ? "Schedule" : tab === "finance" ? "Budget" : "Basics";
}

// The workbench, folded to a rail or not.
const WORKBENCH_KEY = "badminton:workbench-folded";

function loadWorkbenchFolded(): boolean {
  try {
    return window.localStorage.getItem(WORKBENCH_KEY) === "folded";
  } catch {
    return false;
  }
}

function saveWorkbenchFolded(folded: boolean) {
  try {
    window.localStorage.setItem(WORKBENCH_KEY, folded ? "folded" : "open");
  } catch {
    // Not remembered; the workbench opens next time.
  }
}

// How large the venue's courts are drawn.
const COURT_SIZE_KEY = "badminton:court-size";

function loadCourtSize(): CourtSize {
  try {
    const saved = window.localStorage.getItem(COURT_SIZE_KEY);
    return COURT_SIZES.includes(saved as CourtSize) ? (saved as CourtSize) : "large";
  } catch {
    return "large";
  }
}

function saveCourtSize(size: CourtSize) {
  try {
    window.localStorage.setItem(COURT_SIZE_KEY, size);
  } catch {
    // Not remembered; courts are large next time.
  }
}

// The tournament list, collapsed to a rail or not.
const SIDEBAR_KEY = "badminton:plan-sidebar";

function loadSidebarCollapsed(): boolean {
  try {
    return window.localStorage.getItem(SIDEBAR_KEY) === "collapsed";
  } catch {
    return false;
  }
}

function saveSidebarCollapsed(collapsed: boolean) {
  try {
    window.localStorage.setItem(SIDEBAR_KEY, collapsed ? "collapsed" : "open");
  } catch {
    // Not remembered; the list opens next time.
  }
}

function browserTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/** What the editor can do with the list of saved tournaments. */
interface TournamentActions {
  index: TournamentIndex;
  onSave: (id: string, draft: PlanDraft) => void;
  onNew: () => void;
  onDuplicate: (draft: PlanDraft) => void;
  onDelete: (id: string) => void;
  onOpen: (id: string) => void;
}

function Editor({ id, tournaments }: { id: string; tournaments: TournamentActions }) {
  const [draft, setDraft] = useState<PlanDraft>(() => loadTournament(id) ?? emptyDraft(browserTimeZone()));
  const confirm = useConfirm();
  const [tab, setTab] = useState<Tab>(loadTab);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(loadSidebarCollapsed);
  const [courtSize, setCourtSize] = useState<CourtSize>(loadCourtSize);
  const courtSizing = useMemo(
    () => ({
      size: courtSize,
      setSize: (size: CourtSize) => {
        setCourtSize(size);
        saveCourtSize(size);
      },
    }),
    [courtSize],
  );
  // The timeline's playhead, in minutes since midnight; not saved.
  const [playhead, setPlayhead] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  // The timeline docked under the venue: its height is remembered too.
  const dock = useDefaultLayout({ id: "badminton:plan-layout-v", storage: window.localStorage });

  // A suggested lever being previewed: everything derived shows the plan with it; not saved.
  const [preview, setPreview] = useState<LeverChange | null>(null);
  // Developer tools: a simulated day on the Live stage. The ref is the simulation as of the last change to it.
  const [sim, setSim] = useState<Simulation | null>(null);
  const simNow = useRef<Simulation | null>(null);
  const putSim = (next: Simulation | null) => {
    simNow.current = next;
    setSim(next);
  };

  // Autosave: each change is saved to this tournament. Opening it isn't a change.
  const savedDraft = useRef(draft);
  const { onSave } = tournaments;
  useEffect(() => {
    if (draft === savedDraft.current) return;
    savedDraft.current = draft;
    onSave(id, draft);
  }, [draft, id, onSave]);

  // Undo and redo: earlier drafts, in memory only. The ref is the draft as of the
  // last change, so changes made before the next render build on each other.
  const draftRef = useRef(draft);
  const history = useRef(emptyHistory<PlanDraft>());
  // How many steps can be undone and redone, for the top bar's buttons.
  const [steps, setSteps] = useState({ back: 0, forward: 0 });
  const countSteps = () => setSteps({ back: history.current.past.length, forward: history.current.future.length });
  const commit = useCallback((next: PlanDraft, merge = true) => {
    const current = draftRef.current;
    if (next === current) return;
    history.current = record(history.current, current, Date.now(), merge);
    countSteps();
    draftRef.current = next;
    setDraft(next);
  }, []);
  const step = useCallback((back: boolean) => {
    // While Live nothing is undone: a controlled change is reversed from the log.
    if (draftRef.current.stage === "live" || draftRef.current.stage === "results") return;
    const result = (back ? undoIn : redoIn)(history.current, draftRef.current);
    if (!result) return;
    history.current = result.history;
    countSteps();
    draftRef.current = result.value;
    setPreview(null);
    setDraft(result.value);
  }, []);

  // Ctrl+Z undoes (Cmd+Z on a Mac); Ctrl+Shift+Z or Ctrl+Y redoes. Typing is undone in runs.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      const key = event.key.toLowerCase();
      if (key === "z" || key === "y") {
        event.preventDefault();
        step(key === "z" && !event.shiftKey);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step]);

  // Any edit ends a preview and is made to the plan itself. An edit to something only
  // the preview has (the court a lever would add) goes with the preview.
  const update = useCallback<Update>(
    (recipe) => {
      setPreview(null);
      try {
        commit(produce(draftRef.current, recipe));
      } catch {
        // A recipe that no longer applies (the preview's court is gone): nothing changes.
      }
    },
    [commit],
  );

  // During a simulation the schedule is the simulated day's: a game the desk moved there has moved.
  const source = sim?.base ?? draft;
  const parsed = useMemo(() => parsePlan(source), [source]);
  const issues = useMemo(() => issueMap(parsed.ok ? [] : parsed.issues), [parsed]);
  // With only money missing the day is still timed (from the plan without its money): the timeline doesn't go blank.
  const analysis = useMemo(() => {
    const inputs = timingInputs(parsed);
    return inputs ? analyseTournament(inputs) : null;
  }, [parsed]);

  // How much the plan itself still needs, on its expected numbers: past the Plan stage the
  // plan is worked out from the real entries, which says nothing about whether planning was finished.
  const planMissing = useMemo(() => {
    const asPlanned = draft.stage === "plan" ? parsed : parsePlan({ ...draft, stage: "plan" });
    return asPlanned.ok ? 0 : asPlanned.issues.length;
  }, [draft, parsed]);

  // What the summary, timeline and venue show: the plan, or the plan with the previewed lever.
  const shown = useMemo(() => (preview ? applyLever(source, preview) : source), [source, preview]);
  const shownParsed = useMemo(() => (preview ? parsePlan(shown) : parsed), [preview, shown, parsed]);
  const shownAnalysis = useMemo(
    () => {
      if (!preview) return analysis;
      const inputs = timingInputs(shownParsed);
      return inputs ? analyseTournament(inputs) : null;
    },
    [preview, analysis, shownParsed],
  );
  const schedule = useMemo(() => {
    const inputs = timingInputs(shownParsed);
    return inputs && shownAnalysis?.ok ? estimateSchedule(inputs, shownAnalysis.analysis) : null;
  }, [shownParsed, shownAnalysis]);
  const segments = useMemo(() => localSegments(shown, schedule), [shown, schedule]);
  const zones = useMemo(() => zoneRows(shown, schedule), [shown, schedule]);
  const warnings = useMemo(() => {
    // A group left with no court of its own, sharing one until the organiser chooses a court for it.
    const courtName = (courtId: string) => {
      for (const [h, hall] of shown.frame.halls.entries()) {
        const c = hall.courts.findIndex((x) => x.id === courtId);
        if (c !== -1) return `court ${courtNumber(shown.frame.halls, h, c)}`;
      }
      return "another court";
    };
    const homeless = (schedule?.homeless ?? []).map(
      (g) => `Group ${g.group} has no court of its own; it's sharing ${courtName(g.courtId)}. Choose it on a court.`,
    );
    return [...homeless, ...zoneWarnings(shown, zones)];
  }, [shown, zones, schedule]);
  const range = dayRange(shown);
  // How much each part of the plan still needs, for the counts on the workbench's tabs.
  const progress = useMemo<{ name: string; missing: number }[]>(() => {
    const missing = new Map<string, number>(PROGRESS_PARTS.map((p) => [p, 0]));
    for (const issue of shownParsed.ok ? [] : shownParsed.issues) {
      const part = partOf(issue);
      missing.set(part, missing.get(part)! + 1);
    }
    return PROGRESS_PARTS.map((name) => ({ name, missing: missing.get(name)! }));
  }, [shownParsed]);

  // Items left in each workbench tab, shown beside its name.
  const tabMissing: Record<Tab, number> = {
    setup: progress.find((p) => p.name === "Setup")!.missing,
    schedule: progress.find((p) => p.name === "Schedule")!.missing,
    finance: progress.find((p) => p.name === "Budget")!.missing,
  };
  // The plan's sample data, for the workbench's line about it.
  const sample = useMemo(() => {
    const { count, first } = sampleFields(shown, "plan");
    return { count, first: first ? { path: first, message: "" } : null };
  }, [shown]);

  // Esc discards a preview.
  useEffect(() => {
    if (!preview) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPreview(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [preview]);

  function keepPreview() {
    if (!preview) return;
    commit(applyLever(draftRef.current, preview), false);
    setPreview(null);
  }

  // The strips' shared view of the day, held still while a drag is under way.
  // The view takes in the halls' hours and everything played, with the buffer after it and the worst case,
  // so a stage dragged late (or a day running late) is never off the end.
  const playedSpan = useMemo(() => {
    if (segments.length === 0) return [];
    const worst = schedule?.worstFinish ? minutesOfDay(formatClock(schedule.worstFinish, shown.frame.timeZone)) : null;
    const last = Math.max(...segments.map((s) => s.to));
    return [{ from: Math.min(...segments.map((s) => s.from)), to: Math.min(24 * 60, Math.max(last + (shown.frame.bufferMinutes ?? 0), worst ?? 0)) }];
  }, [segments, schedule, shown.frame.timeZone, shown.frame.bufferMinutes]);
  const liveRange = viewRangeOf([
    ...draft.frame.halls
      .map((h) => ({ from: minutesOfDay(h.from), to: minutesOfDay(h.to) }))
      .filter((s): s is { from: number; to: number } => s.from !== null && s.to !== null && s.to > s.from),
    ...playedSpan,
  ]);
  const [frozenRange, setFrozenRange] = useState<ViewRange | null>(null);
  const viewRange = frozenRange ?? liveRange;
  const view = useMemo(
    () => ({ range: viewRange, setDragging: (dragging: boolean) => setFrozenRange(dragging ? viewRange : null) }),
    [viewRange.start, viewRange.end], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const moment = playhead ?? range?.start ?? null;
  const statuses = useMemo(
    () => (moment !== null && schedule ? courtStatuses(shown, segments, moment) : null),
    [shown, segments, moment, schedule],
  );

  const courtGroups = useMemo(
    () =>
      schedule && schedule.courtGroups.length > 0 ? new Map(schedule.courtGroups.map((c) => [c.courtId, c])) : null,
    [schedule],
  );

  function collapseSidebar(collapsed: boolean) {
    setSidebarCollapsed(collapsed);
    saveSidebarCollapsed(collapsed);
  }

  function chooseTab(next: Tab) {
    setTab(next);
    saveTab(next);
  }

  /** Open the tab holding an issue's field, then bring the field into view. */
  function goTo(issue: PlanIssue) {
    const target = tabFor(issue);
    if (target) chooseTab(target);
    // A hall's hours, unit and rate are in its heading's line; anything else of a hall's (its rate bands) sits in its settings panel: open it first.
    if (
      issue.path[0] === "frame" &&
      issue.path[1] === "halls" &&
      !document.querySelector(`[data-path="${pathKey(issue.path)}"]`)
    ) {
      document
        .querySelector<HTMLElement>(`[data-hall-settings="${String(issue.path[2])}"][aria-expanded="false"]`)
        ?.click();
    }
    // Two frames: the tab or panel renders first, then the field exists.
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const field = document.querySelector<HTMLElement>(`[data-path="${pathKey(issue.path)}"]`);
        field?.scrollIntoView({ behavior: "smooth", block: "center" });
        field?.querySelector<HTMLElement>("input, select")?.focus({ preventScroll: true });
      }),
    );
  }

  // The Draw stage's open page.
  const [drawView, setDrawView] = useState<DrawStageView>("entries");

  // What the Draw stage's side panel shows: every team, one team, or one court's games.
  const [drawFocus, setDrawFocus] = useState<DrawFocus>({ kind: "teams" });

  // The stage being looked at: any stage reached so far; it opens on the furthest.
  const [stageView, setStageView] = useState<TournamentStage>(draft.stage);
  // Once any category's draw is locked, the structure is read-only.
  const locked = Object.values(draft.draw).some((d) => d.locked);
  // Live (and after): the structure and the venue are fixed, and nothing about money is on screen.
  const isLive = draft.stage === "live" || draft.stage === "results";
  // Going Live needs every category drawn and its draw locked.
  const liveBlocked = canGoLive(draft) ? null : "Lock every category's draw first.";
  // The Live stage's open page.
  const [liveView, setLiveView] = useState<LiveStageView>("checkin");
  // The Live side panel: its tab, the court or group its games are narrowed to, and the entry opened in it.
  const [liveTab, setLiveTab] = useState<LiveTab>("games");
  const [liveFilter, setLiveFilter] = useState<LiveFilter>(null);
  const [liveEntry, setLiveEntry] = useState<string | null>(null);
  /** Narrows the Live panel's games to a court or a group (and opens the panel if it's folded); null shows every game. */
  function filterLive(filter: LiveFilter) {
    setLiveFilter(filter);
    if (filter) {
      setLiveTab("games");
      foldWorkbench(false);
      // A court or a group chosen is at the top of the side panel, wherever the panel had been scrolled to
      // (a game chosen on the timeline is brought into view by its own list).
      if (!(filter.kind === "court" && filter.game)) requestAnimationFrame(() => document.querySelector("[data-live-pane]")?.scrollTo({ top: 0 }));
    }
  }
  /** Opens an entry in the Live panel's Entries tab. */
  function openLiveEntry(entryId: string) {
    setLiveEntry(entryId);
    setLiveTab("entries");
    foldWorkbench(false);
  }
  // Escape goes back to every game (not while a dialog is open: it closes that).
  useEffect(() => {
    if (liveFilter === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !document.querySelector("[role=dialog], [role=alertdialog]")) setLiveFilter(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [liveFilter]);
  /** From the Resources page: opens where something still open is put right. */
  function fixAt(at: FixAt) {
    if (at === "plan" || at === "budget") {
      setStageView("plan");
      chooseTab(at === "budget" && !isLive ? "finance" : "setup");
      foldWorkbench(false);
    } else setDrawView(at === "schedule" ? "courts" : at);
  }
  // The same on the Draw stage's Schedule page: Escape lets the chosen court go.
  const drawCourt = drawFocus.kind === "court";
  useEffect(() => {
    if (!drawCourt) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !document.querySelector("[role=dialog], [role=alertdialog]")) setDrawFocus({ kind: "teams" });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawCourt]);
  const viewing = STAGE_ORDER.indexOf(stageView) <= STAGE_ORDER.indexOf(draft.stage) ? stageView : draft.stage;
  const onLive = viewing === "live" || viewing === "results";

  /** A stored time as minutes since midnight in the tournament's time zone. */
  const minuteOf = useCallback((iso: string) => minutesOfDay(formatClock(iso, draft.frame.timeZone)), [draft.frame.timeZone]);
  // Developer tools: a simulated day on the Live stage. The hall's part is played by the simulation; the
  // desk's part is yours, and goes into the simulated day only. The tournament itself is never changed.
  const developer = useDeveloperTools();
  const watching = sim !== null;
  const simHold = sim ? holdOf(sim.events) : null;
  // What the simulation is waiting for the desk to do, once the cursor has reached it.
  const simStop = sim && simHold !== null && playhead !== null && playhead >= simHold ? holdEvent(sim.events) : null;
  const simWaiting = !simStop
    ? null
    : simStop.reason === "tie"
      ? `Waiting for you: ${matchRef(draft, simStop.matchId)?.label.replace(/, rubber \d+$/, "") ?? "a knockout tie"} ended level. Decide who goes through`
      : simStop.reason === "score"
      ? `Waiting for a score: Court ${courtNumberOf(draft, simStop.courtId) ?? "?"}. Enter it and finish the match`
      : `Waiting for you: Court ${courtNumberOf(draft, simStop.courtId) ?? "?"} can't start. Check its players in, give a walkover, or put another game on it`;
  const simCount = sim ? eventsBy(sim.events, playhead === null ? -Infinity : range && playhead >= range.end ? Infinity : playhead) : 0;
  const liveDraft = useMemo(() => (sim ? dayAfter(sim.base, sim.events, simCount) : draft), [sim, draft, simCount]);
  /** The desk acting during a simulation: the change is made to the day as it stands at the cursor, and the rest of the day is worked out again from there. */
  const simUpdate: Update = (recipe) => {
    const now = simNow.current;
    if (!now) return;
    const hold = holdOf(now.events);
    const at = Math.max(now.from, Math.min(playhead ?? now.from, hold ?? Infinity));
    const dayNow = dayAfter(now.base, now.events, eventsBy(now.events, at));
    let next: PlanDraft;
    try {
      next = produce(dayNow, recipe);
    } catch {
      return;
    }
    if (next === dayNow) return;
    // What the desk did happened at the simulated minute, not on the real clock.
    next = restamp(dayNow, next, at);
    const events = simulateFrom(next, now.seed, at, now.deskScores) ?? [];
    putSim({ ...now, base: next, events, from: at });
    setPlayhead(at);
    // It was waiting for the desk: it plays on once no court is.
    const waited = hold !== null && at >= hold;
    const again = holdOf(events);
    if (waited) setPlaying(again === null || again > at);
  };
  const liveUpdate: Update = watching ? simUpdate : update;
  const simulation = useMemo(() => ({ on: watching && onLive, deskScores: Boolean(sim?.deskScores) }), [watching, onLive, sim?.deskScores]);
  const simBlocked = !timingInputs(parsed) ? "the plan can't be read" : segments.length === 0 ? "there are no games on the schedule" : null;
  /** Starts a simulated day at a time (the cursor's); a tournament that has really started carries on from now. */
  function runSimulation(cursor: number | null) {
    const began = draft.startedAt ? minuteOf(draft.startedAt) : null;
    const from = began !== null ? Math.max(began, clockMinute ?? began) : (cursor ?? range?.start ?? null);
    if (from === null) return;
    const seed = Math.floor(Math.random() * 2 ** 31);
    const events = simulateFrom(draft, seed, from, false);
    if (!events) return;
    putSim({ base: draft, events, from, seed, deskScores: false });
    setPlayhead(from);
    const hold = holdOf(events);
    setPlaying(hold === null || hold > from);
  }
  /** "I enter the scores", on or off: the rest of the day is worked out again from the cursor, the other way. */
  function setDeskScores(deskScores: boolean) {
    const now = simNow.current;
    if (!now || now.deskScores === deskScores) return;
    const hold = holdOf(now.events);
    const at = Math.max(now.from, Math.min(playhead ?? now.from, hold ?? Infinity));
    const base = dayAfter(now.base, now.events, eventsBy(now.events, at));
    const events = simulateFrom(base, now.seed, at, deskScores) ?? [];
    putSim({ ...now, base, events, from: at, deskScores });
    setPlayhead(at);
    const again = holdOf(events);
    if (again !== null && again <= at) setPlaying(false);
    // It was waiting for a score the simulation now gives itself: it plays on.
    else if (hold !== null && at >= hold) setPlaying(true);
  }
  function endSimulation() {
    putSim(null);
    setPlaying(false);
    setPlayhead(null);
  }
  /** The cursor during a simulation: not back past the desk's last action, nor on past a court that is waiting for the desk. */
  const seek = useCallback((minute: number | null) => {
    const now = simNow.current;
    if (!now || minute === null) return setPlayhead(minute);
    const hold = holdOf(now.events);
    const at = Math.max(now.from, Math.min(minute, hold ?? Infinity));
    setPlayhead(at);
    if (hold !== null && at >= hold) setPlaying(false);
  }, []);
  // Without a simulation the Live cursor is the real time in the tournament's time zone, held inside the day.
  const clockTick = useSyncExternalStore(subscribeClock, clockMinuteNow, () => 0);
  // With developer mode on the cursor is free to be moved and played, as on Plan and Draw.
  const clockLocked = onLive && !watching && !developer;
  const clockMinute = useMemo(() => {
    const minute = minutesOfDay(formatClock(new Date(clockTick * 60000).toISOString(), draft.frame.timeZone));
    return minute === null || !range ? null : Math.min(Math.max(minute, range.start), range.end);
  }, [clockTick, draft.frame.timeZone, range?.start, range?.end]); // eslint-disable-line react-hooks/exhaustive-deps
  // Space plays and pauses the timeline wherever it can be played: not in real Live (the cursor is the
  // clock), and not while a field, a button or a dialog has the keyboard (Space is theirs there).
  const spaceHeld = simHold !== null && playhead !== null && playhead >= simHold;
  useEffect(() => {
    if (clockLocked || !range) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Space" || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      const focused = document.activeElement;
      if (
        focused &&
        focused !== document.body &&
        focused.matches(
          "input, textarea, select, button, a[href], summary, [contenteditable='true'], [role=button], [role=tab], [role=switch], [role=checkbox], [role=radio], [role=spinbutton], [role=slider], [role=separator]",
        )
      )
        return;
      if (document.querySelector("[role=dialog], [role=alertdialog]") || !document.querySelector('section[aria-label="Timeline"]')) return;
      e.preventDefault();
      if (playing) return setPlaying(false);
      // A simulation waiting for the desk plays on when the court is dealt with, not before.
      if (spaceHeld) return;
      if (!watching && (playhead ?? range.start) >= range.end) setPlayhead(range.start);
      setPlaying(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [clockLocked, range?.start, range?.end, playing, playhead, watching, spaceHeld]); // eslint-disable-line react-hooks/exhaustive-deps
  // The time shown beside the Live panel's tabs: the cursor's.
  const liveMinute = clockLocked ? clockMinute : (playhead ?? range?.start ?? null);
  const liveTime = liveMinute === null ? null : clock(Math.round(liveMinute));
  // The day as it is really going: every Live page reads its times from this, not from the plan.
  const courtIds = useMemo(() => draft.frame.halls.flatMap((h) => h.courts.map((c) => c.id)), [draft.frame.halls]);
  const day = useMemo(() => liveDay(liveDraft, segments, { now: liveMinute, minuteOf, courtIds }), [liveDraft, segments, liveMinute, minuteOf, courtIds]);
  const projection = day.projection;

  // The audience board, in a window of its own: it is sent the day as the desk sees it (a simulated
  // day included) each time something changes. Nothing sent is saved.
  const boardClock = watching || developer ? liveTime : null;
  const boardDay = useRef<BoardDay>({ draft: liveDraft, now: liveMinute, clock: boardClock });
  const boardSend = useRef<(() => void) | null>(null);
  const boardOn = draft.stage === "live";
  useEffect(() => {
    if (!boardOn) return;
    const channel = boardChannel(id);
    if (!channel) return;
    const send = () => channel.postMessage({ type: "day", ...boardDay.current } satisfies BoardMessage);
    channel.onmessage = (event: MessageEvent<BoardMessage>) => {
      if (event.data.type === "hello") send();
    };
    boardSend.current = send;
    send();
    const timer = window.setInterval(
      () => channel.postMessage({ type: "ping", now: boardDay.current.now, clock: boardDay.current.clock } satisfies BoardMessage),
      BOARD_PING_MS,
    );
    return () => {
      window.clearInterval(timer);
      boardSend.current = null;
      channel.close();
    };
  }, [id, boardOn]);
  useEffect(() => {
    boardDay.current = { draft: liveDraft, now: liveMinute, clock: boardClock };
    boardSend.current?.();
  }, [liveDraft, liveMinute, boardClock]);
  const liveSegments = useMemo(
    () =>
      segments.map((s) => {
        const at = projection.get(s.id);
        return at ? { ...s, from: at.from, to: at.to, details: s.details.map((d) => ({ ...d, from: at.from, to: at.to })) } : s;
      }),
    [segments, projection],
  );
  // A walkover with nothing played took no time: it isn't on the timeline.
  const timelineSegments = useMemo(() => liveSegments.filter((s) => !projection.get(s.id)?.gone), [liveSegments, projection]);
  // On the day the zones follow the games as they are really going, not the plan.
  const liveZones = useMemo(() => {
    const spanOf = (zone: "group" | "knockout") => {
      const own = timelineSegments.filter((s) => zoneOf(s.stage) === zone);
      return own.length > 0 ? { from: Math.min(...own.map((s) => s.from)), to: Math.max(...own.map((s) => s.to)) } : null;
    };
    const spans = { group: spanOf("group"), knockout: spanOf("knockout") };
    return zones.map((z) => (spans[z.zone] ? { ...z, window: spans[z.zone]! } : z));
  }, [zones, timelineSegments]);

  // Once started, games start by themselves; and a first game started by hand starts the tournament.
  useEffect(() => {
    if (watching || draft.stage !== "live") return;
    const now = new Date().toISOString();
    const next = produce(draft, (d) => {
      const first = Object.values(d.results)
        .map((r) => r.startedAt)
        .filter((t): t is string => Boolean(t))
        .sort()[0];
      if (!d.startedAt && first) {
        const planned = segments.reduce((min, s) => Math.min(min, s.from), Infinity);
        const at = minuteOf(first) ?? planned;
        startTournament(d, { now: first, at: clock(at), late: Number.isFinite(planned) ? at - planned : 0 });
      }
      startReadyGames(d, segments, now);
    });
    if (next !== draft) commit(next, false);
  }, [draft, segments, watching, minuteOf]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Start tournament: play begins now, and the day's times shift by how far that is from the plan. */
  function beginTournament() {
    const now = new Date();
    const at = minutesOfDay(formatClock(now.toISOString(), draft.frame.timeZone));
    const planned = segments.reduce((min, s) => Math.min(min, s.from), Infinity);
    if (at === null) return;
    update((d) => void startTournament(d, { now: now.toISOString(), at: clock(at), late: Number.isFinite(planned) ? at - planned : 0 }));
  }

  // What the desk's eye is drawn to: courts whose game can't start, games that have just come onto a court, and games running out of time.
  const [attended, setAttended] = useState<ReadonlySet<string>>(new Set());
  const [arrived, setArrived] = useState<readonly string[]>([]);
  // Games that have come onto a court and that the desk hasn't touched yet, as "court:game": the court calls for it until it has.
  const [called, setCalled] = useState<ReadonlySet<string>>(new Set());
  const watch = useMemo(
    () => (onLive ? day : { held: new Set<string>(), stuck: new Map<string, string>(), byCourt: new Map<string, string>(), open: new Set<string>() }),
    [day, onLive],
  );
  // New information on a court. A new game coming onto it calls until the desk touches the court. Shown
  // for a few seconds only: it was waiting for the desk and no longer is (its players checked in, a
  // walkover), or it has become free.
  const lastOn = useRef<{ byCourt: Map<string, string>; stuck: Map<string, string> } | null>(null);
  const currentKey = [...watch.byCourt].map(([c, g]) => `${c}=${g}${watch.stuck.has(c) ? "!" : ""}`).join("|");
  useEffect(() => {
    const before = lastOn.current;
    lastOn.current = { byCourt: watch.byCourt, stuck: watch.stuck };
    if (!before || before.byCourt.size === 0) return;
    // A game the court didn't have before, and that can be played: it has been called onto the court.
    const fresh = [...watch.byCourt].filter(([court, game]) => before.byCourt.get(court) !== game && !watch.stuck.has(court));
    const changed = [...watch.byCourt]
      .filter(([court, game]) => before.byCourt.get(court) === game && before.stuck.has(court) && !watch.stuck.has(court))
      .map(([court]) => court);
    // A court that has just become free (nothing left on it that can be played yet) has news too.
    for (const court of before.byCourt.keys()) if (!watch.byCourt.has(court) && !changed.includes(court)) changed.push(court);
    if (changed.length === 0 && fresh.length === 0) return;
    const on = window.setTimeout(() => {
      if (fresh.length > 0) setCalled((set) => new Set([...set].filter((key) => !fresh.some(([court]) => key.startsWith(`${court}:`))).concat(fresh.map(([court, game]) => `${court}:${game}`))));
      setArrived((list) => [...list.filter((c) => !changed.includes(c)), ...changed]);
      // A court that waits again later (the held game comes back round) fades again: what the desk had looked at is forgotten.
      setAttended((set) => {
        const touched = [...changed, ...fresh.map(([court]) => court)];
        const kept = [...set].filter((key) => !touched.some((court) => key.startsWith(`${court}:`)));
        return kept.length === set.size ? set : new Set(kept);
      });
    }, 0);
    const off = window.setTimeout(() => setArrived((list) => list.filter((c) => !changed.includes(c))), 3000);
    return () => {
      window.clearTimeout(on);
      // The three seconds run out even if another court changes meanwhile.
      void off;
    };
  }, [currentKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const slots = useMemo(() => new Map(segments.map((s) => [s.id, s.to - s.from])), [segments]);
  const attention = useMemo<LiveAttention>(
    () => ({
      stuck: new Set(watch.stuck.keys()),
      fading: new Set([...watch.stuck].filter(([court, game]) => !attended.has(`${court}:${game}`)).map(([court]) => court)),
      news: new Set(arrived),
      calls: new Set([...watch.byCourt].filter(([court, game]) => called.has(`${court}:${game}`)).map(([court]) => court)),
      held: watch.held,
      timing: (matchId) => {
        const result = liveDraft.results[matchId];
        const began = result?.state === "onCourt" && result.startedAt ? minuteOf(result.startedAt) : null;
        return began === null || liveMinute === null ? null : timingOf(began, slots.get(matchId) ?? 1, liveMinute);
      },
      attend: (courtId) => {
        const game = watch.byCourt.get(courtId);
        if (game) setAttended((set) => (set.has(`${courtId}:${game}`) ? set : new Set(set).add(`${courtId}:${game}`)));
        setArrived((list) => (list.includes(courtId) ? list.filter((c) => c !== courtId) : list));
        setCalled((set) => ([...set].some((key) => key.startsWith(`${courtId}:`)) ? new Set([...set].filter((key) => !key.startsWith(`${courtId}:`))) : set));
      },
    }),
    [watch, attended, arrived, called, liveDraft, liveMinute, minuteOf, slots],
  );

  /** A game chosen on the timeline: its court in the side panel, with the game opened (Live) or marked (Draw). */
  function pickGame(segment: LocalSegment) {
    if (onLive) attention.attend(segment.courtId);
    if (onLive) filterLive({ kind: "court", id: segment.courtId, game: segment.id });
    else openInPanel({ kind: "court", id: segment.courtId, game: segment.id });
  }
  const pickedGame = onLive
    ? liveFilter?.kind === "court"
      ? (liveFilter.game ?? null)
      : null
    : drawFocus.kind === "court"
      ? (drawFocus.game ?? null)
      : null;

  // Sample data: the stage being viewed can be filled where it's empty, and its sample data removed.
  const sampleStage: SampleStage | null = viewing === "plan" ? "plan" : viewing === "draw" ? "draw" : null;
  const stageName = STAGE_NAMES[viewing];
  const fillCheck = useMemo(
    () => (sampleStage ? fillStage(sampleStage, draft, { today: new Date(), randomSeed: 0 }) : null),
    [sampleStage, draft],
  );
  const sampleFill = !sampleStage
    ? { label: `Nothing to fill in ${stageName}: it shows what the plan and the draw produce.`, onFill: null }
    : fillCheck && !fillCheck.ok
      ? { label: `Fill ${stageName} with sample data: ${fillCheck.reason}`, onFill: null }
      : {
          label: `Fill ${stageName} with sample data`,
          onFill: () => {
            const result = fillStage(sampleStage, draftRef.current, {
              today: new Date(),
              randomSeed: Math.floor(Math.random() * 2 ** 31),
            });
            if (result.ok) commit(result.draft, false);
          },
        };
  const sampleLeft = useMemo(() => (sampleStage ? dummySummary(draft, sampleStage) : ""), [draft, sampleStage]);
  const sampleRemove =
    sampleStage && sampleLeft
      ? {
          label: `Remove sample data from ${stageName}: ${sampleLeft}`,
          onRemove: async () => {
            // With the organiser's own data on this stage too, ask first.
            if (
              ownDataLeft(draftRef.current, sampleStage) &&
              !(await confirm({
                title: `Remove the sample data from ${stageName}?`,
                body: "Your own data stays as it is.",
                action: "Remove sample data",
                destructive: true,
              }))
            )
              return;
            commit(removeDummy(draftRef.current, sampleStage), false);
          },
        }
      : { label: `No sample data in ${stageName}`, onRemove: null };

  /** Move the tournament on to a stage, after asking. */
  async function advance(next: TournamentStage) {
    if (next === "draw") {
      if (
        !(await confirm({
          title: "Move on to the draw?",
          body: "From here the plan uses the entries you enter instead of the expected numbers. You can go back to the expected numbers.",
          action: "Move on to the draw",
        }))
      )
        return;
    }
    if (next === "live") {
      if (
        !(await confirm({
          title: "Go Live?",
          body: "The structure is fixed from here: categories, groups, rules, the venue and the draw can't be changed. Money is hidden while the tournament is Live.",
          action: "Go Live",
        }))
      )
        return;
    }
    commit(
      produce(draftRef.current, (d) => {
        // Going Live is the first entry in the log.
        if (next === "live") goLive(d, new Date().toISOString());
        else d.stage = next;
      }),
      false,
    );
    // What came before can't be undone into once Live.
    if (next === "live") {
      history.current = emptyHistory<PlanDraft>();
      setSteps({ back: 0, forward: 0 });
    }
    setStageView(next);
  }

  async function reopenEntries() {
    if (
      !(await confirm({
        title: "Use the expected numbers again?",
        body: "The entries are kept; the plan uses them again when you move on to the draw.",
        action: "Use expected numbers",
      }))
    )
      return;
    commit(produce(draftRef.current, (d) => void (d.stage = "plan")), false);
    setStageView("plan");
  }

  async function unlockDraw() {
    if (
      !(await confirm({
        title: "Unlock the draw?",
        body: "Categories, groups, rules and entries become editable; the draw is kept.",
        action: "Unlock draw",
      }))
    )
      return;
    commit(
      produce(draftRef.current, (d) => {
        for (const id of Object.keys(d.draw)) d.draw[id]!.locked = false;
      }),
      false,
    );
  }

  // The timeline folds to a bar (its panel remembers its size); the workbench to a rail (remembered here).
  const timelinePanel = usePanelRef();
  const [timelineFolded, setTimelineFolded] = useState(false);
  // The timeline's height: the venue scrolls under it, and stops clear of it.
  const [timelineHeight, setTimelineHeight] = useState(0);
  // Thin rows: the timeline's panel shrinks to fit them, and goes back to its earlier height after.
  const [thinHeight, setThinHeight] = useState<number | null>(null);
  const beforeThin = useRef<number | null>(null);
  useEffect(() => {
    const panel = timelinePanel.current;
    if (!panel) return;
    // A frame on, so the panel has its new smallest size before it's resized.
    const frame = requestAnimationFrame(() => {
      if (thinHeight !== null) {
        beforeThin.current ??= panel.getSize().inPixels;
        panel.resize(thinHeight);
      } else if (beforeThin.current !== null) {
        panel.resize(beforeThin.current);
        beforeThin.current = null;
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [thinHeight, timelinePanel]);
  const foldTimeline = (folded: boolean) => (folded ? timelinePanel.current?.collapse() : timelinePanel.current?.expand());
  const [workbenchFolded, setWorkbenchFolded] = useState(loadWorkbenchFolded);
  function foldWorkbench(folded: boolean) {
    setWorkbenchFolded(folded);
    saveWorkbenchFolded(folded);
  }
  /** Shows a team or a court in the Draw stage's side panel, opening the panel if it's folded. */
  function openInPanel(focus: DrawFocus) {
    setDrawFocus(focus);
    foldWorkbench(false);
  }

  // The venue (or, while Live, the Court board) over the timeline.
  const docked = (content: ReactNode) => (
    // The venue fills the area and scrolls under the timeline, which is glass over its lower part.
    // The panels above it only size the two: the venue's own panel is empty and lets the pointer through.
    <div className="relative h-full" style={{ "--under": `${timelineHeight + 8}px` } as CSSProperties}>
      <div className="@container scroll-pane absolute inset-0 isolate overflow-y-auto px-(--pane-x) pb-(--under) [scroll-padding-bottom:var(--under)]">
        <div className={cn(COLUMN, "flex flex-col gap-4 pb-4")}>
          {content}
        </div>
      </div>
    <ResizablePanelGroup
      orientation="vertical"
      defaultLayout={dock.defaultLayout}
      onLayoutChanged={dock.onLayoutChanged}
      className="pointer-events-none relative z-10"
    >
      <ResizablePanel id="venue" minSize={160} />
      <ResizableHandle className={cn(DIVIDER, "pointer-events-auto")} />
      <ResizablePanel
        id="timeline"
        defaultSize="45"
        minSize={thinHeight !== null ? Math.min(220, thinHeight) : 220}
        collapsible
        collapsedSize={TIMELINE_FOLDED}
        panelRef={timelinePanel}
        onResize={(size) => {
          setTimelineFolded(size.inPixels <= TIMELINE_FOLDED + 1);
          setTimelineHeight(Math.round(size.inPixels));
        }}
        className="h-full"
      >
        <div className="pointer-events-auto h-full">
        <Timeline
          draft={shown}
          update={update}
          schedule={schedule}
          segments={onLive ? timelineSegments : segments}
          zones={onLive ? liveZones : zones}
          fit={shownAnalysis?.ok ? shownAnalysis.analysis.capacity.status : null}
          playhead={clockLocked ? clockMinute : playhead}
          onSeek={clockLocked ? noSeek : seek}
          playing={clockLocked ? false : playing}
          onPlayingChange={clockLocked ? noPlaying : setPlaying}
          locked={clockLocked}
          rate={watching ? SIMULATION.minutesPerSecond : undefined}
          picked={pickedGame}
          onPick={viewing === "plan" ? undefined : pickGame}
          collapsed={timelineFolded}
          onCollapsedChange={foldTimeline}
          onFitHeight={setThinHeight}
          // After the draw the day is as planned: only games move.
          fixed={viewing !== "plan" || isLive}
          // Live: a move is a controlled change, and a game that has started stays put.
          live={
            isLive
              ? {
                  state: (matchId) => gameState(liveDraft.results, matchId),
                  held: (matchId) => attention.held.has(matchId),
                  timing: (matchId) => attention.timing(matchId),
                  onMove: (segment, target, stapled) =>
                    liveUpdate((d) => void moveGame(d, { matchId: segment.id, with: stapled.map((s) => s.id), fromCourtId: segment.courtId, target, now: new Date().toISOString() })),
                }
              : undefined
          }
        />
        </div>
      </ResizablePanel>
    </ResizablePanelGroup>
    </div>
  );
  // Where a waiting game may be played: a group game in its own hall, or on any court with nothing left
  // that can be played now; a knockout game in a hall that has its stage.
  const canMove: CanMove = (segment, courtId) => {
    const hallOf = (id: string) => draft.frame.halls.find((h) => h.courts.some((c) => c.id === id))?.id;
    const hall = hallOf(courtId);
    if (!hall) return false;
    return segment.stage === "group"
      ? hall === hallOf(segment.courtId) || day.open.has(courtId)
      : zones.some((z) => z.hallId === hall && z.zone === zoneOf(segment.stage));
  };
  // Putting a waiting game on a court, from the side panel or onto the Court board.
  const [liveDragging, setLiveDragging] = useState<LocalSegment | null>(null);
  const liveQueues = courtQueues(liveSegments, liveDraft.results);
  const liveMoves: LiveMoves = {
    dragging: liveDragging,
    setDragging: setLiveDragging,
    takes: (segment, courtId) => {
      const current = liveQueues.get(courtId)?.current ?? null;
      return (
        current?.id !== segment.id &&
        gameState(liveDraft.results, segment.id) === "waiting" &&
        (current === null || gameState(liveDraft.results, current.id) === "waiting") &&
        canMove(segment, courtId)
      );
    },
    // It goes first there: ahead of whatever was waiting on the court.
    move: (segment, courtId) => {
      const before = liveQueues.get(courtId)?.current?.id ?? null;
      attention.attend(courtId);
      // The tie's rubbers stapled to it on its court (still waiting) go with it, as the one move.
      const queue = liveQueues.get(segment.courtId);
      const waiting = queue ? [...(queue.current ? [queue.current] : []), ...queue.next].filter((g) => gameState(liveDraft.results, g.id) === "waiting") : [];
      const block = segment.match.rubber ? stapledWith(waiting, segment.id) : [];
      const first = block[0] ?? segment;
      if (before && block.some((g) => g.id === before)) return;
      liveUpdate(
        (d) =>
          void moveGame(d, {
            matchId: first.id,
            with: block.slice(1).map((g) => g.id),
            fromCourtId: segment.courtId,
            target: { courtId, before },
            now: new Date().toISOString(),
          }),
      );
    },
  };
  // The Plan stage's working area, and the Draw stage's Schedule page.
  const workingArea = docked(<VenueCanvas draft={shown} update={update} statuses={statuses} courtGroups={courtGroups} />);

  // The stages under the tournament's name. On the Plan stage they sit over the venue, beside the workbench.
  const stageRow = (
    <StageRow
      stage={draft.stage}
      view={viewing}
      onView={setStageView}
      onAdvance={advance}
      planMissing={planMissing}
      liveBlocked={liveBlocked}
      actions={
        // Live runs on the day's real data: no sample data there, or anywhere once the tournament is Live.
        isLive ? (
          // Developer tools: a simulated day to watch, on the Live stage only.
          onLive ? (
            <>
              {draft.stage === "live" ? (
                <AudienceBoardButton
                  id={id}
                  draft={draft}
                  // The names setting is the tournament's: it is saved, and a simulated day takes it too.
                  update={(recipe) => {
                    update(recipe);
                    const now = simNow.current;
                    if (now) putSim({ ...now, base: produce(now.base, recipe) });
                  }}
                />
              ) : null}
              {liveDraft.startedAt ? <span className="text-sm whitespace-nowrap text-muted-foreground tabular-nums">Started {clock(day.started ?? 0)}</span> : null}
              {watching ? (
                <SimulationControls
                  state={playing ? "playing" : "paused"}
                  // A court is waiting for the desk: the day plays on once it has been dealt with.
                  waiting={simWaiting}
                  onPlay={() => setPlaying(true)}
                  onPause={() => setPlaying(false)}
                  onStop={endSimulation}
                />
              ) : developer ? (
                <Button
                  size="sm"
                  disabled={simBlocked !== null}
                  title={
                    simBlocked
                      ? `Can't simulate: ${simBlocked}`
                      : "Plays the day from here: the hall's part by itself, the desk's part yours. It pauses when a court needs you. Nothing is saved"
                  }
                  onClick={() => runSimulation(playhead ?? range?.start ?? null)}
                >
                  <PlayIcon /> {draft.startedAt ? "Simulate the rest of the day" : "Start tournament simulation"}
                </Button>
              ) : !draft.startedAt ? (
                <Button size="sm" title="Play begins now: the day's times move to match, and each court's first game goes on court" onClick={beginTournament}>
                  <PlayIcon /> Start tournament
                </Button>
              ) : null}
            </>
          ) : null
        ) : (
          <SampleDataButtons fill={sampleFill} remove={sampleRemove} />
        )
      }
    />
  );

  return (
    <TooltipProvider delay={300}>
      <ViewRangeContext value={view}>
        <IssuesContext value={issues}>
        <MoneyHiddenContext value={isLive}>
        <WatchOnlyContext value={simulation}>
        <LiveAttentionContext value={onLive ? attention : null}>
        <LiveMovesContext value={onLive ? liveMoves : null}>
        <CourtSizeContext value={courtSizing}>
          <div className="relative flex h-dvh min-w-[1024px] overflow-hidden overscroll-none bg-background text-sm">
            <Sidebar
              draft={draft}
              currentId={id}
              items={tournaments.index.items}
              onNew={tournaments.onNew}
              onDuplicate={() => tournaments.onDuplicate(draftRef.current)}
              onDelete={tournaments.onDelete}
              onOpen={tournaments.onOpen}
              collapsed={sidebarCollapsed}
              onCollapsedChange={collapseSidebar}
            />
            {/* The working area: the dot matrix runs behind the venue, the timeline and the workbench. */}
            <TeamOpenContext
              value={viewing === "plan" ? null : viewing === "live" || viewing === "results" ? openLiveEntry : (id) => openInPanel({ kind: "team", id })}
            >
            <div className="workspace-dots flex min-w-0 flex-1">
            <main className="flex min-w-0 flex-1 flex-col">
              <div className="shrink-0 px-(--pane-x)">
                <div className={cn(COLUMN, "pb-4")}>
                  <NameRow
                    fields={<TournamentHeader draft={draft} update={update} />}
                    onUndo={() => step(true)}
                    onRedo={() => step(false)}
                    canUndo={steps.back > 0}
                    canRedo={steps.forward > 0}
                    off={isLive ? "No undo while Live: reverse a change from the Changes page" : undefined}
                  />
                  {stageRow}
                </div>
              </div>
              <div className="flex min-h-0 flex-1">
                {viewing === "live" || viewing === "results" ? (
                  <CourtSelectionContext
                    value={{ selected: liveFilter?.kind === "court" ? liveFilter.id : null, onSelect: (id) => {
                        attention.attend(id);
                        filterLive({ kind: "court", id });
                      },
                    }}
                  >
                    <LiveStage
                      draft={liveDraft}
                      update={liveUpdate}
                      segments={liveSegments}
                      view={liveView}
                      onViewChange={setLiveView}
                      // Every Live page sits over the timeline; on the Court board games are moved between courts.
                      dock={docked}
                      courtBoard={<CourtBoard draft={liveDraft} update={liveUpdate} segments={liveSegments} courtGroups={courtGroups} />}
                      filter={liveFilter}
                      onFilter={filterLive}
                    />
                  </CourtSelectionContext>
                ) : viewing !== "plan" ? (
                  <DrawStage
                    draft={draft}
                    update={update}
                    locked={locked}
                    segments={segments}
                    view={drawView}
                    onViewChange={setDrawView}
                    resources={
                      <ResourcesView
                        draft={draft}
                        update={update}
                        segments={segments}
                        shuttles={shownAnalysis?.ok ? shownAnalysis.analysis.finance.shuttles : null}
                        fits={shownAnalysis?.ok ? shownAnalysis.analysis.capacity.status !== "doesNotFit" : null}
                        onFix={fixAt}
                        tournamentId={id}
                      />
                    }
                    courts={
                      // After the draw the venue is as planned: it's looked at here, not rebuilt.
                      <VenueFixedContext value>
                        <CourtSelectionContext
                          value={{ selected: drawFocus.kind === "court" ? drawFocus.id : null, onSelect: (id) => openInPanel({ kind: "court", id }) }}
                        >
                          <div
                            className="min-w-0 flex-1"
                            // As on the Live board: a click that isn't on a court (or a game on the timeline) lets the chosen court go.
                            onClick={(e) => {
                              const target = e.target as Element;
                              if (drawFocus.kind !== "court" || !e.currentTarget.contains(target)) return;
                              if (target.closest("[data-court-card], [data-court-id]")) return;
                              setDrawFocus({ kind: "teams" });
                            }}
                          >
                            {workingArea}
                          </div>
                        </CourtSelectionContext>
                      </VenueFixedContext>
                    }
                  />
                ) : (
                  // Once the tournament is Live, the venue is looked at here, not rebuilt.
                  <VenueFixedContext value={isLive}>
                    <div className="min-w-0 flex-1">{workingArea}</div>
                  </VenueFixedContext>
                )}
              </div>
            </main>
            {viewing === "live" || viewing === "results" ? (
              // The Live side panel, on every Live page: the games to run, and the entries.
              workbenchFolded ? (
                <Rail name="Side panel" open="Show panel" onOpen={() => foldWorkbench(false)}>
                  {liveTime ? (
                    // Hours over minutes: larger than it could be on one line of the rail.
                    <span role="timer" aria-label={`The time is ${liveTime}`} className="flex flex-col items-center font-display text-2xl leading-none font-bold tabular-nums">
                      <span>{liveTime.split(":")[0]}</span>
                      <span>{liveTime.split(":")[1]}</span>
                    </span>
                  ) : null}
                  <span className={RAIL_TEXT}>Games</span>
                </Rail>
              ) : (
                <aside aria-label="Side panel" className={cn(WORKBENCH, "w-[440px]")}>
                  {watching ? (
                    <div className="mx-4 mb-3 flex shrink-0 flex-col gap-2 rounded-lg bg-card-system py-2 pr-2 pl-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm">
                          <span className="font-semibold">Simulation.</span> {simWaiting ? `${simWaiting}.` : "Nothing is saved. It pauses when a court needs you."}
                        </p>
                        <Button variant="outline" size="sm" onClick={endSimulation}>
                          End simulation
                        </Button>
                      </div>
                      <label
                        className="flex w-fit items-center gap-2 text-sm"
                        title="On: each game that ends pauses the day until you enter its score and finish it. Off: the simulation scores games itself"
                      >
                        <Switch checked={Boolean(sim?.deskScores)} onCheckedChange={setDeskScores} />I enter the scores
                      </label>
                    </div>
                  ) : null}
                  <LivePanel
                    draft={liveDraft}
                    update={liveUpdate}
                    inputs={timingInputs(parsed)}
                    segments={liveSegments}
                    tab={liveTab}
                    onTab={setLiveTab}
                    filter={liveFilter}
                    onFilter={filterLive}
                    entryId={liveEntry}
                    onEntry={setLiveEntry}
                    time={liveTime}
                    onFold={() => foldWorkbench(true)}
                  />
                </aside>
              )
            ) : viewing !== "plan" ? (
              // The Draw stage's side panel: the same pane as the workbench, folded and opened the same way.
              workbenchFolded ? (
                <Rail name="Side panel" open="Show panel" onOpen={() => foldWorkbench(false)}>
                  <span className={RAIL_TEXT}>{draft.unit === "team" ? "Teams" : "Entries"}</span>
                </Rail>
              ) : (
                <aside aria-label="Side panel" className={cn(WORKBENCH, "w-[440px]")}>
                  <DrawPanel
                    draft={shown}
                    update={update}
                    segments={segments}
                    moment={moment}
                    focus={drawFocus}
                    onFocus={setDrawFocus}
                    onFold={() => foldWorkbench(true)}
                  />
                </aside>
              )
            ) : workbenchFolded ? (
                <Rail name="Workbench" open="Show workbench" onOpen={() => foldWorkbench(false)}>
                  <RailSummary draft={shown} parsed={shownParsed} analysis={shownAnalysis} hideMoney={isLive} />
                </Rail>
              ) : (
                <aside aria-label="Workbench" className={cn(WORKBENCH, "w-[440px]")}>
                  {locked ? (
                    <div className="px-4 pb-3">
                      <StageBar onUnlock={unlockDraw} live={isLive} />
                    </div>
                  ) : null}
                  {preview && parsed.ok ? (
                    <PreviewBar
                      change={preview}
                      inputs={parsed.inputs}
                      draft={draft}
                      onKeep={keepPreview}
                      onDiscard={() => setPreview(null)}
                    />
                  ) : null}
                  <div className="shrink-0 px-4 pb-3">
                    <Summary
                      draft={shown}
                      parsed={shownParsed}
                      analysis={shownAnalysis}
                      warnings={warnings}
                      sample={sample}
                      hideMoney={isLive}
                      onGoTo={goTo}
                      action={
                        <IconButton label="Hide workbench" side="left" aria-expanded onClick={() => foldWorkbench(true)}>
                          <XIcon />
                        </IconButton>
                      }
                    />
                  </div>
                  <Tabs
                    // While Live the Budget tab can't be opened: wherever it was left, Setup shows.
                    value={isLive && tab === "finance" ? "setup" : tab}
                    onValueChange={(value) => chooseTab(value as Tab)}
                    className="min-h-0 flex-1 gap-0"
                  >
                    <TabsList variant="line" className="mx-4 w-auto shrink-0 justify-start">
                      {TABS.map((t) => (
                        <TabsTrigger
                          key={t.value}
                          value={t.value}
                          disabled={isLive && t.value === "finance"}
                          title={isLive && t.value === "finance" ? "Hidden while the tournament is Live" : undefined}
                        >
                          {t.label}
                          {tabMissing[t.value] > 0 ? (
                            <span className="font-normal tabular-nums" aria-label={`${tabMissing[t.value]} to fill in`}>
                              ({tabMissing[t.value]})
                            </span>
                          ) : null}
                        </TabsTrigger>
                      ))}
                    </TabsList>
                    <div className="@container scroll-pane relative min-h-0 flex-1 overflow-y-auto">
                      <TabsContent value="setup" className="flex flex-col">
                        <ReadOnly when={locked}>
                          <SetupTab draft={draft} update={update} />
                        </ReadOnly>
                      </TabsContent>
                      <TabsContent value="schedule" className="flex flex-col">
                        <ScheduleTab draft={draft} update={update} locked={locked} onReopen={reopenEntries} />
                        <DerivedCards
                          tab="schedule"
                          draft={draft}
                          parsed={parsed}
                          analysis={analysis}
                          preview={preview}
                          onPreview={setPreview}
                          locked={locked}
                        />
                      </TabsContent>
                      <TabsContent value="finance" className="flex flex-col">
                        <FinanceTab draft={draft} update={update} />
                        <DerivedCards
                          tab="finance"
                          draft={draft}
                          parsed={parsed}
                          analysis={analysis}
                          preview={preview}
                          onPreview={setPreview}
                          locked={locked}
                        />
                      </TabsContent>
                    </div>
                  </Tabs>
                </aside>
              )}
            </div>
            </TeamOpenContext>
          </div>
        </CourtSizeContext>
        </LiveMovesContext>
        </LiveAttentionContext>
        </WatchOnlyContext>
        </MoneyHiddenContext>
        </IssuesContext>
      </ViewRangeContext>
    </TooltipProvider>
  );
}

/**
 * The saved tournaments, with one open in the editor. Opening another remounts
 * the editor, so its undo history, preview and selections start afresh.
 */
function Workspace() {
  const confirm = useConfirm();
  const [index, setIndex] = useState<TournamentIndex>(() => {
    const saved = loadIndex();
    if (saved.currentId && saved.items.some((t) => t.id === saved.currentId)) return saved;
    if (saved.items[0]) return setCurrent(saved, saved.items[0].id);
    return createTournament(saved, emptyDraft(browserTimeZone())).index;
  });
  const indexRef = useRef(index);
  const change = useCallback((next: TournamentIndex) => {
    indexRef.current = next;
    setIndex(next);
  }, []);

  const onSave = useCallback(
    (id: string, draft: PlanDraft) => change(saveTournament(indexRef.current, id, draft)),
    [change],
  );

  const actions: TournamentActions = {
    index,
    onSave,
    onNew: () => change(createTournament(indexRef.current, emptyDraft(browserTimeZone())).index),
    onDuplicate: (draft) => {
      // Dummy data the copy no longer has (entries, the draw, name and date) isn't carried over.
      const copy = duplicateDraft(draft);
      change(createTournament(indexRef.current, { ...copy, dummy: liveMarks(copy) }).index);
    },
    onDelete: async (id) => {
      const name = indexRef.current.items.find((t) => t.id === id)?.name.trim() || "Untitled tournament";
      if (!(await confirm({ title: `Delete “${name}”?`, body: "This can’t be undone.", action: "Delete tournament", destructive: true })))
        return;
      const next = deleteTournament(indexRef.current, id);
      // The last one gone: start a new one.
      change(next.currentId ? next : createTournament(next, emptyDraft(browserTimeZone())).index);
    },
    onOpen: (id) => change(setCurrent(indexRef.current, id)),
  };
  const currentId = index.currentId!;
  return <Editor key={currentId} id={currentId} tournaments={actions} />;
}

const subscribe = () => () => {};

/**
 * The plan lives in this browser's storage, which the server can't read, so
 * the editor renders on the client only.
 */
export function PlanEditor() {
  const isClient = useSyncExternalStore(subscribe, () => true, () => false);
  if (!isClient) {
    return <p className="p-6 text-sm text-muted-foreground">Loading your plan…</p>;
  }
  return (
    <ConfirmProvider>
      <ScrollHints />
      <Workspace />
    </ConfirmProvider>
  );
}
