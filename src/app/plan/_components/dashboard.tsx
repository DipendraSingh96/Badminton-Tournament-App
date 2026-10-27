"use client";

import { CaretRightIcon, EyeIcon, EyeSlashIcon } from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  fixturesPerEntry,
  profitCurve,
  suggestLevers,
  type Analysis,
  type AnalysisResult,
  type CapacityStatus,
  type FormatType,
  type LeverChange,
  type Levers,
  type TournamentInputs,
} from "@/engine";
import type { PlanDraft } from "@/lib/tournament/draft";
import type { ParseResult } from "@/lib/tournament/schema";
import { InfoTip, NumberField, SelectField } from "./fields";
import {
  STAGE_LABELS,
  categoryName,
  entryNoun,
  formatMinutes,
  formatMinutesShort,
  formatGroupSizes,
  formatMoney,
  groupRange,
  FIT_STATUS,
} from "./labels";
import { ProfitChart } from "./profit-chart";
import {
  categoryMatchesWorking,
  categoryRevenueWorking,
  courtHireWorking,
  courtTimeWorking,
  formatNumber,
  incomeWorking,
  leverLabel,
  leverWorking,
  neededWorking,
  otherCostWorking,
  playingTimeWorking,
  prizeWorking,
  profitWorking,
  revenueWorking,
  shuttleWorking,
  slotWorking,
  spareWorking,
  totalCostWorking,
} from "./workings";

/** A figure. With a working, it opens to show how it was calculated. */
function Row({
  label,
  value,
  strong,
  working,
}: {
  label: string;
  value: string;
  strong?: boolean;
  working?: string[];
}) {
  const labelClass = strong ? "" : "text-muted-foreground";
  const rowClass = `flex justify-between gap-4 py-1 ${strong ? "font-medium" : ""}`;
  if (!working || working.length === 0) {
    return (
      <div className={rowClass}>
        <span className={labelClass}>{label}</span>
        <span className="tabular-nums">{value}</span>
      </div>
    );
  }
  return (
    <details className="group">
      <summary
        className={`${rowClass} cursor-pointer list-none rounded-md hover:bg-inset focus-visible:outline-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden`}
      >
        <span className={`flex items-center gap-1 ${labelClass}`}>
          <CaretRightIcon
            aria-hidden="true"
            className="size-3.5 shrink-0 transition-transform group-open:rotate-90 group-open:text-foreground"
          />
          <span className="underline decoration-dotted underline-offset-4">{label}</span>
        </span>
        <span className="tabular-nums">{value}</span>
      </summary>
      <ul className="mt-1 mb-2 ml-5 flex flex-col gap-1 rounded-md bg-inset px-3 py-2 text-[13px] font-normal tabular-nums">
        {working.map((line, i) => (
          <li key={i}>{line}</li>
        ))}
      </ul>
    </details>
  );
}

