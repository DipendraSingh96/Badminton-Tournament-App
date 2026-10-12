"use client";

import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { profitCurve, type AnalysisResult, type CapacityStatus } from "@/engine";
import type { PlanDraft } from "@/lib/tournament/draft";
import type { ParseResult, PlanIssue } from "@/lib/tournament/schema";
import { analysisErrorMessages, categoryName, formatMinutesShort, formatMoney, issueSection } from "./labels";

const STATUS: Record<CapacityStatus, { label: string; chip: string; bar: string }> = {
  fits: { label: "Fits", chip: "bg-success text-success-foreground", bar: "bg-success" },
  fitsTypicalOnly: { label: "Tight", chip: "bg-warning text-warning-foreground", bar: "bg-warning" },
  doesNotFit: { label: "Doesn't fit", chip: "bg-destructive text-destructive-foreground", bar: "bg-destructive" },
};

/** A read-only figure. Tinted, borderless and never styled like an input. */
function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 rounded-lg bg-muted px-3 py-2">
      <dt className="truncate text-xs text-muted-foreground">{label}</dt>
      <dd className="truncate font-mono text-lg font-semibold tracking-tight tabular-nums">{value}</dd>
    </div>
  );
}

const DASH = "–";

/**
 * Always-visible results at the top of the workbench. Recalculates with every
 * change; shows what is missing until the plan is complete.
 */
export function Summary({
  draft,
  parsed,
  analysis,
  onGoTo,
}: {
  draft: PlanDraft;
  parsed: ParseResult;
  analysis: AnalysisResult | null;
  onGoTo: (issue: PlanIssue) => void;
}) {
  const result = analysis?.ok ? analysis.analysis : null;
  const inputs = parsed.ok ? parsed.inputs : null;
  const first = inputs?.categories[0];

  const breakEven = useMemo(() => {
    if (!inputs || !first || !result) return null;
    return profitCurve(inputs, first.id, { from: 2, to: Math.max(first.expectedEntries * 2, 3) });
  }, [inputs, first, result]);

  const status = result ? STATUS[result.capacity.status] : null;
  const { capacity, finance } = result ?? {};
  const share = capacity && capacity.available.courtMinutes > 0
    ? (n: number) => `${Math.min(100, (n / capacity.available.courtMinutes) * 100)}%`
    : null;

  const missing = !parsed.ok ? parsed.issues : [];
  const problems = analysis && !analysis.ok ? analysis.errors.flatMap((e) => analysisErrorMessages(draft, e)) : [];

  return (
    <section aria-label="Summary" className="@container flex flex-col gap-3 border-b bg-card p-5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Summary</h2>
        {status ? (
          <Badge className={status.chip}>{status.label}</Badge>
        ) : (
          <Badge variant="outline">Incomplete</Badge>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex justify-between gap-2 text-sm">
          <span className="text-muted-foreground">Court time needed</span>
          <span className="tabular-nums">
            {capacity
              ? `${formatMinutesShort(capacity.needed.typical)} of ${formatMinutesShort(capacity.available.courtMinutes)} available`
              : DASH}
          </span>
        </div>
        <div className="relative h-2 rounded-full bg-muted" aria-hidden="true">
          {capacity && share && status ? (
            <>
              <div className={`h-2 rounded-full ${status.bar}`} style={{ width: share(capacity.needed.typical) }} />
              <div
                className="absolute -top-1 h-4 w-0.5 rounded bg-foreground/60"
                style={{ left: share(capacity.needed.worst) }}
                title="Worst case"
              />
            </>
          ) : null}
        </div>
        {capacity ? (
          <p className="text-xs text-muted-foreground">
            Worst case {formatMinutesShort(capacity.needed.worst)} (marker).
          </p>
        ) : null}
      </div>

      <dl className="grid grid-cols-3 gap-2">
        <Tile label="Matches" value={result ? String(result.totalMatches) : DASH} />
        <Tile label="Revenue" value={finance ? formatMoney(finance.revenue) : DASH} />
        <Tile label="Total cost" value={finance ? formatMoney(finance.totalCost) : DASH} />
      </dl>
      <dl className="grid grid-cols-2 gap-2">
        <Tile
          label={finance && finance.profit < 0 ? "Loss" : "Profit"}
          value={finance ? formatMoney(Math.abs(finance.profit)) : DASH}
        />
        <Tile
          label={first ? `Break-even entries · ${categoryName(draft, first.id)}` : "Break-even entries"}
          value={breakEven ? (breakEven.breakEven !== null ? String(breakEven.breakEven) : "None") : DASH}
        />
      </dl>

      {missing.length > 0 ? (
        <p className="text-sm text-muted-foreground">
          {missing.length} {missing.length === 1 ? "item" : "items"} to fill in.{" "}
          <button
            type="button"
            className="font-medium text-foreground underline underline-offset-4"
            onClick={() => onGoTo(missing[0]!)}
          >
            {issueSection(draft, missing[0]!)}: {missing[0]!.message}
          </button>
        </p>
      ) : problems.length > 0 ? (
        <p className="text-sm text-destructive">{problems[0]}</p>
      ) : null}
    </section>
  );
}
