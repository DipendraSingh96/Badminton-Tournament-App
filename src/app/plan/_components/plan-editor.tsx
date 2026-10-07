"use client";

import { produce } from "immer";
import { RotateCcwIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { analyseTournament } from "@/engine";
import { emptyDraft, type PlanDraft } from "@/lib/tournament/draft";
import { parsePlan } from "@/lib/tournament/schema";
import { clearDraft, loadDraft, saveDraft } from "@/lib/tournament/storage";
import { CategoriesSection } from "./categories-section";
import { Dashboard } from "./dashboard";
import { IssuesContext, issueMap } from "./fields";
import { FinanceSection } from "./finance-section";
import { FrameSection } from "./frame-section";
import { StageRulesSection } from "./stage-rules-section";

export type Update = (recipe: (draft: PlanDraft) => void) => void;

function browserTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

function Editor() {
  const [draft, setDraft] = useState<PlanDraft>(() => loadDraft() ?? emptyDraft(browserTimeZone()));

  useEffect(() => saveDraft(draft), [draft]);

  const update = useCallback<Update>((recipe) => setDraft(produce(recipe)), []);

  const parsed = useMemo(() => parsePlan(draft), [draft]);
  const issues = useMemo(() => issueMap(parsed.ok ? [] : parsed.issues), [parsed]);
  const analysis = useMemo(
    () => (parsed.ok ? analyseTournament(parsed.inputs) : null),
    [parsed],
  );

  function startAgain() {
    if (!window.confirm("Clear every input and start a new plan?")) return;
    clearDraft();
    setDraft(emptyDraft(browserTimeZone()));
  }

  return (
    <IssuesContext value={issues}>
      <div className="flex flex-col gap-4">
        <div className="flex items-end gap-2">
          <label className="flex flex-1 flex-col gap-1.5">
            <span className="text-sm font-medium">Tournament name</span>
            <Input
              value={draft.name}
              placeholder="Untitled tournament"
              onChange={(e) => update((d) => void (d.name = e.target.value))}
            />
          </label>
          <Button variant="outline" onClick={startAgain}>
            <RotateCcwIcon /> Start again
          </Button>
        </div>

        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
          <div className="flex min-w-0 flex-col gap-4">
            <FrameSection draft={draft} update={update} />
            <CategoriesSection draft={draft} update={update} />
            <StageRulesSection draft={draft} update={update} />
            <FinanceSection draft={draft} update={update} />
          </div>
          <div className="flex min-w-0 flex-col gap-4 *:shrink-0 lg:sticky lg:top-4 lg:max-h-[calc(100dvh-2rem)] lg:overflow-y-auto">
            <Dashboard draft={draft} parsed={parsed} analysis={analysis} />
          </div>
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
    return <p className="text-sm text-muted-foreground">Loading your plan…</p>;
  }
  return <Editor />;
}
