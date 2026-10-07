"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  STAGES,
  profitCurve,
  type Analysis,
  type AnalysisResult,
  type CapacityStatus,
  type Levers,
  type TournamentInputs,
} from "@/engine";
import type { PlanDraft } from "@/lib/tournament/draft";
import type { ParseResult } from "@/lib/tournament/schema";
import { NumberField, SelectField } from "./fields";
import {
  STAGE_LABELS,
  analysisErrorMessages,
  categoryName,
  formatMinutes,
  formatGroupSizes,
  formatMoney,
  issueSection,
} from "./labels";
import { ProfitChart } from "./profit-chart";

const MAX_LISTED = 8;

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between gap-4 py-1 ${strong ? "font-medium" : ""}`}>
      <span className={strong ? "" : "text-muted-foreground"}>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

function ToDo({ title, description, items }: { title: string; description: string; items: string[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="flex list-disc flex-col gap-1 pl-5">
          {items.slice(0, MAX_LISTED).map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>
        {items.length > MAX_LISTED ? (
          <p className="mt-2 text-muted-foreground">and {items.length - MAX_LISTED} more</p>
        ) : null}
      </CardContent>
    </Card>
  );
}

const STATUS: Record<CapacityStatus, { label: string; text: string; className: string }> = {
  fits: {
    label: "Fits",
    text: "Fits in the time and courts available, even if every match runs long.",
    className: "bg-success/15 text-success",
  },
  fitsTypicalOnly: {
    label: "Tight",
    text: "Fits on a typical day, but not if matches run long.",
    className: "bg-warning/15 text-warning",
  },
  doesNotFit: {
    label: "Doesn't fit",
    text: "Needs more court time than is available.",
    className: "bg-destructive/15 text-destructive",
  },
};

function LeverList({ levers, when }: { levers: Levers; when: string }) {
  const options = [
    levers.extraMinutes !== null && `finish ${formatMinutes(levers.extraMinutes)} later`,
    levers.extraCourts !== null &&
      `add ${levers.extraCourts} ${levers.extraCourts === 1 ? "court" : "courts"}`,
    levers.fewerMatches !== null &&
      `play ${levers.fewerMatches} fewer ${levers.fewerMatches === 1 ? "match" : "matches"} (fewer qualifiers, smaller groups or fewer entries)`,
    "shorten matches (fewer points, best of 1, or less organising time)",
  ].filter(Boolean) as string[];
  return (
    <div className="rounded-lg bg-muted px-3 py-2">
      <p className="font-medium">
        Short by {formatMinutes(levers.courtMinutes)} of court time {when}. Any one of these would close the gap:
      </p>
      <ul className="mt-1 list-disc pl-5">
        {options.map((option) => (
          <li key={option}>{option}</li>
        ))}
      </ul>
    </div>
  );
}

function CapacityCard({ analysis }: { analysis: Analysis }) {
  const { capacity } = analysis;
  const status = STATUS[capacity.status];
  const levers = capacity.levers.typical ?? capacity.levers.worst;
  const spare = capacity.spare.worst;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-2">
          Capacity
          <Badge className={status.className}>{status.label}</Badge>
        </CardTitle>
        <CardDescription>{status.text}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div>
          <Row label="Playing time" value={formatMinutes(capacity.available.minutes)} />
          <Row label="Court time available" value={formatMinutes(capacity.available.courtMinutes)} />
          <Row label="Court time needed, typical" value={formatMinutes(capacity.needed.typical)} />
          <Row label="Court time needed, worst case" value={formatMinutes(capacity.needed.worst)} />
          <Row
            strong
            label={spare >= 0 ? "Spare at worst case" : "Short at worst case"}
            value={formatMinutes(spare)}
          />
        </div>
        {levers ? (
          <LeverList levers={levers} when={capacity.levers.typical ? "at typical length" : "if matches run long"} />
        ) : null}
        <p className="text-xs text-muted-foreground">
          Based on total court time. Rest between matches and the order of play are checked when the
          schedule is built.
        </p>
      </CardContent>
    </Card>
  );
}

function MatchesCard({ draft, analysis }: { draft: PlanDraft; analysis: Analysis }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Matches</CardTitle>
        <CardDescription>
          {analysis.totalMatches} matches, about {analysis.games} games.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Category</TableHead>
              <TableHead>Groups</TableHead>
              {STAGES.map((stage) => (
                <TableHead key={stage} className="text-right">
                  {STAGE_LABELS[stage].replace(" stage", "").replace(" rounds", "").replace(" match", "")}
                </TableHead>
              ))}
              <TableHead className="text-right">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {analysis.categories.map(({ categoryId, format }) => (
              <TableRow key={categoryId}>
                <TableCell className="font-medium">{categoryName(draft, categoryId)}</TableCell>
                <TableCell>{formatGroupSizes(format.groupSizes)}</TableCell>
                {STAGES.map((stage) => (
                  <TableCell key={stage} className="text-right tabular-nums">
                    {format.matches[stage]}
                  </TableCell>
                ))}
                <TableCell className="text-right tabular-nums">{format.totalMatches}</TableCell>
              </TableRow>
            ))}
          </TableBody>
          {analysis.categories.length > 1 ? (
            <TableFooter>
              <TableRow>
                <TableCell colSpan={2}>All categories</TableCell>
                {STAGES.map((stage) => (
                  <TableCell key={stage} className="text-right tabular-nums">
                    {analysis.matches[stage]}
                  </TableCell>
                ))}
                <TableCell className="text-right tabular-nums">{analysis.totalMatches}</TableCell>
              </TableRow>
            </TableFooter>
          ) : null}
        </Table>
        <div>
          {STAGES.map((stage) => {
            const minutes = analysis.matchMinutes[stage];
            if (!minutes || analysis.matches[stage] === 0) return null;
            return (
              <Row
                key={stage}
                label={`${STAGE_LABELS[stage]} slot`}
                value={
                  minutes.typical === minutes.worst
                    ? formatMinutes(minutes.typical)
                    : `${formatMinutes(minutes.typical)} (up to ${formatMinutes(minutes.worst)})`
                }
              />
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function FinanceCard({ draft, analysis }: { draft: PlanDraft; analysis: Analysis }) {
  const { finance } = analysis;
  const loss = finance.profit < 0;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-2">
          Finance
          <Badge className={loss ? "bg-destructive/15 text-destructive" : "bg-success/15 text-success"}>
            {loss ? "Loss" : "Pays for itself"}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {finance.revenueByCategory.length > 1 ? (
          finance.revenueByCategory.map((r) => (
            <Row key={r.categoryId} label={`Entries: ${categoryName(draft, r.categoryId)}`} value={formatMoney(r.amount)} />
          ))
        ) : null}
        <Row strong label="Revenue" value={formatMoney(finance.revenue)} />
        <div className="my-2 border-t" />
        <Row label={`Shuttles (${finance.shuttles})`} value={formatMoney(finance.shuttleCost)} />
        <Row label="Prizes" value={formatMoney(finance.prizeCost)} />
        {finance.otherCosts.map((cost) => (
          <Row key={cost.id} label={cost.label} value={formatMoney(cost.amount)} />
        ))}
        <Row strong label="Total cost" value={formatMoney(finance.totalCost)} />
        <div className="my-2 border-t" />
        <Row
          strong
          label={loss ? "Cost to the organisers" : "Profit"}
          value={formatMoney(Math.abs(finance.profit))}
        />
      </CardContent>
    </Card>
  );
}

function ProfitCard({ draft, inputs }: { draft: PlanDraft; inputs: TournamentInputs }) {
  const [chosenId, setCategoryId] = useState<string | null>(null);
  const [upTo, setUpTo] = useState<number | null>(null);

  const category =
    inputs.categories.find((c) => c.id === chosenId) ?? inputs.categories[0];
  const to = Math.max(upTo ?? category!.expectedPairs * 2, 3);

  const curve = useMemo(
    () => (category ? profitCurve(inputs, category.id, { from: 2, to }) : null),
    [inputs, category, to],
  );
  if (!category || !curve) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Break-even</CardTitle>
        <CardDescription>
          {curve.breakEven !== null
            ? `${categoryName(draft, category.id)} breaks even at ${curve.breakEven} pairs (expected ${category.expectedPairs}).`
            : `${categoryName(draft, category.id)} doesn't break even at up to ${to} pairs.`}
          {inputs.categories.length > 1 ? " Other categories stay at their expected entries." : ""}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-3">
          {inputs.categories.length > 1 ? (
            <SelectField
              label="Category"
              path={["dashboard", "category"]}
              value={category.id}
              options={inputs.categories.map((c) => ({ value: c.id, label: categoryName(draft, c.id) }))}
              onChange={setCategoryId}
            />
          ) : null}
          <NumberField
            label="Show up to (pairs)"
            step="1"
            path={["dashboard", "upTo"]}
            value={upTo}
            onChange={setUpTo}
            hint={`Default: ${category.expectedPairs * 2}`}
          />
        </div>
        <ProfitChart points={curve.points} breakEven={curve.breakEven} expected={category.expectedPairs} />
        <p className="text-xs text-muted-foreground">
          Each point re-runs the format, so match count and shuttle use change with entries.
        </p>
      </CardContent>
    </Card>
  );
}

export function Dashboard({
  draft,
  parsed,
  analysis,
}: {
  draft: PlanDraft;
  parsed: ParseResult;
  analysis: AnalysisResult | null;
}) {
  if (!parsed.ok) {
    return (
      <ToDo
        title="Still to fill in"
        description={`${parsed.issues.length} ${parsed.issues.length === 1 ? "item" : "items"} before results appear.`}
        items={parsed.issues.map((issue) => `${issueSection(draft, issue)}: ${issue.message}`)}
      />
    );
  }
  if (!analysis || !analysis.ok) {
    return (
      <ToDo
        title="Check the format"
        description="These need changing before results appear."
        items={(analysis?.ok === false ? analysis.errors : []).flatMap((e) => analysisErrorMessages(draft, e))}
      />
    );
  }
  return (
    <>
      <CapacityCard analysis={analysis.analysis} />
      <MatchesCard draft={draft} analysis={analysis.analysis} />
      <FinanceCard draft={draft} analysis={analysis.analysis} />
      <ProfitCard draft={draft} inputs={parsed.inputs} />
    </>
  );
}
