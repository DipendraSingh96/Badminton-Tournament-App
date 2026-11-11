"use client";

import { TrophyIcon, WarningIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { countFixture, knockoutBracket, type KnockoutMatch, type TiebreakCriterion } from "@/engine";
import { entryName, type CategoryDraft, type PlanDraft } from "@/lib/tournament/draft";
import {
  categoryFormatOf,
  entryForSlot,
  groupStatus,
  groupTables,
  knockoutOutcome,
  sidesChanged,
  type GroupStatus,
  type GroupTable,
} from "@/lib/tournament/entries";
import { TIEBREAK_LABELS } from "@/lib/tournament/events";
import { gameState } from "@/lib/tournament/live";
import { clock } from "@/lib/tournament/time";
import { cn } from "@/lib/utils";
import { CategoryTabs } from "./category-tabs";
import { awardMark } from "./court-board";
import { courtOf } from "./draw-panel";
import { DecideDialog } from "./live-dialogs";
import type { Update } from "./plan-editor";
import { categoryName } from "./labels";
import type { LocalSegment } from "./timeline";

/** The tiebreaks that are a number in the table (wins have their own column; head-to-head and lots aren't one number). */
const NUMERIC: TiebreakCriterion[] = ["gameDifference", "pointDifference", "pointsWon", "rubbersWon"];
const SHORT: Partial<Record<TiebreakCriterion, string>> = { gameDifference: "GD", pointDifference: "PD", pointsWon: "Pts", rubbersWon: "RW" };

/** A difference with its sign: "+12", "−3", "0". */
function signed(n: number): string {
  return n > 0 ? `+${n}` : n < 0 ? `−${-n}` : "0";
}

const STATUS: Record<GroupStatus, { label: string; variant: "off" | "fits" | "tight" | "outline" } | null> = {
  contention: { label: "In contention", variant: "off" },
  through: { label: "Through", variant: "fits" },
  out: { label: "Out", variant: "outline" },
  level: { label: "Level", variant: "tight" },
  winner: { label: "Winner", variant: "fits" },
  placed: null,
  withdrawn: { label: "Withdrawn", variant: "outline" },
};

/** A round's name from its size: Final, Semi-finals, Quarter-finals, Round of 16. */
function roundName(size: number): string {
  if (size === 2) return "Final";
  if (size === 4) return "Semi-finals";
  if (size === 8) return "Quarter-finals";
  return `Round of ${size}`;
}

/** Where a category has got to, for its tab: groups finished, or the final played. */
function progress(draft: PlanDraft, category: CategoryDraft): string {
  if (knockoutOutcome(draft, category, "Final")) return "Final played";
  const tables = groupTables(draft, category);
  if (tables.length === 0) return "";
  return `${tables.filter((t) => t.complete).length} of ${tables.length} groups finished`;
}

/**
 * The Live stage's Standings and bracket page: each group's table as the
 * scores stand, who is through, and the knockout filling in from the group
 * places and each match's winner, to the champion.
 */
export function StandingsView({
  draft,
  update,
  segments,
  onCourt,
}: {
  draft: PlanDraft;
  update: Update;
  segments: LocalSegment[];
  /** Opens a court on the Court board. */
  onCourt: (courtId: string) => void;
}) {
  const [categoryId, setCategoryId] = useState<string | null>(draft.categories[0]?.id ?? null);
  const category = draft.categories.find((c) => c.id === categoryId) ?? draft.categories[0];
  if (!category) return <p className="text-sm text-muted-foreground">This tournament has no categories.</p>;
  return (
    <div className="flex flex-col gap-4">
      <CategoryTabs draft={draft} value={category.id} onChange={setCategoryId} count={(id) => progress(draft, draft.categories.find((c) => c.id === id)!)} />
      <CategoryStandings key={category.id} draft={draft} update={update} category={category} segments={segments} onCourt={onCourt} />
    </div>
  );
}

function CategoryStandings({
  draft,
  update,
  category,
  segments,
  onCourt,
}: {
  draft: PlanDraft;
  update: Update;
  category: CategoryDraft;
  segments: LocalSegment[];
  onCourt: (courtId: string) => void;
}) {
  // "If it ended now": the knockout shows who would go through as the tables stand.
  const [endedNow, setEndedNow] = useState(false);
  const tables = groupTables(draft, category);
  const format = categoryFormatOf(draft, category);
  const tiebreaks = draft.rules.tiebreaks;
  const qualify = tables[0]?.qualify ?? 0;
  const allDone = tables.every((t) => t.complete);
  const provisional = endedNow && !allDone;
  const name = categoryName(draft, category.id);

  if (!format.ok) return <p className="rounded-lg bg-card-system p-4 text-sm text-muted-foreground">{format.message}</p>;
  const bracket =
    draft.format === "groups" ? null : knockoutBracket(format.format.qualifiers, format.format.groupSizes.length, category.bronze);

  return (
    <section aria-label={`${name} standings`} className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="heading-card">{name}</h2>
          <p className="text-sm text-muted-foreground">
            {draft.format === "knockout"
              ? "Knockout only, by seed"
              : [
                  qualify > 0 ? `Top ${qualify} of each group go through` : "Groups only: each group's table decides it",
                  `ranked by ${tiebreaks.length > 0 ? tiebreaks.map((t) => TIEBREAK_LABELS[t].replace(/ \(.*\)/, "").toLowerCase()).join(", then ") : "no tiebreaks set"}`,
                ].join(" · ")}
          </p>
        </div>
        {bracket && tables.length > 0 ? (
          <label
            className="flex items-center gap-2 text-sm text-muted-foreground"
            title={allDone ? "Every group has finished: the knockout shows who went through." : "Fills the knockout with who would go through as the tables stand now."}
          >
            <Switch disabled={allDone} checked={provisional} onCheckedChange={setEndedNow} />
            If it ended now
          </label>
        ) : null}
      </div>

      {tables.length > 0 ? (
        <div className="grid grid-cols-2 gap-4">
          {tables.map((table) => (
            <GroupCard key={table.index} draft={draft} update={update} categoryId={category.id} table={table} tiebreaks={tiebreaks} />
          ))}
        </div>
      ) : null}

      {bracket ? (
        <BracketCard draft={draft} category={category} segments={segments} bracket={bracket} provisional={provisional} onCourt={onCourt} />
      ) : null}
    </section>
  );
}

function GroupCard({
  draft,
  update,
  categoryId,
  table,
  tiebreaks,
}: {
  draft: PlanDraft;
  update: Update;
  categoryId: string;
  table: GroupTable;
  tiebreaks: TiebreakCriterion[];
}) {
  const [deciding, setDeciding] = useState(false);
  // Entries still sharing a place once the group has finished: their order can be decided by hand.
  const shared = table.complete ? table.rows.filter((r) => r.shared && !table.withdrawn.includes(r.id)).map((r) => r.id) : [];
  const decided = Boolean(draft.decided[`${categoryId}:${table.index}`]);
  const byId = new Map(draft.entries.map((e) => [e.id, e]));
  const columns = NUMERIC.filter((t) => tiebreaks.includes(t));
  const team = draft.unit === "team";
  const statuses = table.rows.map((row) => groupStatus(table, row));
  const level = statuses.includes("level");
  return (
    <div className="flex flex-col gap-2 rounded-lg bg-card-system p-3">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold">Group {table.letter}</h3>
        <p className="text-xs text-muted-foreground tabular-nums">
          {table.complete ? "Finished" : `${table.played} of ${table.total} ${team ? "ties" : "games"} played`}
        </p>
      </div>
      <table className="w-full text-sm tabular-nums">
        <caption className="sr-only">
          Group {table.letter} standings{table.qualify > 0 ? `; the top ${table.qualify} go through` : ""}
        </caption>
        <thead>
          <tr className="text-xs text-muted-foreground">
            <th scope="col" className="w-6 pb-1 text-left font-semibold">
              #
            </th>
            <th scope="col" className="pb-1 text-left font-semibold">
              {team ? "Team" : "Entry"}
            </th>
            <th scope="col" className="w-8 pb-1 text-right font-semibold" title={team ? "Ties played" : "Played"}>
              P
            </th>
            <th scope="col" className="w-8 pb-1 text-right font-semibold" title="Won">
              W
            </th>
            <th scope="col" className="w-8 pb-1 text-right font-semibold" title="Lost">
              L
            </th>
            {columns.map((t) => (
              <th key={t} scope="col" className="w-10 pb-1 text-right font-semibold" title={TIEBREAK_LABELS[t]}>
                {SHORT[t]}
              </th>
            ))}
            <th scope="col" className="w-28 pb-1 text-right font-semibold">
              <span className="sr-only">Status</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, i) => {
            const entry = byId.get(row.id);
            const label = (entry && entryName(entry)) ?? "Unnamed entry";
            const status = STATUS[statuses[i]!];
            // The qualifying line sits under the last place that goes through.
            const cut = table.qualify > 0 && i === table.qualify - 1 && i < table.rows.length - 1;
            const value: Record<string, string> = {
              gameDifference: signed(row.gamesWon - row.gamesLost),
              pointDifference: signed(row.pointsWon - row.pointsLost),
              pointsWon: String(row.pointsWon),
              rubbersWon: String(row.rubbersWon),
            };
            return (
              <tr key={row.id} className={cn("border-t border-border/60", cut && "border-b-2 border-dashed border-b-turf")}>
                <td className="py-2 text-muted-foreground">{row.played === 0 && row.shared ? "–" : row.shared ? `${row.place}=` : row.place}</td>
                <td
                  className={cn("max-w-0 truncate py-2 font-medium", statuses[i] === "withdrawn" && "text-muted-foreground line-through")}
                  title={label}
                >
                  {label}
                </td>
                <td className="py-2 text-right">{row.played}</td>
                <td className="py-2 text-right">{row.won}</td>
                <td className="py-2 text-right">{row.lost}</td>
                {columns.map((t) => (
                  <td key={t} className="py-2 text-right">
                    {value[t]}
                  </td>
                ))}
                <td className="py-2 text-right">{status ? <Badge variant={status.variant}>{status.label}</Badge> : null}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {shared.length > 0 ? (
        <div className="flex items-center justify-between gap-3">
          <p className={cn("flex items-start gap-2 text-xs", level ? "text-over-text" : "text-muted-foreground")}>
            {level ? <WarningIcon className="mt-0.5 size-3 shrink-0" aria-hidden="true" /> : null}
            {level
              ? "Level on every tiebreak: decide by hand. The knockout places they'd take stay open until then."
              : "Entries sharing a place are level on every tiebreak. Their order can be decided by hand."}
          </p>
          <Button variant="outline" size="sm" onClick={() => setDeciding(true)}>
            Decide…
          </Button>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          {[table.qualify > 0 ? "Above the dashed line: through to the knockout." : null, decided ? "Level entries were placed by hand (see Changes)." : null]
            .filter(Boolean)
            .join(" ")}
        </p>
      )}
      {deciding ? (
        <DecideDialog draft={draft} update={update} categoryId={categoryId} table={table} level={shared} onClose={() => setDeciding(false)} />
      ) : null}
    </div>
  );
}

function BracketCard({
  draft,
  category,
  segments,
  bracket,
  provisional,
  onCourt,
}: {
  draft: PlanDraft;
  category: CategoryDraft;
  segments: LocalSegment[];
  bracket: ReturnType<typeof knockoutBracket>;
  provisional: boolean;
  onCourt: (courtId: string) => void;
}) {
  const final = bracket.rounds.at(-1);
  const earlier = bracket.rounds.slice(0, -1);
  const champion = knockoutOutcome(draft, category, "Final");
  const championEntry = champion ? draft.entries.find((e) => e.id === champion.winner) : undefined;
  const box = (match: KnockoutMatch, isFinal = false) => (
    <MatchBox draft={draft} category={category} segments={segments} match={match} final={isFinal} provisional={provisional} onCourt={onCourt} />
  );
  if (!final) return null;
  return (
    <div className="flex flex-col gap-3 border-t pt-4">
      <div className="flex flex-col gap-1">
        <h3 className="heading-card">Knockout</h3>
        {provisional ? (
          <p className="text-sm text-muted-foreground">As it stands: the names in grey are who would go through if the groups ended now.</p>
        ) : null}
      </div>
      <div className="scroll-pane overflow-x-auto pb-2">
        <div className="flex min-w-max gap-6">
          {earlier.map((round) => (
            <div key={round.size} className="flex flex-col gap-3">
              <h4 className="text-sm font-semibold">{roundName(round.size)}</h4>
              <ol className="flex flex-1 flex-col justify-around gap-3">
                {round.matches.map((m) => (
                  <li key={m.code}>{box(m)}</li>
                ))}
              </ol>
            </div>
          ))}
          <div className="flex flex-col gap-3">
            <h4 className="flex items-center gap-2 text-sm font-semibold">
              <TrophyIcon weight="fill" className="size-4 text-shuttle" aria-hidden="true" /> Final
            </h4>
            <div className="flex flex-1 flex-col justify-center gap-6">
              <div className="flex flex-col gap-2">
                {box(final.matches[0]!, true)}
                {championEntry ? (
                  <p className="flex flex-col">
                    <span className="text-xs text-muted-foreground">Champion</span>
                    <span className="text-sm font-semibold">{entryName(championEntry) ?? "Unnamed entry"}</span>
                  </p>
                ) : null}
              </div>
              {bracket.bronze ? (
                <div className="flex flex-col gap-2">
                  <h4 className="text-sm font-semibold">Bronze match</h4>
                  {box(bracket.bronze)}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function MatchBox({
  draft,
  category,
  segments,
  match,
  final,
  provisional,
  onCourt,
}: {
  draft: PlanDraft;
  category: CategoryDraft;
  segments: LocalSegment[];
  match: KnockoutMatch;
  final: boolean;
  provisional: boolean;
  onCourt: (courtId: string) => void;
}) {
  // The match on the schedule: one game, or a team tie's rubbers.
  const own = segments.filter((s) => s.match.categoryId === category.id && s.match.code === match.code).sort((a, b) => a.from - b.from);
  const first = own[0];
  const court = first ? courtOf(draft, first.courtId) : null;
  const outcome = knockoutOutcome(draft, category, match.code);
  const onCourtNow = own.some((s) => gameState(draft.results, s.id) === "onCourt");
  const changed = own.some((s) => sidesChanged(draft, category.id, s.id, match.home, match.away));
  // Who played it, as kept when it started; otherwise who the results put there.
  const kept = own.map((s) => draft.results[s.id]?.sides).find(Boolean);
  const sides = [match.home, match.away].map((slot, i) => {
    const settled = kept ? draft.entries.find((e) => e.id === kept[i]) : entryForSlot(draft, category.id, slot);
    const guess = settled || !provisional ? null : entryForSlot(draft, category.id, slot, { provisional: true });
    const entry = settled ?? guess;
    return { id: entry?.id ?? null, label: entry ? (entryName(entry) ?? "Unnamed entry") : slot, known: Boolean(settled), guessed: Boolean(guess) };
  });
  // Each side's score: every game's points, or for a team tie the rubbers won.
  const rubbers = own.map((s) => (draft.results[s.id]?.games ?? []).filter(([h, a]) => h !== null || a !== null).map(([h, a]) => [h ?? 0, a ?? 0] as [number, number]));
  const tie = own.length > 1;
  const count = countFixture(
    rubbers,
    own.map((s) => {
      const given = draft.results[s.id]?.award;
      return given ? { winner: given.winner === 0 ? ("home" as const) : ("away" as const), open: given.open } : null;
    }),
  );
  // A match given to a side: "W/O" or "Ret." beside the winner's score.
  const mark = own.map((s) => awardMark(draft.results[s.id]?.award)).find(Boolean) ?? null;
  const scores: [string[], string[]] = tie
    ? rubbers.some((r) => r.length > 0)
      ? [[String(count.rubbersWon)], [String(count.rubbersLost)]]
      : [[], []]
    : [(rubbers[0] ?? []).map(([h]) => String(h)), (rubbers[0] ?? []).map(([, a]) => String(a))];

  return (
    <div className={cn("flex w-64 flex-col rounded-lg border bg-card text-sm", final ? "border-shuttle ring-1 ring-shuttle" : "border-border")}>
      <div className="flex items-center justify-between gap-2 border-b px-3 py-1 text-xs font-semibold text-muted-foreground tabular-nums">
        <span>{match.code === "Final" ? "Final" : match.code === "Bronze" ? "Bronze match" : match.code}</span>
        {first ? (
          <button
            type="button"
            onClick={() => onCourt(first.courtId)}
            title="Open this court on the Court board"
            className="truncate rounded-sm underline-offset-2 outline-none hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring"
          >
            {onCourtNow ? "On court" : clock(first.from)} · Court {court ?? "?"}
          </button>
        ) : (
          <span className="truncate">Not scheduled</span>
        )}
      </div>
      {sides.map((side, i) => {
        const won = outcome !== null && side.id === outcome.winner;
        return (
          <div key={i} className={cn("flex items-center gap-2 px-3 py-2", i === 0 && "border-b border-border/60")}>
            <span
              className={cn("min-w-0 flex-1 truncate", won && "font-bold", !side.known && "text-muted-foreground", side.guessed && "italic")}
              title={side.guessed ? `${side.label} (as it stands)` : side.label}
            >
              {side.label}
            </span>
            {scores[i]!.map((n, g) => (
              <span key={g} className={cn("w-5 shrink-0 text-right tabular-nums", won ? "font-bold" : "text-muted-foreground")}>
                {n}
              </span>
            ))}
            {mark && won ? <span className="shrink-0 text-xs font-semibold">{mark}</span> : null}
            {side.id && draft.withdrawn[side.id] ? <span className="shrink-0 text-xs text-muted-foreground">Withdrawn</span> : null}
          </div>
        );
      })}
      {changed ? (
        <p className="flex items-start gap-2 border-t px-3 py-2 text-xs text-over-text">
          <WarningIcon className="mt-0.5 size-3 shrink-0" aria-hidden="true" />
          The sides have changed since this was played.
        </p>
      ) : null}
    </div>
  );
}
