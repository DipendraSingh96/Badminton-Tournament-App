"use client";

import { TrophyIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { knockoutBracket, type KnockoutMatch } from "@/engine";
import { courtNumber, type CategoryDraft, type PlanDraft } from "@/lib/tournament/draft";
import { categoryFormatOf, entryForSlot, sideName } from "@/lib/tournament/entries";
import { clock } from "@/lib/tournament/time";
import { cn } from "@/lib/utils";
import { BRACKET_COLUMN, BracketFrame, BracketZoomButtons, feedsOf, useBracketCompact, useBracketZoom, type BracketZoom } from "./bracket-frame";
import { CategoryTabs } from "./category-tabs";
import { TeamName } from "./draw-panel";
import { categoryName } from "./labels";
import type { LocalSegment } from "./timeline";

/** A round's name from its size: Final, Semi-finals, Quarter-finals, Round of 16. */
function roundName(size: number): string {
  if (size === 2) return "Final";
  if (size === 4) return "Semi-finals";
  if (size === 8) return "Quarter-finals";
  return `Round of ${size}`;
}

/** When and where a knockout match is on the schedule: its first rubber's time, and its courts. */
function whenOf(draft: PlanDraft, segments: LocalSegment[], categoryId: string, code: string): string | null {
  const own = segments.filter((s) => s.match.categoryId === categoryId && s.match.code === code).sort((a, b) => a.from - b.from);
  if (own.length === 0) return null;
  const courts = [
    ...new Set(
      own.map((s) => {
        for (const [h, hall] of draft.frame.halls.entries()) {
          const c = hall.courts.findIndex((x) => x.id === s.courtId);
          if (c !== -1) return courtNumber(draft.frame.halls, h, c);
        }
        return null;
      }),
    ),
  ]
    .filter((n): n is number => n !== null)
    .sort((a, b) => a - b);
  return `${clock(own[0]!.from)} · ${courts.length === 1 ? "Court" : "Courts"} ${courts.join(", ")}`;
}

function MatchBox({
  draft,
  segments,
  category,
  match,
  final,
}: {
  draft: PlanDraft;
  segments: LocalSegment[];
  category: CategoryDraft;
  match: KnockoutMatch;
  final?: boolean;
}) {
  // A side's entry once known (knockout only, by seed); otherwise where it comes from.
  const side = (slot: string) => sideName(draft, category.id, slot) ?? slot;
  const when = whenOf(draft, segments, category.id, match.code);
  // Zoomed out: the two sides only.
  const compact = useBracketCompact();
  return (
    <div
      data-bracket-match={match.code}
      data-feeds={feedsOf(match)}
      className={cn(
        "relative flex w-full min-w-0 flex-col rounded-lg border bg-card text-sm",
        final ? "border-shuttle ring-1 ring-shuttle" : "border-border",
      )}
    >
      {compact ? null : (
        <div className="flex items-center justify-between gap-2 border-b px-3 py-1 text-xs font-semibold text-muted-foreground tabular-nums">
          <span className="shrink-0">{match.code === "Final" ? "Final" : match.code === "Bronze" ? "Bronze match" : match.code}</span>
          <span className="truncate" title={when ?? undefined}>
            {when ?? "Not scheduled"}
          </span>
        </div>
      )}
      {[match.home, match.away].map((slot, i) => (
        <div key={i} className={cn("truncate px-3", compact ? "py-1" : "py-2", i === 0 && "border-b border-border/60")} title={side(slot)}>
          <TeamName entryId={entryForSlot(draft, category.id, slot)?.id}>{side(slot)}</TeamName>
        </div>
      ))}
    </div>
  );
}

/**
 * The Draw stage's KO stage page: the knockout tree from the first round to the
 * final, with the bronze match. Sides show where they come from ("Winner A",
 * "Winner QF1") until results fill them in Live; knockout-only draws show the
 * seeds' names.
 */
export function BracketView({ draft, segments }: { draft: PlanDraft; segments: LocalSegment[] }) {
  const [categoryId, setCategoryId] = useState<string | null>(draft.categories[0]?.id ?? null);
  const category = draft.categories.find((c) => c.id === categoryId) ?? draft.categories[0];
  const [zoom, setZoom] = useBracketZoom();
  if (!category) return <p className="text-sm text-muted-foreground">Add categories on the Plan stage first.</p>;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <CategoryTabs draft={draft} value={category.id} onChange={setCategoryId} count={() => ""} />
        </div>
        <BracketZoomButtons zoom={zoom} onZoom={setZoom} />
      </div>
      <CategoryBracket key={category.id} draft={draft} segments={segments} category={category} zoom={zoom} />
    </div>
  );
}

function CategoryBracket({ draft, segments, category, zoom }: { draft: PlanDraft; segments: LocalSegment[]; category: CategoryDraft; zoom: BracketZoom }) {
  const format = categoryFormatOf(draft, category);
  if (draft.format === "groups") {
    return <p className="rounded-lg bg-card-system p-4 text-sm text-muted-foreground">Groups only: there&apos;s no knockout. See Group stage.</p>;
  }
  if (!format.ok) return <p className="rounded-lg bg-card-system p-4 text-sm text-muted-foreground">{format.message}</p>;
  const bracket = knockoutBracket(format.format.qualifiers, format.format.groupSizes.length, category.bronze);
  const final = bracket.rounds.at(-1);
  const earlier = bracket.rounds.slice(0, -1);

  return (
    <section aria-label={`${categoryName(draft, category.id)} bracket`} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="heading-card">{categoryName(draft, category.id)}</h2>
        <p className="text-sm text-muted-foreground">
          {format.format.qualifiers} go through to the knockout
          {category.bronze ? ", with a bronze match" : ""}. Sides fill in as results arrive in Live mode.
        </p>
      </div>
      {/* The rounds share the width there is, so the whole tree shows, each match joined to the one its winner plays next. */}
      <BracketFrame compact={zoom === "compact"} redraw={`${category.id}:${format.format.qualifiers}:${category.bronze}`}>
          {earlier.map((round) => (
            <div key={round.size} className={BRACKET_COLUMN}>
              <h3 className="text-sm font-semibold">{roundName(round.size)}</h3>
              <ol className={cn("flex flex-1 flex-col justify-around", zoom === "compact" ? "gap-1.5" : "gap-3")}>
                {round.matches.map((m) => (
                  <li key={m.code}>
                    <MatchBox draft={draft} segments={segments} category={category} match={m} />
                  </li>
                ))}
              </ol>
            </div>
          ))}
          {final ? (
            <div className={BRACKET_COLUMN}>
              <h3 className="flex items-center gap-2 text-sm font-semibold">
                <TrophyIcon weight="fill" className="size-4 text-shuttle" aria-hidden="true" /> Final
              </h3>
              <div className="flex flex-1 flex-col justify-center gap-6">
                <MatchBox draft={draft} segments={segments} category={category} match={final.matches[0]!} final />
                {bracket.bronze ? (
                  <div className="flex flex-col gap-2">
                    <h3 className="text-sm font-semibold">Bronze match</h3>
                    <MatchBox draft={draft} segments={segments} category={category} match={bracket.bronze} />
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
      </BracketFrame>
    </section>
  );
}
