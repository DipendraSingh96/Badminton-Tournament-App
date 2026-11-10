"use client";

import { produce } from "immer";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useDefaultLayout, usePanelRef } from "react-resizable-panels";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { CaretDoubleLeftIcon, XIcon } from "@phosphor-icons/react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { analyseTournament, estimateSchedule, type LeverChange } from "@/engine";
import { emptyHistory, record, redo as redoIn, undo as undoIn } from "@/lib/tournament/history";
import { applyLever } from "@/lib/tournament/levers";
import { courtNumber, duplicateDraft, emptyDraft, type PlanDraft, type TournamentStage } from "@/lib/tournament/draft";
import { fillStage } from "@/lib/tournament/dummy/fill";
import { dummySummary, liveMarks, ownDataLeft, removeDummy, type SampleStage } from "@/lib/tournament/dummy/marks";
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
import { CourtSelectionContext } from "./court-card";
import { CourtPanel } from "./court-panel";
import { DrawStage, type DrawStageView } from "./draw-stage";
import { SampleDataButtons } from "./dummy-data";
import { PreviewBar } from "./preview-bar";
import { StageBar } from "./stage-bar";
import { IconButton, IssuesContext, ReadOnly, issueMap, pathKey } from "./fields";
import { FinanceTab } from "./finance-tab";
import { ScheduleTab } from "./schedule-tab";
import { SetupTab } from "./setup-tab";
import { ProgressSegments, Summary, type ProgressPart } from "./summary";
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
const CARD = "h-full overflow-hidden rounded-xl border bg-background";
/** The central column the tournament sits in: at most 960px, centred in the space the workbench leaves. */
const COLUMN = "mx-auto w-full max-w-[960px]";
/** A gutter that is also a soft divider: a faint line, stronger on hover. */
const DIVIDER =
  GUTTER.replace("after:bg-transparent", "after:bg-border") +
  " aria-[orientation=horizontal]:after:left-4 aria-[orientation=horizontal]:after:w-[calc(100%-2rem)]";
/** The workbench, level with the stage row, with an open divider at its left: a line that stops short of the shell's edges. */
const WORKBENCH =
  "relative mt-16 flex shrink-0 flex-col before:absolute before:top-0 before:bottom-4 before:left-0 before:w-px before:bg-border";
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

/** The parts of the plan the workbench's progress bar shows, in order. */
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

// The category break-even varies, chosen on the Budget tab.
const BREAK_EVEN_KEY = "badminton:break-even-category";

function loadBreakEven(): string | null {
  try {
    return window.localStorage.getItem(BREAK_EVEN_KEY);
  } catch {
    return null;
  }
}

