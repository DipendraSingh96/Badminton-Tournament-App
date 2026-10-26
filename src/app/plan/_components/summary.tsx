"use client";

import { CaretDownIcon, CaretUpIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { useMemo, useState, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { profitCurve, type AnalysisResult, type Capacity } from "@/engine";
import type { PlanDraft } from "@/lib/tournament/draft";
import type { ParseResult, PlanIssue } from "@/lib/tournament/schema";
import { cn } from "@/lib/utils";
import {
  FIT_STATUS,
  analysisErrorMessages,
  categoryName,
  formatMinutesShort,
  formatMoney,
  issueSection,
} from "./labels";

const DASH = "–";
/** The fit gauge is drawn in this many segments: a display constant, the fill is computed. */
const GAUGE_SEGMENTS = 40;

/** A figure on the deep summary card: label above, numeral below. */
function Tile({
  label,
  value,
  note,
  tone = "plain",
  size = "l",
}: {
  label: ReactNode;
  value: string;
  note?: string;
  tone?: "plain" | "profit" | "loss";
  size?: "l" | "s";
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-1 rounded-lg px-3 py-2.5",
        tone === "plain" && "bg-feature-inner text-feature-foreground",
        tone === "profit" && "bg-shuttle text-shuttle-foreground",
        tone === "loss" && "bg-over-strong text-over-foreground",
      )}
    >
      <dt className={cn("truncate text-[13px] font-semibold", tone === "plain" && "text-feature-muted")}>{label}</dt>
      <dd className={cn("truncate", size === "l" ? "numeral-l" : "font-display text-xl font-semibold tabular-nums")}>
        {value}
      </dd>
      {note ? <p className={cn("truncate text-xs", tone === "plain" && "text-feature-muted")}>{note}</p> : null}
    </div>
  );
}

/**
 * Court time needed against available, in segments: filled up to the typical
 * need, one warning segment where the worst case falls.
 */
function FitGauge({ capacity }: { capacity: Capacity | null }) {
  const available = capacity?.available.courtMinutes ?? 0;
  const at = (minutes: number) =>
    available > 0 ? Math.min(GAUGE_SEGMENTS, Math.round((minutes / available) * GAUGE_SEGMENTS)) : 0;
  const filled = capacity ? at(capacity.needed.typical) : 0;
  const worst = capacity ? Math.min(GAUGE_SEGMENTS, Math.max(1, at(capacity.needed.worst))) - 1 : -1;
  const label = capacity
    ? `Court time needed ${formatMinutesShort(capacity.needed.typical)} of ${formatMinutesShort(available)} available; worst case ${formatMinutesShort(capacity.needed.worst)}.`
    : "Court time needed: not yet known.";
  return (
    <div role="img" aria-label={label} className="flex h-3.5 gap-[3px]">
      {Array.from({ length: GAUGE_SEGMENTS }, (_, i) => (
        <span
          key={i}
          className={cn(
            "flex-1 rounded-[2px]",
            i === worst ? "bg-gauge-warn" : i < filled
                ? "bg-gauge-on"
                : "bg-gauge-off",
          )}
        />
      ))}
    </div>
  );
}

// Per-viewer convenience: whether the summary is collapsed, kept in this browser.
const COLLAPSED_KEY = "badminton:summary-collapsed";

function loadCollapsed(): boolean {
  try {
    return window.localStorage.getItem(COLLAPSED_KEY) === "true";
  } catch {
    return false;
  }
}

function saveCollapsed(collapsed: boolean) {
  try {
    window.localStorage.setItem(COLLAPSED_KEY, String(collapsed));
  } catch {
    // Not remembered; the summary opens expanded next time.
  }
}

/**
 * Always-visible results at the top of the workbench: the one deep-green card
 * (docs/design-system.md, "Summary card"). Recalculates with every change;
 * shows what is missing until the plan is complete.
 */
