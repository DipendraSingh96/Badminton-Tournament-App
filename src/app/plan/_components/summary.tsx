"use client";

import { ArrowDownIcon, WarningCircleIcon } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import type { AnalysisResult } from "@/engine";
import type { PlanDraft } from "@/lib/tournament/draft";
import { bookedCourtMinutes, healthBars } from "@/lib/tournament/health-bar";
import type { ParseResult, PlanIssue } from "@/lib/tournament/schema";
import { cn } from "@/lib/utils";
import { FIT_STATUS, analysisErrorMessages, formatMinutesShort, formatMoney, issueSection } from "./labels";

/** The most bars the health bar shows; with more hours booked, each bar stands for more than one hour. */
const MAX_BARS = 48;

/**
 * The plan's health bar: one small bar per hour of court time booked, filled
 * for the court time the matches need (the typical case), in the plan's
 * status colour, as the chip beside it. Empty and grey until the plan is
 * complete. Across the top of the workbench, or down its rail when it's
 * folded away.
 */
export function HealthBar({
  booked,
  needed,
  status = null,
  vertical = false,
}: {
  /** Court time booked, in minutes. */
  booked: number;
  /** Court time the matches need, in minutes; null until the plan is complete. */
  needed: number | null;
  status?: "fits" | "tight" | "over" | null;
  vertical?: boolean;
}) {
  const { hoursPerBar, fills } = healthBars(booked, needed, MAX_BARS);
  const colour = status === "fits" ? "bg-fits" : status === "tight" ? "bg-tight" : status === "over" ? "bg-over" : "bg-muted-foreground";
  const each = hoursPerBar === 1 ? "One bar is 1 hour." : `One bar is ${hoursPerBar} hours.`;
  const label =
    booked === 0
      ? "No court time booked yet"
      : needed === null
        ? `${formatMinutesShort(booked)} of court time booked. ${each}`
        : `${formatMinutesShort(needed)} needed of ${formatMinutesShort(booked)} booked. ${each}`;
  return (
    <div role="img" aria-label={label} title={label} className={cn("flex gap-0.5", vertical ? "h-full w-3 flex-col" : "h-2")}>
      {fills.length === 0 ? <span className="flex-1 rounded-full bg-border" /> : null}
      {fills.map((fill, i) => (
        <span key={i} className="relative block flex-1 overflow-hidden rounded-full bg-border">
          {fill > 0 ? (
            <span
              className={cn("absolute top-0 left-0", colour, vertical ? "w-full" : "h-full")}
              style={vertical ? { height: `${fill * 100}%` } : { width: `${fill * 100}%` }}
            />
          ) : null}
        </span>
      ))}
    </div>
  );
}

/** The status in the heading's own words: "Your plan fits", "is tight", "overflows". */
const HEADING_STATUS: Record<"fits" | "tight" | "over", { words: string; className: string }> = {
  fits: { words: "fits", className: "text-fits-text" },
  tight: { words: "is tight", className: "text-tight-text" },
  over: { words: "overflows", className: "text-over-text" },
};

/** The workbench's heading: what to do here, or the plan's status in words once it's complete. */
function PlanHeading({ missing, status }: { missing: number; status: "fits" | "tight" | "over" | null }) {
  if (missing > 0) return <>Set up your tournament</>;
  if (!status) return <>Your plan</>;
  return (
    <>
      Your plan <span className={HEADING_STATUS[status].className}>{HEADING_STATUS[status].words}</span>
    </>
  );
}

/**
 * The summary down the folded workbench's rail, its text running top to
 * bottom: the heading, the health bar, then the profit or loss (or how many
 * items are still to fill in).
 */