function saveBreakEven(id: string) {
  try {
    window.localStorage.setItem(BREAK_EVEN_KEY, id);
  } catch {
    // Not remembered; the first category is used.
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
  const [tab, setTab] = useState<Tab>(loadTab);
  const [breakEvenId, setBreakEvenId] = useState<string | null>(loadBreakEven);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(loadSidebarCollapsed);
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
  // How complete the plan is, part by part, for the workbench's progress bar.
  const progress = useMemo<ProgressPart[]>(() => {
    const missing = new Map<string, number>(PROGRESS_PARTS.map((p) => [p, 0]));
    for (const issue of shownParsed.ok ? [] : shownParsed.issues) {
      const part = partOf(issue);
      missing.set(part, missing.get(part)! + 1);
    }
    return PROGRESS_PARTS.map((name) => ({ name, missing: missing.get(name)! }));
  }, [shownParsed]);

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

  function chooseBreakEven(id: string) {
    setBreakEvenId(id);
    saveBreakEven(id);
  }

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
    // A hall's fields sit in its settings panel: open it first.
    if (issue.path[0] === "frame" && issue.path[1] === "halls") {
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

  // The court shown in the Draw stage's court panel; none shows the call-up list.
  const [selectedCourt, setSelectedCourt] = useState<string | null>(null);

  // The stage being looked at: any stage reached so far; it opens on the furthest.
  const [stageView, setStageView] = useState<TournamentStage>(draft.stage);
  // Once any category's draw is locked, the structure is read-only.
  const locked = Object.values(draft.draw).some((d) => d.locked);
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
          onRemove: () => {
            // With the organiser's own data on this stage too, ask first.
            if (
              ownDataLeft(draftRef.current, sampleStage) &&
              !window.confirm(`Remove the sample data from ${stageName}? Your own data stays as it is.`)
            )
              return;
            commit(removeDummy(draftRef.current, sampleStage), false);
          },
        }
      : { label: `No sample data in ${stageName}`, onRemove: null };

  /** Move the tournament on to a stage, after asking. */
  function advance(next: TournamentStage) {
    if (next === "draw") {
      if (
        !window.confirm(
          "Move on to the draw? From here the plan uses the entries you enter instead of the expected numbers. You can go back to the expected numbers.",
        )
      )
        return;
    }
    commit(produce(draftRef.current, (d) => void (d.stage = next)), false);
    setStageView(next);
  }

  function reopenEntries() {
    if (!window.confirm("Use the expected numbers again? The entries are kept; the plan uses them again when you move on to the draw.")) return;
    commit(produce(draftRef.current, (d) => void (d.stage = "plan")), false);
    setStageView("plan");
  }

  function unlockDraw() {
    if (!window.confirm("Unlock the draw? Categories, groups, rules and entries become editable; the draw is kept.")) return;
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
  const foldTimeline = (folded: boolean) => (folded ? timelinePanel.current?.collapse() : timelinePanel.current?.expand());
  const [workbenchFolded, setWorkbenchFolded] = useState(loadWorkbenchFolded);
  function foldWorkbench(folded: boolean) {
    setWorkbenchFolded(folded);
    saveWorkbenchFolded(folded);
  }

  // The venue over the timeline: the Plan stage's working area, and the Draw stage's Schedule page.
  const workingArea = (
    <ResizablePanelGroup
      orientation="vertical"
      defaultLayout={dock.defaultLayout}
      onLayoutChanged={dock.onLayoutChanged}
    >
      <ResizablePanel id="venue" minSize={160}>
        <div className="@container scroll-pane relative h-full overflow-y-auto px-(--pane-x)">
          <div className={cn(COLUMN, "flex flex-col gap-4 py-4")}>
            <VenueCanvas draft={shown} update={update} statuses={statuses} courtGroups={courtGroups} />
          </div>
        </div>
      </ResizablePanel>
      <ResizableHandle className={DIVIDER} />
      <ResizablePanel
        id="timeline"
        defaultSize="45"
        minSize={220}
        collapsible
        collapsedSize={TIMELINE_FOLDED}
        panelRef={timelinePanel}
        onResize={(size) => setTimelineFolded(size.inPixels <= TIMELINE_FOLDED + 1)}
        className="h-full"
      >
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
        />
      </ResizablePanel>
    </ResizablePanelGroup>
  );

  // The stages under the tournament's name. On the Plan stage they sit over the venue, beside the workbench.
  const stageRow = (
    <StageRow
      stage={draft.stage}
      view={viewing}
      onView={setStageView}
      onAdvance={advance}
      actions={
        // Live runs on the day's real data: no sample data there.
        viewing === "live" ? null : <SampleDataButtons fill={sampleFill} remove={sampleRemove} />
      }
    />
  );

  return (
    <TooltipProvider delay={300}>
      <ViewRangeContext value={view}>
        <IssuesContext value={issues}>
          <div className="relative flex h-dvh min-w-[1024px] overflow-hidden overscroll-none bg-background">
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
            <main className="flex min-w-0 flex-1 flex-col">
              <div className="shrink-0 px-(--pane-x)">
                <div className={COLUMN}>
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
                {viewing !== "plan" ? (
                  <DrawStage
                    draft={draft}
                    update={update}
                    locked={locked}
                    segments={segments}
                    moment={moment}
                    view={drawView}
                    onViewChange={setDrawView}
                    courts={
                      <CourtSelectionContext value={{ selected: selectedCourt, onSelect: setSelectedCourt }}>
                        <div className="flex min-h-0 flex-1 gap-2 pr-2 pb-2">
                          <div className="min-w-0 flex-1">{workingArea}</div>
                          <div className={cn(CARD, "w-(--pane-right-min) shrink-0")}>
                            <CourtPanel
                              draft={shown}
                              segments={segments}
                              moment={moment}
                              courtId={selectedCourt}
                              onClose={() => setSelectedCourt(null)}
                            />
                          </div>
                        </div>
                      </CourtSelectionContext>
                    }
                  />
                ) : (
                  <div className="min-w-0 flex-1">{workingArea}</div>
                )}
              </div>
            </main>
            {viewing === "plan" ? (
              workbenchFolded ? (
                <aside
                  aria-label="Workbench (hidden)"
                  className={cn(WORKBENCH, "w-10 items-center gap-3")}
                >
                  <IconButton label="Show workbench" side="left" aria-expanded={false} onClick={() => foldWorkbench(false)}>
                    <CaretDoubleLeftIcon />
                  </IconButton>
                  <div className="h-48">
                    <ProgressSegments parts={progress} vertical />
                  </div>
                </aside>
              ) : (
                <aside aria-label="Workbench" className={cn(WORKBENCH, "w-[440px]")}>
                  {draft.stage !== "plan" ? (
                    <StageBar
                      locked={locked}
                      entries={draft.entries.length}
                      onReopen={reopenEntries}
                      onUnlock={unlockDraw}
                    />
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
                  <div className="flex shrink-0 items-start gap-2 px-4 pb-3">
                    <div className="min-w-0 flex-1">
                      <Summary
                        draft={shown}
                        parsed={shownParsed}
                        analysis={shownAnalysis}
                        progress={progress}
                        warnings={warnings}
                        onGoTo={goTo}
                      />
                    </div>
                    <IconButton label="Hide workbench" side="left" aria-expanded onClick={() => foldWorkbench(true)}>
                      <XIcon />
                    </IconButton>
                  </div>
                  <Tabs
                    value={tab}
                    onValueChange={(value) => chooseTab(value as Tab)}
                    className="min-h-0 flex-1 gap-0"
                  >
                    <TabsList variant="line" className="w-full shrink-0 justify-start px-2">
                      {TABS.map((t) => (
                        <TabsTrigger key={t.value} value={t.value}>
                          {t.label}
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
                        <ScheduleTab draft={draft} update={update} locked={locked} />
                        <DerivedCards
                          tab="schedule"
                          draft={draft}
                          parsed={parsed}
                          analysis={analysis}
                          breakEvenId={breakEvenId}
                          onChooseBreakEven={chooseBreakEven}
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
                          breakEvenId={breakEvenId}
                          onChooseBreakEven={chooseBreakEven}
                          preview={preview}
                          onPreview={setPreview}
                          locked={locked}
                        />
                      </TabsContent>
                    </div>
                  </Tabs>
                </aside>
              )
            ) : null}
          </div>
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
    onDelete: (id) => {
      const name = indexRef.current.items.find((t) => t.id === id)?.name.trim() || "Untitled tournament";
      if (!window.confirm(`Delete “${name}”? This can’t be undone.`)) return;
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
  return <Workspace />;
}