export function Summary({
  draft,
  parsed,
  analysis,
  breakEvenId,
  warnings,
  onGoTo,
}: {
  draft: PlanDraft;
  parsed: ParseResult;
  analysis: AnalysisResult | null;
  /** The category break-even varies; the first when unset or removed. */
  breakEvenId: string | null;
  /** Problems with zones and matches on the timeline; they don't stop the plan. */
  warnings: string[];
  onGoTo: (issue: PlanIssue) => void;
}) {
  const result = analysis?.ok ? analysis.analysis : null;
  const inputs = parsed.ok ? parsed.inputs : null;
  const first = inputs?.categories.find((c) => c.id === breakEvenId) ?? inputs?.categories[0];

  const breakEven = useMemo(() => {
    if (!inputs || !first || !result) return null;
    return profitCurve(inputs, first.id, { from: 2, to: Math.max(first.expectedEntries * 2, 3) });
  }, [inputs, first, result]);

  const status = result ? FIT_STATUS[result.capacity.status] : null;
  const { capacity, finance } = result ?? {};
  const loss = finance ? finance.profit < 0 : false;

  const missing = !parsed.ok ? parsed.issues : [];
  const problems = analysis && !analysis.ok ? analysis.errors.flatMap((e) => analysisErrorMessages(draft, e)) : [];
  const [collapsed, setCollapsed] = useState(loadCollapsed);

  function toggle() {
    setCollapsed(!collapsed);
    saveCollapsed(!collapsed);
  }

  const notes: string[] = problems.length > 0 ? problems.slice(0, 1) : warnings;
  const toFill =
    missing.length > 0 ? (
      <p className="text-sm text-feature-muted">
        {missing.length} {missing.length === 1 ? "item" : "items"} to fill in.{" "}
        <button
          type="button"
          className="rounded-sm font-semibold text-feature-foreground underline underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-mint"
          onClick={() => onGoTo(missing[0]!)}
        >
          {issueSection(draft, missing[0]!)}: {missing[0]!.message}
        </button>
      </p>
    ) : notes.length > 0 ? (
      <ul className="flex flex-col gap-1 text-sm text-feature-foreground">
        {notes.slice(0, 2).map((w) => (
          <li key={w} className="flex gap-1.5">
            <WarningCircleIcon weight="fill" className="mt-0.5 size-4 shrink-0 text-gauge-warn" aria-hidden="true" />
            {w}
          </li>
        ))}
        {notes.length > 2 ? <li className="pl-5.5 text-feature-muted">and {notes.length - 2} more on the timeline</li> : null}
      </ul>
    ) : null;

  const header = (
    <div className="flex items-center justify-between gap-2">
      <h2 className="heading-card text-mint">Summary</h2>
      <div className="flex items-center gap-1.5">
        {status ? <Badge variant={status.variant}>{status.label}</Badge> : <Badge variant="off">Incomplete</Badge>}
        <Button
          variant="ghost"
          size="icon-sm"
          className="text-feature-foreground hover:bg-white/10 aria-expanded:bg-transparent aria-expanded:hover:bg-white/10 focus-visible:ring-mint focus-visible:ring-offset-feature"
          aria-expanded={!collapsed}
          aria-controls="summary-body"
          aria-label={collapsed ? "Show summary" : "Hide summary"}
          onClick={toggle}
        >
          {collapsed ? <CaretDownIcon /> : <CaretUpIcon />}
        </Button>
      </div>
    </div>
  );

  return (
    <section aria-label="Summary" className="@container shrink-0 border-b bg-card p-4">
      <div className="flex flex-col gap-3.5 rounded-xl bg-feature p-[18px] text-feature-foreground">
        {header}
        {collapsed ? (
          result && capacity && finance ? (
            <p className="flex flex-wrap gap-x-3 gap-y-0.5 text-sm tabular-nums">
              <span>
                {formatMinutesShort(capacity.needed.typical)} of {formatMinutesShort(capacity.available.courtMinutes)}
              </span>
              <span>{result.totalMatches} matches</span>
              <span className={cn("font-semibold", !loss && "text-shuttle")}>
                {loss ? "Loss" : "Profit"} {formatMoney(Math.abs(finance.profit))}
              </span>
            </p>
          ) : (
            toFill
          )
        ) : (
          <div id="summary-body" className="flex flex-col gap-3.5">
            <div className="flex flex-col gap-2">
              <p className="text-sm font-semibold text-feature-muted">Court time needed</p>
              <p className="flex items-baseline gap-2">
                <span className="numeral-xl text-shuttle">
                  {capacity ? formatMinutesShort(capacity.needed.typical) : DASH}
                </span>
                {capacity ? (
                  <span className="text-[15px] text-feature-muted tabular-nums">
                    of {formatMinutesShort(capacity.available.courtMinutes)} available
                  </span>
                ) : null}
              </p>
              <FitGauge capacity={capacity ?? null} />
              {capacity ? (
                <p className="flex items-center gap-1.5 text-[13px] text-feature-muted tabular-nums">
                  <span className="h-2.5 w-1.5 rounded-[2px] bg-gauge-warn" aria-hidden="true" />
                  Worst case {formatMinutesShort(capacity.needed.worst)}
                </p>
              ) : null}
            </div>

            <dl className="grid grid-cols-2 gap-2">
              <Tile label="Matches" value={result ? String(result.totalMatches) : DASH} />
              <Tile
                label={finance ? (loss ? "Loss" : "Profit") : "Profit"}
                value={finance ? formatMoney(Math.abs(finance.profit)) : DASH}
                tone={finance ? (loss ? "loss" : "profit") : "plain"}
              />
            </dl>
            <dl className="grid grid-cols-3 gap-2">
              <Tile size="s" label="Revenue" value={finance ? formatMoney(finance.revenue) : DASH} />
              <Tile size="s" label="Total cost" value={finance ? formatMoney(finance.totalCost) : DASH} />
              <Tile
                size="s"
                label="Break-even"
                value={breakEven ? (breakEven.breakEven !== null ? String(breakEven.breakEven) : "None") : DASH}
                note={first ? categoryName(draft, first.id) : undefined}
              />
            </dl>

            {toFill}
          </div>
        )}
      </div>
    </section>
  );
}