export function RailSummary({
  draft,
  parsed,
  analysis,
  hideMoney = false,
}: {
  draft: PlanDraft;
  parsed: ParseResult;
  analysis: AnalysisResult | null;
  /** The tournament is Live: no profit or loss on screen. */
  hideMoney?: boolean;
}) {
  const result = analysis?.ok ? analysis.analysis : null;
  const status = result ? FIT_STATUS[result.capacity.status].variant : null;
  const missing = !parsed.ok ? parsed.issues.length : 0;
  const loss = result ? result.finance.profit < 0 : false;
  const sideways = "whitespace-nowrap [writing-mode:vertical-rl]";
  return (
    <>
      <span className={cn(sideways, "text-xl font-semibold")}>
        <PlanHeading missing={missing} status={status} />
      </span>
      <span className="block h-56 shrink-0">
        <HealthBar
          booked={result ? result.capacity.available.courtMinutes : bookedCourtMinutes(draft.frame.halls)}
          needed={result ? result.capacity.needed.typical : null}
          status={status}
          vertical
        />
      </span>
      {missing > 0 ? (
        <span className={cn(sideways, "text-sm text-muted-foreground")}>
          {missing} {missing === 1 ? "item" : "items"} to fill in
        </span>
      ) : result && !hideMoney ? (
        <span className={cn(sideways, "text-sm font-semibold tabular-nums", loss ? "text-over-text" : "text-fits-text")}>
          {loss ? "Loss" : "Profit"} {formatMoney(Math.abs(result.finance.profit))}
        </span>
      ) : null}
    </>
  );
}

const LINK =
  "inline-flex items-center gap-1 rounded-sm font-semibold text-foreground decoration-primary decoration-[3px] underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring";

/**
 * The top of the workbench. A heading that says what to do here ("Set up
 * your tournament"), or the plan's status once it's complete. While items
 * are missing, how many and a link to the next one; with sample data in the
 * plan, how much and a link to the first of it. Then the health bar and
 * chip, and under them one line of results (court time, matches, profit);
 * the full figures are in the Schedule and Budget tabs. Recalculates with
 * every change.
 */
export function Summary({
  draft,
  parsed,
  analysis,
  warnings,
  sample,
  action,
  onGoTo,
  hideMoney = false,
}: {
  /** The tournament is Live: no profit or loss on screen. */
  hideMoney?: boolean;
  /** The sample data in the plan: how many items, and the first of them to jump to. */
  sample: { count: number; first: PlanIssue | null };
  /** At the right of the heading: the workbench's hide button. */
  action?: ReactNode;
  draft: PlanDraft;
  parsed: ParseResult;
  analysis: AnalysisResult | null;
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
      <div className="flex min-h-8 items-center gap-2">
        <h2 className="heading-card min-w-0 flex-1">
          <PlanHeading missing={missing.length} status={status?.variant ?? null} />
        </h2>
        {action}
      </div>
      {missing.length > 0 ? (
        <p className="text-sm text-muted-foreground">
          {missing.length} {missing.length === 1 ? "item" : "items"} to fill in.{" "}
          <button type="button" className={LINK} onClick={() => onGoTo(missing[0]!)}>
            {issueSection(draft, missing[0]!)}: {missing[0]!.message}
            <ArrowDownIcon weight="bold" className="size-3.5 shrink-0" aria-hidden="true" />
          </button>
        </p>
      ) : null}
      {sample.count > 0 ? (
        <p className="text-sm text-muted-foreground">
          {sample.count} {sample.count === 1 ? "item" : "items"} using sample data.{" "}
          {sample.first ? (
            <button type="button" className={LINK} onClick={() => onGoTo(sample.first!)}>
              {issueSection(draft, sample.first)}
              <ArrowDownIcon weight="bold" className="size-3.5 shrink-0" aria-hidden="true" />
            </button>
          ) : null}
        </p>
      ) : null}
      <div className="flex min-h-8 items-center gap-3">
        <div className="min-w-0 flex-1">
          <HealthBar
            booked={result ? result.capacity.available.courtMinutes : bookedCourtMinutes(draft.frame.halls)}
            needed={result ? result.capacity.needed.typical : null}
            status={status?.variant ?? null}
          />
        </div>
        {status ? <Badge variant={status.variant}>{status.label}</Badge> : <Badge variant="off">Incomplete</Badge>}
      </div>
      {missing.length === 0 && result ? (
        <p className="flex flex-wrap gap-x-3 gap-y-1 text-sm tabular-nums">
          <span>
            {formatMinutesShort(result.capacity.needed.typical)} of {formatMinutesShort(result.capacity.available.courtMinutes)}
          </span>
          <span>{result.totalMatches} matches</span>
          {hideMoney ? null : (
            <span className={cn("font-semibold", loss ? "text-over-text" : "text-fits-text")}>
              {loss ? "Loss" : "Profit"} {formatMoney(Math.abs(result.finance.profit))}
            </span>
          )}
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
