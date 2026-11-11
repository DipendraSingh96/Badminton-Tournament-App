"use client";

import { produce } from "immer";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";
import { useDefaultLayout, usePanelRef } from "react-resizable-panels";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { CaretLeftIcon, XIcon } from "@phosphor-icons/react";
import { ConfirmProvider, useConfirm } from "@/components/ui/confirm";
import { ScrollHints } from "@/components/ui/scroll-hints";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { analyseTournament, estimateSchedule, type LeverChange } from "@/engine";
import { emptyHistory, record, redo as redoIn, undo as undoIn } from "@/lib/tournament/history";
import { applyLever } from "@/lib/tournament/levers";
import { canGoLive, courtNumber, duplicateDraft, emptyDraft, type PlanDraft, type TournamentStage } from "@/lib/tournament/draft";
import { fillStage } from "@/lib/tournament/dummy/fill";
import { dummySummary, liveMarks, ownDataLeft, removeDummy, sampleFields, type SampleStage } from "@/lib/tournament/dummy/marks";
import { minutesOfDay } from "@/lib/tournament/time";
import { parsePlan, type PlanIssue } from "@/lib/tournament/schema";
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
/** The timeline folded to its bar. */
const TIMELINE_FOLDED = 40;

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

  const parsed = useMemo(() => parsePlan(draft), [draft]);
  const issues = useMemo(() => issueMap(parsed.ok ? [] : parsed.issues), [parsed]);
  const analysis = useMemo(
    () => (parsed.ok ? analyseTournament(parsed.inputs) : null),
    [parsed],
  );

  // How much the plan itself still needs, on its expected numbers: past the Plan stage the
  // plan is worked out from the real entries, which says nothing about whether planning was finished.
  const planMissing = useMemo(() => {
    const asPlanned = draft.stage === "plan" ? parsed : parsePlan({ ...draft, stage: "plan" });
    return asPlanned.ok ? 0 : asPlanned.issues.length;
  }, [draft, parsed]);

  // What the summary, timeline and venue show: the plan, or the plan with the previewed lever.
  const shown = useMemo(() => (preview ? applyLever(draft, preview) : draft), [draft, preview]);
  const shownParsed = useMemo(() => (preview ? parsePlan(shown) : parsed), [preview, shown, parsed]);
  const shownAnalysis = useMemo(
    () => (!preview ? analysis : shownParsed.ok ? analyseTournament(shownParsed.inputs) : null),
    [preview, analysis, shownParsed],
  );
  const schedule = useMemo(
    () =>
      shownParsed.ok && shownAnalysis?.ok ? estimateSchedule(shownParsed.inputs, shownAnalysis.analysis) : null,
    [shownParsed, shownAnalysis],
  );
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
  const liveRange = viewRangeOf(
    draft.frame.halls
      .map((h) => ({ from: minutesOfDay(h.from), to: minutesOfDay(h.to) }))
      .filter((s): s is { from: number; to: number } => s.from !== null && s.to !== null && s.to > s.from),
  );
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
  const viewing = STAGE_ORDER.indexOf(stageView) <= STAGE_ORDER.indexOf(draft.stage) ? stageView : draft.stage;

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
    commit(produce(draftRef.current, (d) => void (d.stage = next)), false);
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

  // The venue over the timeline: the Plan stage's working area, and the Draw stage's Schedule page.
  const workingArea = (
    // The venue fills the area and scrolls under the timeline, which is glass over its lower part.
    // The panels above it only size the two: the venue's own panel is empty and lets the pointer through.
    <div className="relative h-full" style={{ "--under": `${timelineHeight + 8}px` } as CSSProperties}>
      <div className="@container scroll-pane absolute inset-0 isolate overflow-y-auto px-(--pane-x) pb-(--under) [scroll-padding-bottom:var(--under)]">
        <div className={cn(COLUMN, "flex flex-col gap-4 pb-4")}>
          <VenueCanvas draft={shown} update={update} statuses={statuses} courtGroups={courtGroups} />
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
          segments={segments}
          zones={zones}
          fit={shownAnalysis?.ok ? shownAnalysis.analysis.capacity.status : null}
          playhead={playhead}
          onSeek={setPlayhead}
          playing={playing}
          onPlayingChange={setPlaying}
          collapsed={timelineFolded}
          onCollapsedChange={foldTimeline}
          onFitHeight={setThinHeight}
          // After the draw the day is as planned: only games move.
          fixed={viewing !== "plan" || isLive}
        />
        </div>
      </ResizablePanel>
    </ResizablePanelGroup>
    </div>
  );

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
        isLive ? null : <SampleDataButtons fill={sampleFill} remove={sampleRemove} />
      }
    />
  );

  return (
    <TooltipProvider delay={300}>
      <ViewRangeContext value={view}>
        <IssuesContext value={issues}>
        <MoneyHiddenContext value={isLive}>
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
            <TeamOpenContext value={viewing === "plan" ? null : (id) => openInPanel({ kind: "team", id })}>
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
                  />
                  {stageRow}
                </div>
              </div>
              <div className="flex min-h-0 flex-1">
                {viewing === "live" || viewing === "results" ? (
                  <LiveStage draft={draft} update={update} segments={segments} view={liveView} onViewChange={setLiveView} />
                ) : viewing !== "plan" ? (
                  <DrawStage
                    draft={draft}
                    update={update}
                    locked={locked}
                    segments={segments}
                    view={drawView}
                    onViewChange={setDrawView}
                    courts={
                      // After the draw the venue is as planned: it's looked at here, not rebuilt.
                      <VenueFixedContext value>
                        <CourtSelectionContext
                          value={{ selected: drawFocus.kind === "court" ? drawFocus.id : null, onSelect: (id) => openInPanel({ kind: "court", id }) }}
                        >
                          <div className="min-w-0 flex-1">{workingArea}</div>
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
            {viewing === "live" || viewing === "results" ? null : viewing !== "plan" ? (
              // The Draw stage's side panel: the same pane as the workbench, folded and opened the same way.
              workbenchFolded ? (
                <aside aria-label="Side panel (hidden)" className={cn(WORKBENCH, "w-10 items-center gap-4 overflow-hidden pb-4")}>
                  <IconButton label="Show panel" side="left" aria-expanded={false} onClick={() => foldWorkbench(false)}>
                    <CaretLeftIcon />
                  </IconButton>
                  <p className="text-sm font-semibold whitespace-nowrap [writing-mode:vertical-rl]">
                    {draft.unit === "team" ? "Teams" : "Entries"}
                  </p>
                </aside>
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
                <aside
                  aria-label="Workbench (hidden)"
                  className={cn(WORKBENCH, "w-10 items-center gap-4 overflow-hidden pb-4")}
                >
                  <IconButton label="Show workbench" side="left" aria-expanded={false} onClick={() => foldWorkbench(false)}>
                    <CaretLeftIcon />
                  </IconButton>
                  <RailSummary draft={shown} parsed={shownParsed} analysis={shownAnalysis} hideMoney={isLive} />
                </aside>
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
                    <TabsList variant="line" className="w-full shrink-0 justify-start px-2">
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
