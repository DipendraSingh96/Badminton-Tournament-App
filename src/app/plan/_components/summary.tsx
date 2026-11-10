"use client";

import { ArrowDownIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import type { AnalysisResult } from "@/engine";
import type { PlanDraft } from "@/lib/tournament/draft";
import type { ParseResult, PlanIssue } from "@/lib/tournament/schema";
import { cn } from "@/lib/utils";
import { FIT_STATUS, analysisErrorMessages, formatMinutesShort, formatMoney, issueSection } from "./labels";

/** A part of the plan for the progress bar: done when nothing in it is missing. */
export interface ProgressPart {
  name: string;
  /** Items still to fill in. */
  missing: number;
}

/**
 * How complete the plan is, one segment per part (Basics, Venue, Setup,
 * Schedule, Finance), filled when that part has nothing missing. Across the
 * top of the workbench, or down its rail when it's folded away.
 */
export function ProgressSegments({
  parts,
  status = null,
  vertical = false,
}: {
  parts: ProgressPart[];
  /** The plan's fit once it's worked out; filled parts take its colour, as the chip beside them does. */
  status?: "fits" | "tight" | "over" | null;
  vertical?: boolean;
}) {
  const filled = status === "fits" ? "bg-fits" : status === "tight" ? "bg-tight" : status === "over" ? "bg-over" : "bg-muted-foreground";
  const done = parts.filter((p) => p.missing === 0).length;
  return (
    <div
      role="img"
      aria-label={`${done} of ${parts.length} parts complete`}
      className={cn("flex gap-1", vertical ? "h-full w-2 flex-col" : "h-2")}
    >
      {parts.map((p) => (
        <span
          key={p.name}
          title={p.missing === 0 ? `${p.name}: complete` : `${p.name}: ${p.missing} to fill in`}
          className={cn("flex-1 rounded-full", p.missing === 0 ? filled : "bg-border")}
        />
      ))}
    </div>
  );
}

/**
 * The top of the workbench: how complete the plan is, then what to fill in
 * next. Once the plan is complete, its fit and one line of results (court
 * time, matches, profit); the full figures are in the Schedule and
 * Budget tabs. Recalculates with every change.
 */
export function Summary({
  draft,
  parsed,
  analysis,
  progress,
  warnings,
  onGoTo,
}: {
  draft: PlanDraft;
  parsed: ParseResult;
  analysis: AnalysisResult | null;
  progress: ProgressPart[];
  /** Problems with zones and matches on the timeline; they don't stop the plan. */
  warnings: string[];
  onGoTo: (issue: PlanIssue) => void;
}) {
  const result = analysis?.ok ? analysis.analysis : null;
  const status = result ? FIT_STATUS[result.capacity.status] : null;
  const missing = !parsed.ok ? parsed.issues : [];
  const problems = analysis && !analysis.ok ? analysis.errors.flatMap((e) => analysisErrorMessages(draft, e)) : [];
  const notes: string[] = problems.length > 0 ? problems.slice(0, 1) : warnings;
  const loss = result ? result.finance.profit < 0 : false;

  return (
    <section aria-label="Summary" className="flex flex-col gap-2">
      <div className="flex min-h-8 items-center gap-3">
        <div className="min-w-0 flex-1">
          <ProgressSegments parts={progress} status={status?.variant ?? null} />
        </div>
        {status ? <Badge variant={status.variant}>{status.label}</Badge> : <Badge variant="off">Incomplete</Badge>}
      </div>
      {missing.length > 0 ? (
        <p className="text-sm text-muted-foreground">
          {missing.length} {missing.length === 1 ? "item" : "items"} to fill in.{" "}
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-sm font-semibold text-foreground decoration-primary decoration-[3px] underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => onGoTo(missing[0]!)}
          >
            {issueSection(draft, missing[0]!)}: {missing[0]!.message}
            <ArrowDownIcon weight="bold" className="size-3.5 shrink-0" aria-hidden="true" />
          </button>
        </p>
      ) : result ? (
        <p className="flex flex-wrap gap-x-3 gap-y-1 text-sm tabular-nums">
          <span>
            {formatMinutesShort(result.capacity.needed.typical)} of {formatMinutesShort(result.capacity.available.courtMinutes)}
          </span>
          <span>{result.totalMatches} matches</span>
          <span className={cn("font-semibold", loss ? "text-over-text" : "text-fits-text")}>
            {loss ? "Loss" : "Profit"} {formatMoney(Math.abs(result.finance.profit))}
          </span>
        </p>
      ) : null}
      {notes.length > 0 ? (
        <ul className="flex flex-col gap-1 text-sm">
          {notes.slice(0, 2).map((w) => (
            <li key={w} className="flex gap-2">
              <WarningCircleIcon weight="fill" className="mt-0.5 size-4 shrink-0 text-over-text" aria-hidden="true" />
              {w}
            </li>
          ))}
          {notes.length > 2 ? <li className="pl-6 text-muted-foreground">and {notes.length - 2} more on the timeline</li> : null}
        </ul>
      ) : null}
    </section>
  );
}
