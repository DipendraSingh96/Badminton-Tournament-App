"use client";

import { produce } from "immer";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useDefaultLayout } from "react-resizable-panels";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { analyseTournament } from "@/engine";
import { emptyDraft, type PlanDraft } from "@/lib/tournament/draft";
import { parsePlan, type PlanIssue } from "@/lib/tournament/schema";
import { clearDraft, loadDraft, saveDraft } from "@/lib/tournament/storage";
import { DerivedCards } from "./dashboard";
import { EntriesSection } from "./entries-section";
import { EventTimingSection } from "./event-timing-section";
import { FeesSection } from "./fees-section";
import { IssuesContext, issueMap, pathKey } from "./fields";
import { FinanceSection } from "./finance-section";
import { BufferSection } from "./buffer-section";
import { SetupTab } from "./setup-tab";
import { StageRulesSection } from "./stage-rules-section";
import { Summary } from "./summary";
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
    case "eventTiming":
    case "bestOfThreeAllowance":
      return "schedule";
    case "finance":
      return "finance";
    case "frame":
      return issue.path[1] === "bufferMinutes" ? "schedule" : null;
    default:
      return null;
  }
}

function browserTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

function Editor() {
  const [draft, setDraft] = useState<PlanDraft>(() => loadDraft() ?? emptyDraft(browserTimeZone()));
  const [tab, setTab] = useState<Tab>(loadTab);
  const layout = useDefaultLayout({ id: "badminton:plan-layout", storage: window.localStorage });

  useEffect(() => saveDraft(draft), [draft]);

  const update = useCallback<Update>((recipe) => setDraft(produce(recipe)), []);

  const parsed = useMemo(() => parsePlan(draft), [draft]);
  const issues = useMemo(() => issueMap(parsed.ok ? [] : parsed.issues), [parsed]);
  const analysis = useMemo(
    () => (parsed.ok ? analyseTournament(parsed.inputs) : null),
    [parsed],
  );

  function chooseTab(next: Tab) {
    setTab(next);
    saveTab(next);
  }

  /** Open the tab holding an issue's field, then bring the field into view. */
  function goTo(issue: PlanIssue) {
    const target = tabFor(issue);
    if (target) chooseTab(target);
    requestAnimationFrame(() => {
      const field = document.querySelector<HTMLElement>(`[data-path="${pathKey(issue.path)}"]`);
      field?.scrollIntoView({ behavior: "smooth", block: "center" });
      field?.querySelector<HTMLElement>("input, select")?.focus({ preventScroll: true });
    });
  }

  function newTournament() {
    if (!window.confirm("Clear every input and start a new tournament?")) return;
    clearDraft();
    setDraft(emptyDraft(browserTimeZone()));
  }

  return (
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
              <main className="@container h-full overflow-y-auto">
                <div className="mx-auto flex max-w-5xl flex-col gap-6 p-6">
                  <TournamentHeader draft={draft} update={update} />
                  <VenueCanvas draft={draft} update={update} />
                  <Card>
                    <CardHeader>
                      <CardTitle>Timeline</CardTitle>
                      <CardDescription>
                        The timeline shows each hall&apos;s courts and rate bands across the day once the venue is
                        set up.
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="h-24 rounded-lg border border-dashed" />
                    </CardContent>
                  </Card>
                </div>
              </main>
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel id="workbench" defaultSize="34" minSize={360} maxSize="55">
              <aside aria-label="Workbench" className="flex h-full flex-col border-l bg-card">
                <Summary draft={draft} parsed={parsed} analysis={analysis} onGoTo={goTo} />
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
                      <EntriesSection draft={draft} update={update} />
                      <BufferSection draft={draft} update={update} />
                      <StageRulesSection draft={draft} update={update} />
                      <EventTimingSection draft={draft} update={update} />
                      <DerivedCards tab="schedule" draft={draft} parsed={parsed} analysis={analysis} />
                    </TabsContent>
                    <TabsContent value="finance" className="flex flex-col gap-4 p-4">
                      <FeesSection draft={draft} update={update} />
                      <FinanceSection draft={draft} update={update} />
                      <DerivedCards tab="finance" draft={draft} parsed={parsed} analysis={analysis} />
                    </TabsContent>
                  </div>
                </Tabs>
              </aside>
            </ResizablePanel>
          </ResizablePanelGroup>
        </div>
      </div>
    </IssuesContext>
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
