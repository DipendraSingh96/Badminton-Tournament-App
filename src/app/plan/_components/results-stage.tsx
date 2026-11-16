"use client";

import { ArrowCounterClockwiseIcon, PrinterIcon, TrophyIcon } from "@phosphor-icons/react";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { FormDialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { knockoutBracket, type FinanceResult, type TournamentInputs } from "@/engine";
import { boardTables, publicEntryName } from "@/lib/tournament/audience";
import { entryName, prizeFor, type CategoryDraft, type PlanDraft } from "@/lib/tournament/draft";
import { categoryFormatOf, categoryLabel, entryForSlot, fixtureMatchIds, knockoutOutcome, knockoutRoundName, matchRef } from "@/lib/tournament/entries";
import { scoreText } from "@/lib/tournament/live";
import { dayReport, moneyReport, placings, workedFinance, type DayReport, type MoneyReport, type Placing, type ResultsGame } from "@/lib/tournament/results";
import { clock } from "@/lib/tournament/time";
import { cn } from "@/lib/utils";
import { ChangesView } from "./changes-view";
import { DOC, H2, Head, usePrint } from "./documents";
import { IconButton } from "./fields";
import { formatMinutesShort, formatMoney } from "./labels";
import type { Update } from "./plan-editor";
import { StandingsView } from "./standings-view";
import type { LocalSegment } from "./timeline";

export type ResultsView = "summary" | "groups" | "knockout" | "day" | "money" | "changes";

const PLACE = ["1st", "2nd", "3rd"] as const;

/** "20 minutes after the plan", "5 minutes before the plan", "as planned". */
function againstPlan(actual: number | null, planned: number | null): string | null {
  if (actual === null || planned === null) return null;
  const by = Math.round(actual - planned);
  if (by === 0) return "as planned";
  return `${formatMinutesShort(by)} ${by > 0 ? "after" : "before"} the plan`;
}

function namesOf(draft: PlanDraft, ids: string[], shown: (id: string) => string): string {
  return ids.map(shown).join(" and ");
}

/** A category's places, as a list: 1st, 2nd, 3rd (per group, with groups only), each with its prize where one is given. */
function Podium({ draft, category, money }: { draft: PlanDraft; category: CategoryDraft; money: boolean }) {
  const placed = placings(draft, category);
  const name = (id: string) => {
    const entry = draft.entries.find((e) => e.id === id);
    return (entry && entryName(entry)) ?? "Unnamed entry";
  };
  const groups = [...new Set(placed.map((p) => p.group))];
  // A prize is for the category's place: with several groups and no knockout there is no one 1st to give it to.
  const prizes = money && groups.length === 1;
  const row = (p: Placing) => {
    const prize = prizes ? prizeFor(draft, category.id, (p.place - 1) as 0 | 1 | 2) : undefined;
    return (
      <li key={`${p.group ?? ""}${p.place}`} className="flex items-baseline gap-3 rounded-md bg-(--field-raised) px-3 py-2">
        <span className="w-10 shrink-0 font-display text-xl leading-none font-bold tabular-nums">{PLACE[p.place - 1]}</span>
        <span className={cn("min-w-0 flex-1 truncate", p.place === 1 ? "text-base font-semibold" : "text-sm font-medium")}>{namesOf(draft, p.entryIds, name)}</span>
        {prize && !prize.off && prize.amount !== null ? <span className="shrink-0 text-sm text-muted-foreground tabular-nums">Prize {formatMoney(prize.amount)}</span> : null}
      </li>
    );
  };
  return (
    <section data-podium={category.id} className="flex flex-col gap-2 rounded-lg bg-card-system p-3">
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        <TrophyIcon weight="fill" className="size-4 text-shuttle" aria-hidden="true" />
        {categoryLabel(draft, category.id)}
      </h3>
      {placed.length === 0 ? (
        <p className="text-sm text-muted-foreground">Not decided.</p>
      ) : (
        groups.map((group) => (
          <div key={group ?? "all"} className="flex flex-col gap-1">
            {group ? <h4 className="text-xs font-semibold text-muted-foreground">Group {group}</h4> : null}
            <ol className="flex flex-col gap-1">{placed.filter((p) => p.group === group).map(row)}</ol>
          </div>
        ))
      )}
    </section>
  );
}

/** The day in one sentence: when it started and finished against the plan, and what was played. */
function dayLine(day: DayReport): string {
  const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  const start = day.start !== null ? `Started ${clock(Math.round(day.start))}${againstPlan(day.start, day.plannedStart) ? ` (${againstPlan(day.start, day.plannedStart)})` : ""}` : null;
  const finish = day.finish !== null ? `finished ${clock(Math.round(day.finish))}${againstPlan(day.finish, day.plannedFinish) ? ` (${againstPlan(day.finish, day.plannedFinish)})` : ""}` : null;
  return [
    [start, finish].filter(Boolean).join(" · "),
    [
      count(day.played, "match played", "matches played"),
      day.walkovers > 0 ? count(day.walkovers, "walkover", "walkovers") : null,
      day.retirements > 0 ? count(day.retirements, "retirement", "retirements") : null,
      day.notPlayed > 0 ? `${day.notPlayed} not played` : null,
    ]
      .filter(Boolean)
      .join(", "),
  ]
    .filter(Boolean)
    .join(" · ");
}

function SummaryView({
  draft,
  day,
  money,
  onSheet,
  onReopen,
  onView,
}: {
  draft: PlanDraft;
  day: DayReport;
  money: MoneyReport | null;
  onSheet: () => void;
  onReopen: () => void;
  onView: (view: ResultsView) => void;
}) {
  const link = "rounded-sm font-semibold underline decoration-primary decoration-2 underline-offset-2 outline-none hover:decoration-[3px] focus-visible:ring-2 focus-visible:ring-ring";
  return (
    <section aria-label="Summary" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="heading-card">Results</h2>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" title="Back to Live, to correct something. It is logged" onClick={onReopen}>
            <ArrowCounterClockwiseIcon /> Reopen Live
          </Button>
          <Button size="sm" data-results-sheet onClick={onSheet}>
            <PrinterIcon /> Print results sheet
          </Button>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 @[720px]:grid-cols-2">
        {draft.categories.map((category) => (
          <Podium key={category.id} draft={draft} category={category} money />
        ))}
      </div>
      <dl className="flex flex-col gap-2 rounded-lg bg-card-system p-3 text-sm">
        <div className="flex flex-col gap-0.5">
          <dt className="text-xs text-muted-foreground">The day</dt>
          <dd data-day-line className="tabular-nums">
            {dayLine(day)}.{" "}
            <button type="button" className={link} onClick={() => onView("day")}>
              How it ran
            </button>
          </dd>
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className="text-xs text-muted-foreground">The money</dt>
          <dd data-money-line className="tabular-nums">
            {money ? (
              <>
                <span className={cn("font-semibold", money.actual.profit < 0 ? "text-over-text" : "text-fits-text")}>
                  {money.actual.profit < 0 ? "Loss" : "Profit"} {formatMoney(Math.abs(money.actual.profit))}
                </span>
                {money.planned ? ` (planned ${money.planned.profit < 0 ? "loss" : "profit"} ${formatMoney(Math.abs(money.planned.profit))})` : ""}.{" "}
              </>
            ) : (
              "Can't be worked out: the plan's money isn't complete. "
            )}
            <button type="button" className={link} onClick={() => onView("money")}>
              Plan and actual
            </button>
          </dd>
        </div>
      </dl>
    </section>
  );
}

function DayView({ day }: { day: DayReport }) {
  const fact = (label: string, value: string, note?: string | null) => (
    <div className="flex flex-col gap-0.5 rounded-lg bg-card-system p-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-display text-2xl leading-none font-bold tabular-nums">{value}</dd>
      {note ? <dd className="text-xs text-muted-foreground tabular-nums">{note}</dd> : null}
    </div>
  );
  const over = day.finish !== null && day.plannedFinish !== null ? Math.round(day.finish - day.plannedFinish) : null;
  return (
    <section aria-label="The day" className="flex flex-col gap-4">
      <h2 className="heading-card">The day</h2>
      <dl className="grid grid-cols-2 gap-3 @[720px]:grid-cols-4">
        {fact("Started", day.start !== null ? clock(Math.round(day.start)) : "–", againstPlan(day.start, day.plannedStart))}
        {fact("Finished", day.finish !== null ? clock(Math.round(day.finish)) : "–", againstPlan(day.finish, day.plannedFinish))}
        {fact("Against the plan", over === null ? "–" : over === 0 ? "On time" : `${formatMinutesShort(over)} ${over > 0 ? "over" : "under"}`, "at the last match's end")}
        {fact(
          "Matches played",
          String(day.played),
          [day.walkovers > 0 ? `${day.walkovers} ${day.walkovers === 1 ? "walkover" : "walkovers"}` : null, day.retirements > 0 ? `${day.retirements} ended by retirement` : null, day.notPlayed > 0 ? `${day.notPlayed} not played` : null]
            .filter(Boolean)
            .join(" · ") || "no walkovers or retirements",
        )}
      </dl>

      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold">Longest overruns</h3>
        {day.overruns.length === 0 ? (
          <p className="text-sm text-muted-foreground">No match ran past its slot.</p>
        ) : (
          <ol className="flex flex-col gap-1">
            {day.overruns.map((o) => (
              <li key={o.id} data-overrun className="flex items-baseline justify-between gap-3 rounded-md bg-(--field-raised) px-3 py-2 text-sm tabular-nums">
                <span className="min-w-0 truncate">
                  <span className="font-medium">{o.label}</span> <span className="text-muted-foreground">· Court {o.courtNumber}</span>
                </span>
                <span className="shrink-0">
                  {formatMinutesShort(o.took)} in a {formatMinutesShort(o.slot)} slot: <span className="font-semibold">{formatMinutesShort(o.over)} over</span>
                </span>
              </li>
            ))}
          </ol>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold">By court</h3>
        <table className="w-full text-sm tabular-nums">
          <thead>
            <tr className="text-xs text-muted-foreground">
              <th scope="col" className="pb-1 text-left font-semibold">
                Court
              </th>
              <th scope="col" className="pb-1 text-right font-semibold">
                Matches played
              </th>
              <th scope="col" className="pb-1 text-right font-semibold">
                Time on court
              </th>
              <th scope="col" className="pb-1 text-right font-semibold">
                Time booked
              </th>
              <th scope="col" className="pb-1 text-right font-semibold">
                Used
              </th>
            </tr>
          </thead>
          <tbody>
            {day.courts.map((c) => (
              <tr key={c.courtId} data-court-day className="border-t border-border/60">
                <td className="py-2 font-medium">Court {c.number}</td>
                <td className="py-2 text-right">{c.played}</td>
                <td className="py-2 text-right">{formatMinutesShort(c.used)}</td>
                <td className="py-2 text-right">{c.booked > 0 ? formatMinutesShort(c.booked) : "–"}</td>
                <td className="py-2 text-right">{c.booked > 0 ? `${Math.round((c.used / c.booked) * 100)}%` : "–"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function MoneyView({ update, money }: { update: Update; money: MoneyReport | null }) {
  if (!money) {
    return (
      <section aria-label="Money" className="flex flex-col gap-4">
        <h2 className="heading-card">Money</h2>
        <p className="rounded-lg bg-card-system p-4 text-sm text-muted-foreground">The plan&apos;s money isn&apos;t complete, so there is nothing to set the day against. Fill in the Budget tab on the Plan stage.</p>
      </section>
    );
  }
  const signed = (n: number) => (Math.abs(n) < 0.005 ? "–" : `${n > 0 ? "+" : "−"}${formatMoney(Math.abs(n))}`);
  const set = (key: string, raw: string) =>
    update((d) => {
      const value = raw === "" ? NaN : Number(raw);
      if (Number.isFinite(value) && value >= 0) d.actuals[key] = value;
      else delete d.actuals[key];
    });
  const rows = (side: "in" | "out") =>
    money.lines
      .filter((line) => line.side === side)
      .map((line) => {
        // A cost that came in under plan is good news; money in under plan is not.
        const diff = line.planned === null ? null : line.actual - line.planned;
        const shown = line.shuttles ? line.shuttles.actual : line.actual;
        return (
          <tr key={line.key} data-money-line={line.key} data-corrected={line.corrected || undefined} className="border-t border-border/60">
            <th scope="row" className="py-2 pr-2 text-left font-medium">
              {line.label}
              {line.shuttles ? <span className="block text-xs font-normal text-muted-foreground">Shuttles used, at {formatMoney(line.shuttles.each)} each</span> : null}
            </th>
            <td className="py-2 text-right text-muted-foreground">{line.planned === null ? "–" : formatMoney(line.planned)}</td>
            <td className="py-2 pl-3">
              <span className="flex items-center justify-end gap-1">
                {line.corrected ? (
                  <IconButton
                    label={`Back to the worked-out figure for ${line.label.toLowerCase()} (${line.shuttles ? `${line.shuttles.worked} shuttles` : formatMoney(line.worked)})`}
                    onClick={() => update((d) => void delete d.actuals[line.key])}
                  >
                    <ArrowCounterClockwiseIcon />
                  </IconButton>
                ) : null}
                <Input
                  aria-label={line.shuttles ? "Shuttles used" : `${line.label}, actual (£)`}
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step={line.shuttles ? 1 : 0.01}
                  value={Number.isInteger(shown) ? String(shown) : shown.toFixed(2)}
                  onChange={(e) => set(line.key, e.target.value)}
                  // A corrected figure is marked: the accent ring says it is the organiser's own.
                  className={cn("w-28 text-right tabular-nums", line.corrected && "ring-2 ring-primary")}
                />
              </span>
              {line.shuttles ? <span className="block pt-0.5 text-right text-xs text-muted-foreground">= {formatMoney(line.actual)}</span> : null}
            </td>
            <td className="py-2 pl-3 text-right">{diff === null ? "–" : signed(diff)}</td>
          </tr>
        );
      });
  const total = (label: string, planned: number | null, actual: number, strong = false) => (
    <tr className={cn("border-t-2 border-border", strong && "text-base")}>
      <th scope="row" className="py-2 pr-2 text-left font-semibold">
        {label}
      </th>
      <td className="py-2 text-right font-semibold text-muted-foreground">{planned === null ? "–" : formatMoney(planned)}</td>
      <td className={cn("py-2 pr-3 text-right font-semibold", strong && (actual < 0 ? "text-over-text" : "text-fits-text"))}>{formatMoney(actual)}</td>
      <td className="py-2 pl-3 text-right font-semibold">{planned === null ? "–" : signed(actual - planned)}</td>
    </tr>
  );
  const corrections = money.lines.filter((l) => l.corrected).length;
  return (
    <section aria-label="Money" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="heading-card">Money</h2>
        <p className="text-sm text-muted-foreground">
          Planned is the plan on its expected numbers. Actual is worked out from the day (the real entries, the games played, the time booked); type over
          any figure with what was really paid or received.
          {corrections > 0 ? ` ${corrections} ${corrections === 1 ? "figure is" : "figures are"} your own.` : ""}
        </p>
      </div>
      <table className="w-full text-sm tabular-nums">
        <thead>
          <tr className="text-xs text-muted-foreground">
            <th scope="col" className="pb-1 text-left font-semibold">
              <span className="sr-only">Line</span>
            </th>
            <th scope="col" className="w-28 pb-1 text-right font-semibold">
              Planned
            </th>
            <th scope="col" className="w-40 pb-1 pr-3 text-right font-semibold">
              Actual
            </th>
            <th scope="col" className="w-28 pb-1 text-right font-semibold">
              Difference
            </th>
          </tr>
        </thead>
        <tbody>
          {rows("in")}
          {total("Money in", money.planned?.moneyIn ?? null, money.actual.moneyIn)}
          {rows("out")}
          {total("Total cost", money.planned?.costs ?? null, money.actual.costs)}
          {total(money.actual.profit < 0 ? "Loss" : "Profit", money.planned?.profit ?? null, money.actual.profit, true)}
        </tbody>
      </table>
    </section>
  );
}

/**
 * The results sheet for players: each category's places, its final group
 * tables and its knockout, round by round, with scores. Names as the
 * organiser chose for the audience board. No money, phone numbers or
 * check-in marks.
 */
export function ResultsSheet({ draft }: { draft: PlanDraft }) {
  const name = (id: string) => {
    const entry = draft.entries.find((e) => e.id === id);
    return entry ? publicEntryName(draft, entry) : "–";
  };
  const tables = boardTables(draft);
  return (
    <article className={DOC}>
      <Head draft={draft} title="Results" />
      {draft.categories.map((category) => {
        const placed = placings(draft, category);
        const format = categoryFormatOf(draft, category);
        const bracket = draft.format !== "groups" && format.ok ? knockoutBracket(format.format.qualifiers, format.format.groupSizes.length, category.bronze) : null;
        const own = tables.filter((t) => t.categoryId === category.id);
        const matches = bracket ? [...bracket.rounds.flatMap((r) => r.matches), ...(bracket.bronze ? [bracket.bronze] : [])] : [];
        return (
          <section key={category.id} className="flex flex-col gap-[3mm]">
            <h2 className={H2}>{categoryLabel(draft, category.id)}</h2>
            {placed.length > 0 ? (
              <ol className="flex flex-col gap-[1mm]">
                {placed.map((p) => (
                  <li key={`${p.group ?? ""}${p.place}`}>
                    <span className="inline-block w-[22mm] font-bold">
                      {p.group ? `Group ${p.group} ` : ""}
                      {PLACE[p.place - 1]}
                    </span>
                    {namesOf(draft, p.entryIds, name)}
                  </li>
                ))}
              </ol>
            ) : null}
            {own.map((table) => (
              <table key={table.letter} className="w-full border-collapse text-[9.5pt]">
                <caption className="pb-[1mm] text-left font-bold">Group {table.letter}</caption>
                <thead>
                  <tr className="border-b border-black text-left">
                    <th className="w-[8mm] py-[0.5mm]">#</th>
                    <th className="py-[0.5mm]">{draft.unit === "team" ? "Team" : "Entry"}</th>
                    <th className="w-[10mm] py-[0.5mm] text-right">P</th>
                    <th className="w-[10mm] py-[0.5mm] text-right">W</th>
                    <th className="w-[10mm] py-[0.5mm] text-right">L</th>
                    <th className="w-[14mm] py-[0.5mm] text-right">+/−</th>
                  </tr>
                </thead>
                <tbody>
                  {table.rows.map((row, i) => (
                    <tr key={i} className="border-b border-black/20">
                      <td className="py-[0.5mm]">{row.place}</td>
                      <td className="py-[0.5mm]">{row.name}</td>
                      <td className="py-[0.5mm] text-right">{row.played}</td>
                      <td className="py-[0.5mm] text-right">{row.won}</td>
                      <td className="py-[0.5mm] text-right">{row.lost}</td>
                      <td className="py-[0.5mm] text-right">{row.difference}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ))}
            {matches.length > 0 ? (
              <div className="flex flex-col gap-[1mm]">
                <h3 className="font-bold">Knockout</h3>
                <ul className="flex flex-col gap-[0.5mm] text-[9.5pt]">
                  {matches.map((m) => {
                    const ids = fixtureMatchIds(draft, matchRef(draft, `${category.id}:ko:${m.code}:r1`)!);
                    const kept = ids.map((id) => draft.results[id]?.sides).find(Boolean);
                    const home = kept?.[0] ?? entryForSlot(draft, category.id, m.home)?.id;
                    const away = kept?.[1] ?? entryForSlot(draft, category.id, m.away)?.id;
                    const outcome = knockoutOutcome(draft, category, m.code);
                    const scores = ids.map((id) => scoreText(draft.results[id]?.games, draft.results[id]?.award)).filter(Boolean);
                    const side = (id: string | undefined) => (id ? <span className={outcome?.winner === id ? "font-bold" : undefined}>{name(id)}</span> : "–");
                    return (
                      <li key={m.code} className="flex gap-[3mm]">
                        <span className="w-[32mm] shrink-0">{knockoutRoundName(m.code)}</span>
                        <span className="min-w-0 flex-1">
                          {side(home)} v {side(away)}
                        </span>
                        <span className="shrink-0 text-right tabular-nums">{scores.join("  ·  ") || "not played"}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : null}
          </section>
        );
      })}
    </article>
  );
}

const VIEWS: { value: ResultsView; label: string }[] = [
  { value: "summary", label: "Summary" },
  { value: "groups", label: "Group tables" },
  { value: "knockout", label: "Knockout" },
  { value: "day", label: "The day" },
  { value: "money", label: "Money" },
  { value: "changes", label: "Changes" },
];

/**
 * The Results stage: who won, how the day ran against the plan, and what it
 * really cost and made. Laid out like the Draw and Live stages. Nothing here
 * can change the tournament but the organiser's own money figures.
 */
export function ResultsStage({
  draft,
  update,
  segments,
  games,
  minuteOf,
  inputs,
  planned,
  view,
  onViewChange,
  onReopen,
  dock,
}: {
  draft: PlanDraft;
  /** Only the corrected money figures are changed from here. */
  update: Update;
  /** The games where they were really played, for the standings pages. */
  segments: LocalSegment[];
  /** The games as planned: each one's court and slot. */
  games: ResultsGame[];
  minuteOf: (iso: string) => number | null;
  /** The plan as the engine reads it now (with the real entries); null if its money isn't complete. */
  inputs: TournamentInputs | null;
  /** The plan's finance on its expected numbers; null if that can't be read. */
  planned: FinanceResult | null;
  view: ResultsView;
  onViewChange: (view: ResultsView) => void;
  onReopen: () => void;
  dock: (content: ReactNode) => ReactNode;
}) {
  const { print, portal } = usePrint();
  const [sheet, setSheet] = useState(false);
  const day = dayReport(draft, games, minuteOf);
  const money = inputs ? moneyReport(draft, planned, workedFinance(draft, inputs)) : null;
  const still: Update = () => {};
  return (
    <main className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="shrink-0 px-(--pane-x)">
        <nav aria-label="Results views" className="mx-auto flex w-full max-w-[960px] items-end gap-4 border-b">
          {VIEWS.filter((v) => (v.value === "groups" ? draft.format !== "knockout" : v.value === "knockout" ? draft.format !== "groups" : true)).map((v) => (
            <button
              key={v.value}
              type="button"
              aria-current={view === v.value ? "page" : undefined}
              onClick={() => onViewChange(v.value)}
              className={cn(
                "-mb-px border-b-[3px] py-3 text-sm font-semibold transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
                view === v.value ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {v.label}
            </button>
          ))}
        </nav>
      </div>
      <div className="min-h-0 min-w-0 flex-1 pt-4">
        {dock(
          <>
            {view === "summary" ? <SummaryView draft={draft} day={day} money={money} onSheet={() => setSheet(true)} onReopen={onReopen} onView={onViewChange} /> : null}
            {view === "groups" || view === "knockout" ? (
              <StandingsView part={view === "groups" ? "groups" : "knockout"} draft={draft} update={still} segments={segments} group={null} onGroup={() => {}} onCourt={() => {}} />
            ) : null}
            {view === "day" ? <DayView day={day} /> : null}
            {view === "money" ? <MoneyView update={update} money={money} /> : null}
            {view === "changes" ? <ChangesView draft={draft} update={still} readOnly /> : null}
          </>,
        )}
      </div>
      {sheet ? (
        <FormDialog
          wide
          open
          onOpenChange={(on) => (on ? undefined : setSheet(false))}
          title="Results sheet"
          description="As it prints. “Save as PDF” in the print dialog gives a file to send. No money or phone numbers are on it."
          footer={
            <>
              <Button variant="secondary" onClick={() => setSheet(false)}>
                Close
              </Button>
              <Button
                onClick={() => {
                  print(<ResultsSheet draft={draft} />);
                  setSheet(false);
                }}
              >
                <PrinterIcon /> Print
              </Button>
            </>
          }
        >
          {/* Paper: white with black text in either theme. */}
          <div data-slot="paper" className="rounded-md bg-white p-6 text-black">
            <ResultsSheet draft={draft} />
          </div>
        </FormDialog>
      ) : null}
      {portal}
    </main>
  );
}