/** Headline figures for a card: stat tiles, label above, numeral below. */
function Stats({ items }: { items: { label: string; value: string }[] }) {
  return (
    <dl className="grid grid-cols-3 gap-2">
      {items.map((item) => (
        <div key={item.label} className="flex min-w-0 flex-col gap-2 rounded-lg bg-inset px-3 py-2">
          <dt className="text-[13px] leading-tight font-semibold text-muted-foreground">{item.label}</dt>
          <dd className="numeral-l whitespace-nowrap">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** "Select a figure…", behind an ⓘ on a card title. */
function FigureTip() {
  return <InfoTip about="the figures">Select a figure to see how it was worked out.</InfoTip>;
}

/** What each fit status means, in a sentence; its chip comes from FIT_STATUS. */
const STATUS_TEXT: Record<CapacityStatus, string> = {
  fits: "Fits in the time and courts available, even if every match runs long.",
  fitsTypicalOnly: "Fits on a typical day, but not if matches run long.",
  doesNotFit: "Needs more court time than is available.",
};

function LeverList({ levers, when, basis }: { levers: Levers; when: string; basis: string }) {
  const options = [
    levers.extraMinutes !== null && `finish ${formatMinutes(levers.extraMinutes)} later`,
    levers.extraCourts !== null &&
      `add ${levers.extraCourts} ${levers.extraCourts === 1 ? "court" : "courts"}`,
    levers.fewerMatches !== null &&
      `play ${levers.fewerMatches} fewer ${levers.fewerMatches === 1 ? "match" : "matches"} (fewer qualifiers, smaller groups or fewer entries)`,
    "shorten matches (fewer points, best of 1, or less organising time)",
  ].filter(Boolean) as string[];
  return (
    <div className="rounded-lg border border-tight bg-card px-4 py-3">
      <p className="font-semibold">
        Short by {formatMinutes(levers.courtMinutes)} of court time {when}. Any one of these would close the gap:
      </p>
      <ul className="mt-1 list-disc pl-4">
        {options.map((option) => (
          <li key={option}>{option}</li>
        ))}
      </ul>
      <p className="mt-1 text-xs text-muted-foreground">{basis}</p>
    </div>
  );
}

function CapacityCard({ analysis, inputs }: { analysis: Analysis; inputs: TournamentInputs }) {
  const { capacity } = analysis;
  const status = FIT_STATUS[capacity.status];
  const length = capacity.levers.typical ? "typical" : "worst";
  const levers = capacity.levers[length];
  const spare = capacity.spare.worst;
  const averageCourts = capacity.available.minutes > 0
    ? capacity.available.courtMinutes / capacity.available.minutes
    : 0;
  const averageSlot = analysis.totalMatches > 0 ? capacity.needed[length] / analysis.totalMatches : 0;
  const leverBasis =
    `Worked out from an average of ${formatNumber(averageCourts)} courts across the playing time ` +
    `and an average slot of ${formatMinutes(averageSlot)}.`;
  return (
    <Card size="flat">
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            Capacity
            <FigureTip />
          </span>
          <Badge variant={status.variant}>{status.label}</Badge>
        </CardTitle>
        <CardDescription>{STATUS_TEXT[capacity.status]}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Stats
          items={[
            { label: "Court time available", value: formatMinutesShort(capacity.available.courtMinutes) },
            { label: "Needed, worst case", value: formatMinutesShort(capacity.needed.worst) },
            { label: spare >= 0 ? "Spare" : "Short", value: formatMinutesShort(spare) },
          ]}
        />
        <div>
          <Row
            label="Playing time"
            value={formatMinutes(capacity.available.minutes)}
            working={playingTimeWorking(analysis, inputs)}
          />
          <Row
            label="Court time available"
            value={formatMinutes(capacity.available.courtMinutes)}
            working={courtTimeWorking(analysis, inputs)}
          />
          <Row
            label="Court time needed, typical"
            value={formatMinutes(capacity.needed.typical)}
            working={neededWorking(analysis, "typical")}
          />
          <Row
            label="Court time needed, worst case"
            value={formatMinutes(capacity.needed.worst)}
            working={neededWorking(analysis, "worst")}
          />
          <Row
            strong
            label={spare >= 0 ? "Spare at worst case" : "Short at worst case"}
            value={formatMinutes(spare)}
            working={spareWorking(analysis)}
          />
        </div>
        {levers ? (
          <LeverList
            levers={levers}
            when={length === "typical" ? "at typical length" : "if matches run long"}
            basis={leverBasis}
          />
        ) : null}
        <p className="text-xs text-muted-foreground">
          Based on total court time. Rest between matches and the order of play are checked when the
          schedule is built.
        </p>
      </CardContent>
    </Card>
  );
}

function MatchesCard({
  draft,
  analysis,
  format,
}: {
  draft: PlanDraft;
  analysis: Analysis;
  format: FormatType;
}) {
  return (
    <Card size="flat">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Matches
          <FigureTip />
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Stats
          items={[
            { label: "Matches", value: formatNumber(analysis.totalMatches) },
            { label: "Games, typical", value: formatNumber(analysis.games) },
            { label: "Group stage", value: formatNumber(analysis.matches.group) },
          ]}
        />
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
            {analysis.categories.map(({ categoryId, format, matches, totalMatches }) => (
              <TableRow key={categoryId}>
                <TableCell className="font-medium">{categoryName(draft, categoryId)}</TableCell>
                <TableCell>{format.groupSizes.length > 0 ? formatGroupSizes(format.groupSizes) : "None"}</TableCell>
                {STAGES.map((stage) => (
                  <TableCell key={stage} className="text-right tabular-nums">
                    {matches[stage]}
                  </TableCell>
                ))}
                <TableCell className="text-right tabular-nums">{totalMatches}</TableCell>
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
          {analysis.categories.map((category) => (
            <Row
              key={category.categoryId}
              label={`How ${categoryName(draft, category.categoryId)} is counted`}
              value={`${category.totalMatches} matches`}
              working={categoryMatchesWorking(category, format)}
            />
          ))}
        </div>
        <div>
          {analysis.slots.map(({ stage, minutes }) => {
            return (
              <Row
                key={stage}
                label={`${STAGE_LABELS[stage]} slot`}
                value={
                  minutes.typical === minutes.worst
                    ? formatMinutes(minutes.typical)
                    : `${formatMinutes(minutes.typical)} (up to ${formatMinutes(minutes.worst)})`
                }
                working={[
                  ...slotWorking(minutes, "typical").map((line) => `Typical: ${line}`),
                  ...slotWorking(minutes, "worst").map((line, i) => (i === 0 ? `Worst case: ${line}` : line)),
                ]}
              />
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

/** "3", or "3, or 2 in groups of 3" when group sizes differ. */
function perEntryText(groupSizes: number[]): string {
  const counts = [...new Set(groupSizes)].sort((a, b) => b - a);
  const [largest, ...rest] = counts;
  if (largest === undefined) return "None";
  return [
    String(fixturesPerEntry(largest)),
    ...rest.map((size) => `or ${fixturesPerEntry(size)} in groups of ${size}`),
  ].join(", ");
}

/** Group sizes, matches per entry and waves in each category's group stage. */
function GroupStageCard({ draft, analysis }: { draft: PlanDraft; analysis: Analysis }) {
  const withGroups = analysis.categories.filter((c) => c.format.groupSizes.length > 0);
  if (withGroups.length === 0) return null;
  return (
    <Card size="flat">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Group stage
          <FigureTip />
        </CardTitle>
        <CardDescription>
          A wave is one round of every group: each entry plays at most once in it. Categories play their waves side by
          side, so the group stage takes as many waves as its longest category.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Stats
          items={[
            { label: "Waves", value: formatNumber(analysis.waves) },
            { label: "Group matches", value: formatNumber(analysis.matches.group) },
            {
              label: "Most in one wave",
              value: formatNumber(
                analysis.categories.reduce((sum, c) => sum + c.waves.mostFixtures * c.rubbersPerFixture, 0),
              ),
            },
          ]}
        />
        <div>
          {withGroups.map((category) => {
            const { groupSizes } = category.format;
            const { waves, fixturesPerWave, mostFixtures } = category.waves;
            const rubbers = category.rubbersPerFixture;
            const unit = rubbers > 1 ? "ties" : "matches";
            return (
              <Row
                key={category.categoryId}
                label={categoryName(draft, category.categoryId)}
                value={`${waves} ${waves === 1 ? "wave" : "waves"}`}
                working={[
                  `Groups: ${formatGroupSizes(groupSizes)}`,
                  `Group matches: ${category.matches.group}`,
                  `${rubbers > 1 ? "Ties" : "Matches"} per entry: ${perEntryText(groupSizes)}`,
                  `Waves: ${waves}, from the largest group (a group of n plays n − 1 rounds when n is even, n when odd)`,
                  `${unit[0]!.toUpperCase()}${unit.slice(1)} per wave: ${fixturesPerWave.join(", ")}`,
                  rubbers > 1
                    ? `Most in one wave: ${mostFixtures} ties × ${rubbers} rubbers = ${mostFixtures * rubbers} matches`
                    : `Most in one wave: ${mostFixtures} matches`,
                ]}
              />
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

/** Suggested groups per hall, in proportion to each hall's court time. */
function GroupsPerHallCard({
  draft,
  analysis,
  inputs,
}: {
  draft: PlanDraft;
  analysis: Analysis;
  inputs: TournamentInputs;
}) {
  if (analysis.groupsPerHall.length === 0) return null;
  const hallNames = new Map(inputs.frame.halls.map((h) => [h.id, h.name]));
  return (
    <Card size="flat">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Suggested groups per hall
          <FigureTip />
        </CardTitle>
        <CardDescription>
          Each group stays in one hall. Groups are shared in proportion to each hall&apos;s court time, largest
          first. A suggestion only.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-1">
        {analysis.groupsPerHall.map((hall) => {
          const byCategory = new Map<string, number[]>();
          for (const g of hall.groups) {
            byCategory.set(g.categoryId, [...(byCategory.get(g.categoryId) ?? []), g.groupIndex]);
          }
          const groups =
            [...byCategory]
              .map(([categoryId, indexes]) => `${categoryName(draft, categoryId)} ${indexes.length === 1 ? "group" : "groups"} ${groupRange(indexes)}`)
              .join("; ") || "No groups";
          return (
            <Row
              key={hall.hallId}
              label={`${hallNames.get(hall.hallId)} (${Math.round(hall.share * 100)}% of courts)`}
              value={formatMinutes(hall.load)}
              working={[
                groups,
                `Court time for these groups: ${formatMinutes(hall.load)}`,
                `Its share of the group stage: ${Math.round(hall.share * 100)}% = ${formatMinutes(hall.target)}`,
              ]}
            />
          );
        })}
      </CardContent>
    </Card>
  );
}

function FinanceCard({
  draft,
  analysis,
  inputs,
}: {
  draft: PlanDraft;
  analysis: Analysis;
  inputs: TournamentInputs;
}) {
  const { finance } = analysis;
  const loss = finance.profit < 0;
  return (
    <Card size="flat">
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            Finance
            <FigureTip />
          </span>
          <Badge variant={loss ? "over" : "fits"}>
            {loss ? "Loss" : "Pays for itself"}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col">
        <div className="mb-4">
          <Stats
            items={[
              { label: "Revenue", value: formatMoney(finance.revenue) },
              { label: "Total cost", value: formatMoney(finance.totalCost) },
              { label: loss ? "Cost to organisers" : "Profit", value: formatMoney(Math.abs(finance.profit)) },
            ]}
          />
        </div>
        {finance.revenueByCategory.map((r) => (
          <Row
            key={r.categoryId}
            label={`Entries: ${categoryName(draft, r.categoryId)}`}
            value={formatMoney(r.amount)}
            working={(() => {
              const category = inputs.categories.find((c) => c.id === r.categoryId);
              const event = category?.entry.type === "individual" ? category.entry.event : null;
              return categoryRevenueWorking(r, entryNoun(inputs.unit, event), entryNoun(inputs.unit, event, true));
            })()}
          />
        ))}
        {finance.otherIncome.map((income) => (
          <Row key={income.id} label={income.label} value={formatMoney(income.amount)} working={incomeWorking(income)} />
        ))}
        <Row
          strong
          label="Revenue"
          value={formatMoney(finance.revenue)}
          working={
            finance.revenueByCategory.length + finance.otherIncome.length > 1 ? revenueWorking(analysis, draft) : undefined
          }
        />
        <div className="my-2 border-t" />
        <Row
          label="Court hire"
          value={formatMoney(finance.courtHire.total)}
          working={courtHireWorking(analysis, inputs)}
        />
        <Row
          label={`Shuttles (${formatNumber(finance.shuttles)})`}
          value={formatMoney(finance.shuttleCost)}
          working={shuttleWorking(analysis)}
        />
        <Row label="Prizes" value={formatMoney(finance.prizeCost)} working={prizeWorking(inputs, draft)} />
        {finance.otherCosts.map((cost) => (
          <Row
            key={cost.id}
            label={cost.label}
            value={formatMoney(cost.amount)}
            working={otherCostWorking(cost)}
          />
        ))}
        <Row strong label="Total cost" value={formatMoney(finance.totalCost)} working={totalCostWorking(analysis)} />
        <div className="my-2 border-t" />
        <Row
          strong
          label={loss ? "Cost to the organisers" : "Profit"}
          value={formatMoney(Math.abs(finance.profit))}
          working={profitWorking(analysis)}
        />
      </CardContent>
    </Card>
  );
}

function ProfitCard({
  draft,
  inputs,
  breakEvenId,
  onChooseBreakEven,
}: {
  draft: PlanDraft;
  inputs: TournamentInputs;
  breakEvenId: string | null;
  onChooseBreakEven: (id: string) => void;
}) {
  const [upTo, setUpTo] = useState<number | null>(null);

  const category =
    inputs.categories.find((c) => c.id === breakEvenId) ?? inputs.categories[0];
  const to = Math.max(upTo ?? category!.expectedEntries * 2, 3);

  const curve = useMemo(
    () => (category ? profitCurve(inputs, category.id, { from: 2, to }) : null),
    [inputs, category, to],
  );
  if (!category || !curve) return null;
  const nouns = entryNoun(
    inputs.unit,
    category.entry.type === "individual" ? category.entry.event : null,
    true,
  );

  return (
    <Card size="flat">
      <CardHeader>
        <CardTitle>Break-even</CardTitle>
        <CardDescription>
          {curve.breakEven !== null
            ? `${categoryName(draft, category.id)} breaks even at ${curve.breakEven} ${nouns} (expected ${category.expectedEntries}).`
            : `${categoryName(draft, category.id)} doesn't break even at up to ${to} ${nouns}.`}
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
              onChange={onChooseBreakEven}
            />
          ) : null}
          <NumberField
            label={`Show up to (${nouns})`}
            step="1"
            path={["dashboard", "upTo"]}
            value={upTo}
            onChange={setUpTo}
            hint={`Default: ${category.expectedEntries * 2}`}
          />
        </div>
        <ProfitChart
          points={curve.points}
          breakEven={curve.breakEven}
          expected={category.expectedEntries}
          axisLabel={`${nouns.charAt(0).toUpperCase()}${nouns.slice(1)} entered`}
        />
        <p className="text-xs text-muted-foreground">
          Each point re-runs the format, so match count and shuttle use change with entries.
        </p>
      </CardContent>
    </Card>
  );
}

/** Two lever changes are the same suggestion. */
function sameChange(a: LeverChange | null, b: LeverChange): boolean {
  return a !== null && JSON.stringify(a) === JSON.stringify(b);
}

/** What-if suggestions: each re-runs the plan with one change. Never applied unless kept. */
function LeversCard({
  draft,
  analysis,
  inputs,
  preview,
  onPreview,
}: {
  draft: PlanDraft;
  analysis: Analysis;
  inputs: TournamentInputs;
  /** The lever being previewed, if any. */
  preview: LeverChange | null;
  onPreview: (change: LeverChange | null) => void;
}) {
  const levers = useMemo(() => suggestLevers(inputs, analysis), [inputs, analysis]);
  const showFit = analysis.capacity.status !== "fits";
  const toFit = showFit ? levers.filter((l) => l.improvesFit) : [];
  // A lever that helps both is listed once, under fit.
  const toProfit = levers
    .filter((l) => l.improvesProfit && !toFit.includes(l))
    .sort((a, b) => b.delta.profit - a.delta.profit);
  const list = (items: typeof levers, measure: "fit" | "profit") =>
    items.map((lever, i) => (
      <div key={i} className="flex flex-col gap-1 rounded-lg border border-tight bg-card px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[15px] font-semibold">{leverLabel(lever.change, inputs, draft)}</span>
          <Badge variant={FIT_STATUS[lever.outcome.status].variant}>{FIT_STATUS[lever.outcome.status].label}</Badge>
        </div>
        <Row
          label={`Needs ${formatMinutesShort(lever.outcome.needed.typical)} · ${lever.outcome.profit < 0 ? "loss" : "profit"} ${formatMoney(Math.abs(lever.outcome.profit))}`}
          value={
            measure === "fit"
              ? `+${formatMinutesShort(lever.fitGain)} spare`
              : `${lever.delta.profit >= 0 ? "+" : "−"}${formatMoney(Math.abs(lever.delta.profit))}`
          }
          working={leverWorking(lever, analysis)}
        />
        <div className="flex justify-end">
          {sameChange(preview, lever.change) ? (
            <Button size="sm" variant="secondary" aria-pressed onClick={() => onPreview(null)}>
              <EyeSlashIcon /> Stop preview
            </Button>
          ) : (
            <Button size="sm" variant="outline" onClick={() => onPreview(lever.change)}>
              <EyeIcon /> Preview
            </Button>
          )}
        </div>
      </div>
    ));
  return (
    <Card size="flat">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Suggested levers
          <FigureTip />
        </CardTitle>
        <CardDescription>
          Each re-runs the plan with one change. Preview one to see it on the summary, timeline and venue,
          then keep or discard it. Nothing changes until you keep it.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {toFit.length + toProfit.length === 0 ? (
          <p className="text-sm text-muted-foreground">No single change improves fit or profit.</p>
        ) : null}
        {toFit.length > 0 ? (
          <div className="flex flex-col gap-3">
            <h3 className="text-[15px] font-semibold text-muted-foreground">To fit</h3>
            {list(toFit, "fit")}
          </div>
        ) : null}
        {toProfit.length > 0 ? (
          <div className="flex flex-col gap-3">
            <h3 className="text-[15px] font-semibold text-muted-foreground">To improve profit</h3>
            {list(toProfit, "profit")}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

/** Derived results shown inside a workbench tab, once the plan is complete. */
export function DerivedCards({
  tab,
  draft,
  parsed,
  analysis,
  breakEvenId,
  onChooseBreakEven,
  preview,
  onPreview,
}: {
  tab: "schedule" | "finance";
  draft: PlanDraft;
  parsed: ParseResult;
  analysis: AnalysisResult | null;
  breakEvenId: string | null;
  onChooseBreakEven: (id: string) => void;
  preview: LeverChange | null;
  onPreview: (change: LeverChange | null) => void;
}) {
  if (!parsed.ok || !analysis?.ok) return null;
  if (tab === "schedule") {
    return (
      <>
        <CapacityCard analysis={analysis.analysis} inputs={parsed.inputs} />
        <GroupStageCard draft={draft} analysis={analysis.analysis} />
        <GroupsPerHallCard draft={draft} analysis={analysis.analysis} inputs={parsed.inputs} />
        <MatchesCard draft={draft} analysis={analysis.analysis} format={parsed.inputs.format} />
      </>
    );
  }
  return (
    <>
      <FinanceCard draft={draft} analysis={analysis.analysis} inputs={parsed.inputs} />
      <ProfitCard
        draft={draft}
        inputs={parsed.inputs}
        breakEvenId={breakEvenId}
        onChooseBreakEven={onChooseBreakEven}
      />
      <LeversCard
        draft={draft}
        analysis={analysis.analysis}
        inputs={parsed.inputs}
        preview={preview}
        onPreview={onPreview}
      />
    </>
  );
}
