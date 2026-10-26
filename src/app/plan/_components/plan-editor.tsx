"use client";

import { produce } from "immer";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useDefaultLayout } from "react-resizable-panels";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { analyseTournament, estimateSchedule, type LeverChange } from "@/engine";
import { applyLever } from "@/lib/tournament/levers";
import { emptyDraft, type PlanDraft } from "@/lib/tournament/draft";
import { minutesOfDay } from "@/lib/tournament/time";
import { parsePlan, type PlanIssue } from "@/lib/tournament/schema";
import { clearDraft, loadDraft, saveDraft } from "@/lib/tournament/storage";
import { DerivedCards } from "./dashboard";
import { PreviewBar } from "./preview-bar";
import { IssuesContext, issueMap, pathKey } from "./fields";
import { FinanceTab } from "./finance-tab";
import { ScheduleTab } from "./schedule-tab";
import { SetupTab } from "./setup-tab";
import { Summary } from "./summary";
import { ViewRangeContext, viewRangeOf, type ViewRange } from "./time-window";
import { Timeline, courtStatuses, dayRange, localSegments, zoneRows, zoneWarnings } from "./timeline";
import { TopBar } from "./top-bar";
import { TournamentHeader } from "./tournament-header";
import { TournamentList } from "./tournament-list";
import { VenueCanvas } from "./venue-canvas";

export type Update = (recipe: (draft: PlanDraft) => void) => void;

type Tab = "setup" | "schedule" | "finance";

const TABS: { value: Tab; label: string }[] = [
  { value: "setup", label: "Tournament setup" },
  { value: "schedule", label: "Schedule structure" },
  { value: "finance", label: "Finance" },
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

// The category break-even varies, chosen on the Finance tab.
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

function Editor() {
  const [draft, setDraft] = useState<PlanDraft>(() => loadDraft() ?? emptyDraft(browserTimeZone()));
  const [tab, setTab] = useState<Tab>(loadTab);
  const [breakEvenId, setBreakEvenId] = useState<string | null>(loadBreakEven);
  // The timeline's playhead, in minutes since midnight; not saved.
  const [playhead, setPlayhead] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const layout = useDefaultLayout({ id: "badminton:plan-layout", storage: window.localStorage });
  // The timeline docked under the venue: its height is remembered too.
  const dock = useDefaultLayout({ id: "badminton:plan-layout-v", storage: window.localStorage });

  // A suggested lever being previewed: everything derived shows the plan with it; not saved.
  const [preview, setPreview] = useState<LeverChange | null>(null);

  useEffect(() => saveDraft(draft), [draft]);

  // Any edit ends a preview and is made to the plan itself. An edit to something only
  // the preview has (the court a lever would add) goes with the preview.
  const update = useCallback<Update>((recipe) => {
    setPreview(null);
    setDraft((current) => {
      try {
        return produce(current, recipe);
      } catch {
        return current;
      }
    });
  }, []);

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
  const warnings = useMemo(() => zoneWarnings(shown, zones), [shown, zones]);
  const range = dayRange(shown);

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
    setDraft((current) => applyLever(current, preview));
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

  function chooseBreakEven(id: string) {
    setBreakEvenId(id);
    saveBreakEven(id);
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

  function newTournament() {
    if (!window.confirm("Clear every input and start a new tournament?")) return;
    clearDraft();
    setDraft(emptyDraft(browserTimeZone()));
  }

  return (
    <TooltipProvider delay={300}>
      <ViewRangeContext value={view}>
        <IssuesContext value={issues}>
          <div className="flex h-dvh min-w-[1024px] flex-col bg-background">
            <TopBar />
            <div className="flex min-h-0 flex-1">
              <TournamentList draft={draft} onNew={newTournament} />
              <ResizablePanelGroup
                orientation="horizontal"
                defaultLayout={layout.defaultLayout}
                onLayoutChanged={layout.onLayoutChanged}
              >
                <ResizablePanel id="working-area" minSize="40">
                  <main className="h-full">
                    <ResizablePanelGroup
                      orientation="vertical"
                      defaultLayout={dock.defaultLayout}
                      onLayoutChanged={dock.onLayoutChanged}
                    >
                      <ResizablePanel id="venue" minSize={160}>
                        <div className="@container h-full overflow-y-auto">
                          <div className="mx-auto flex max-w-5xl flex-col gap-6 p-6">
                            <TournamentHeader draft={draft} update={update} />
                            <VenueCanvas draft={shown} update={update} statuses={statuses} />
                          </div>
                        </div>
                      </ResizablePanel>
                      <ResizableHandle withHandle />
                      <ResizablePanel id="timeline" defaultSize="45" minSize={220}>
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
                        />
                      </ResizablePanel>
                    </ResizablePanelGroup>
                  </main>
                </ResizablePanel>
                <ResizableHandle withHandle />
                <ResizablePanel id="workbench" defaultSize={440} minSize={400} maxSize={480}>
                  <aside aria-label="Workbench" className="flex h-full flex-col border-l bg-card">
                    {preview && parsed.ok ? (
                      <PreviewBar
                        change={preview}
                        inputs={parsed.inputs}
                        draft={draft}
                        onKeep={keepPreview}
                        onDiscard={() => setPreview(null)}
                      />
                    ) : null}
                    <Summary
                      draft={shown}
                      parsed={shownParsed}
                      analysis={shownAnalysis}
                      breakEvenId={breakEvenId}
                      warnings={warnings}
                      onGoTo={goTo}
                    />
                    <Tabs
                      value={tab}
                      onValueChange={(value) => chooseTab(value as Tab)}
                      className="min-h-0 flex-1 gap-0"
                    >
                      <TabsList variant="line" className="w-full justify-start border-b px-3">
                        {TABS.map((t) => (
                          <TabsTrigger key={t.value} value={t.value}>
                            {t.label}
                          </TabsTrigger>
                        ))}
                      </TabsList>
                      <div className="@container min-h-0 flex-1 overflow-y-auto bg-background">
                        <TabsContent value="setup" className="flex flex-col gap-4 p-4">
                          <SetupTab draft={draft} update={update} />
                        </TabsContent>
                        <TabsContent value="schedule" className="flex flex-col gap-4 p-4">
                          <ScheduleTab draft={draft} update={update} />
                          <DerivedCards
                            tab="schedule"
                            draft={draft}
                            parsed={parsed}
                            analysis={analysis}
                            breakEvenId={breakEvenId}
                            onChooseBreakEven={chooseBreakEven}
                            preview={preview}
                            onPreview={setPreview}
                          />
                        </TabsContent>
                        <TabsContent value="finance" className="flex flex-col gap-4 p-4">
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
                          />
                        </TabsContent>
                      </div>
                    </Tabs>
                  </aside>
                </ResizablePanel>
              </ResizablePanelGroup>
            </div>
          </div>
        </IssuesContext>
      </ViewRangeContext>
    </TooltipProvider>
  );
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
  return <Editor />;
}
