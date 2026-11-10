"use client";

import { ArrowLeftIcon, MagnifyingGlassIcon, XIcon } from "@phosphor-icons/react";
import { createContext, useContext, useState, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { groupLetter } from "@/engine";
import { courtNumber, entryName, type EntryDraft, type PlanDraft, type PlayerDraft } from "@/lib/tournament/draft";
import { entryForSlot, rubbersOf, swapDrawn } from "@/lib/tournament/entries";
import { EVENT_LABELS } from "@/lib/tournament/events";
import { clock } from "@/lib/tournament/time";
import { cn } from "@/lib/utils";
import { IconButton } from "./fields";
import { categoryName } from "./labels";
import type { Update } from "./plan-editor";
import { matchText, sideLabel, type LocalSegment } from "./timeline";

/** What the Draw stage's side panel shows: every team, one team, or one court's day. */
export type DrawFocus = { kind: "teams" } | { kind: "team"; id: string } | { kind: "court"; id: string };

/** Opens a team in the side panel (and the panel, if it's folded); absent where there's no panel. */
export const TeamOpenContext = createContext<((entryId: string) => void) | null>(null);

/**
 * A team's (or pair's, player's) name wherever it's shown in the Draw stage:
 * a click opens it in the side panel. Plain text where there's no panel, or
 * no entry behind the name yet (a draw slot).
 */
export function TeamName({
  entryId,
  className,
  children,
}: {
  entryId: string | null | undefined;
  className?: string;
  children: ReactNode;
}) {
  const open = useContext(TeamOpenContext);
  if (!open || !entryId) return <span className={className}>{children}</span>;
  return (
    <button
      type="button"
      onClick={(event) => {
        // Not also whatever the name sits on (a court, a row).
        event.stopPropagation();
        open(entryId);
      }}
      className={cn(
        "max-w-full rounded-sm text-left underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
    >
      {children}
    </button>
  );
}

/** Where an entry sits in its category's draw: "A1", "Seed 3", or null before the draw. */
function placeOf(draft: PlanDraft, entry: EntryDraft): string | null {
  const groups = draft.draw[entry.categoryId]?.groups ?? [];
  for (const [g, list] of groups.entries()) {
    const p = list.indexOf(entry.id);
    if (p !== -1) return draft.format === "knockout" ? `Seed ${p + 1}` : `${groupLetter(g)}${p + 1}`;
  }
  return null;
}

/** A court's number from its id. */
function courtOf(draft: PlanDraft, courtId: string): number | null {
  for (const [h, hall] of draft.frame.halls.entries()) {
    const c = hall.courts.findIndex((x) => x.id === courtId);
    if (c !== -1) return courtNumber(draft.frame.halls, h, c);
  }
  return null;
}

/**
 * An entry's matches in time order: every match its draw place plays. With a
 * player, only the rubbers that player is in the line-up for.
 */
function matchesOf(draft: PlanDraft, segments: LocalSegment[], entry: EntryDraft, player?: PlayerDraft): LocalSegment[] {
  return segments
    .filter((s) => {
      if (s.match.categoryId !== entry.categoryId) return false;
      const home = entryForSlot(draft, s.match.categoryId, s.match.home)?.id === entry.id;
      const away = entryForSlot(draft, s.match.categoryId, s.match.away)?.id === entry.id;
      if (!home && !away) return false;
      if (!player || draft.unit !== "team") return true;
      return (entry.lineUp[String(s.match.rubber?.number)] ?? []).includes(player.id);
    })
    .sort((a, b) => a.from - b.from);
}

/** One side of a match: the team's name (a link to it) once the draw places one, else its slot. */
function Side({ draft, segment, slot }: { draft: PlanDraft; segment: LocalSegment; slot: string }) {
  const entry = entryForSlot(draft, segment.match.categoryId, slot);
  const name = sideLabel(draft, segment.match, slot);
  return (
    <TeamName entryId={entry?.id} className="truncate font-semibold">
      <span title={name}>{name}</span>
    </TeamName>
  );
}

/**
 * The Draw stage's side panel, built like the Plan stage's workbench: every
 * team by default; a team's details when its name is chosen anywhere; a
 * court's games when a court is chosen on the Schedule page.
 */
export function DrawPanel({
  draft,
  update,
  segments,
  moment,
  focus,
  onFocus,
  onFold,
}: {
  draft: PlanDraft;
  update: Update;
  segments: LocalSegment[];
  /** The timeline's playhead, in minutes since midnight: "next" is from here. */
  moment: number | null;
  focus: DrawFocus;
  onFocus: (focus: DrawFocus) => void;
  onFold: () => void;
}) {
  const team = draft.unit === "team";
  const entry = focus.kind === "team" ? (draft.entries.find((e) => e.id === focus.id) ?? null) : null;
  const court = focus.kind === "court" ? courtOf(draft, focus.id) : null;
  // A team or court that's gone (removed, or another tournament's): back to the list.
  const shown: DrawFocus["kind"] = entry ? "team" : court !== null ? "court" : "teams";
  const title =
    shown === "team" ? (entryName(entry!) ?? "Unnamed entry") : shown === "court" ? `Court ${court}` : team ? "Teams" : "Entries";
  return (
    <>
      <div className="flex min-h-8 shrink-0 items-center gap-2 px-4 pb-3">
        {shown !== "teams" ? (
          <IconButton label={team ? "Back to all teams" : "Back to all entries"} side="bottom" onClick={() => onFocus({ kind: "teams" })}>
            <ArrowLeftIcon />
          </IconButton>
        ) : null}
        <h2 className="heading-card min-w-0 flex-1 truncate" title={title}>
          {title}
        </h2>
        <IconButton label="Hide panel" side="left" aria-expanded onClick={onFold}>
          <XIcon />
        </IconButton>
      </div>
      <div className="scroll-pane relative min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        {shown === "team" ? (
          <TeamDetail key={entry!.id} draft={draft} update={update} entry={entry!} segments={segments} at={moment ?? -Infinity} />
        ) : shown === "court" ? (
          <CourtGames draft={draft} segments={segments} courtId={(focus as { id: string }).id} />
        ) : (
          <TeamList draft={draft} segments={segments} at={moment ?? -Infinity} onOpen={(id) => onFocus({ kind: "team", id })} />
        )}
      </div>
    </>
  );
}

function TeamList({
  draft,
  segments,
  at,
  onOpen,
}: {
  draft: PlanDraft;
  segments: LocalSegment[];
  at: number;
  onOpen: (entryId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const team = draft.unit === "team";
  const q = query.trim().toLowerCase();
  // In draw order (category, then group and place, knockout by seed); undrawn entries last, as entered.
  const order = (e: EntryDraft) => {
    const groups = draft.draw[e.categoryId]?.groups ?? [];
    const g = groups.findIndex((list) => list.includes(e.id));
    return g === -1 ? Infinity : g * 1000 + groups[g]!.indexOf(e.id);
  };
  const categoryOrder = (e: EntryDraft) => draft.categories.findIndex((c) => c.id === e.categoryId);
  const visible = draft.entries
    .filter(
      (e) =>
        (!category || e.categoryId === category) &&
        (!q || (entryName(e) ?? "").toLowerCase().includes(q) || e.players.some((p) => p.name.toLowerCase().includes(q))),
    )
    .sort((a, b) => categoryOrder(a) - categoryOrder(b) || order(a) - order(b));

  if (draft.entries.length === 0) {
    return <p className="text-sm text-muted-foreground">No entries yet: add them on the Entries page.</p>;
  }
  return (
    <section aria-label={team ? "Teams" : "Entries"} className="flex flex-col gap-3">
      <div className="flex gap-2">
        <div className="relative min-w-0 flex-1">
          <MagnifyingGlassIcon
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            aria-label={team ? "Search teams and players" : "Search entries and players"}
            placeholder={team ? "Search teams or players" : "Search names"}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        {draft.categories.length > 1 ? (
          <NativeSelect aria-label="Category" value={category} onChange={(e) => setCategory(e.target.value)}>
            <NativeSelectOption value="">All categories</NativeSelectOption>
            {draft.categories.map((c) => (
              <NativeSelectOption key={c.id} value={c.id}>
                {categoryName(draft, c.id)}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        ) : null}
      </div>
      <ul className="flex flex-col gap-1">
        {visible.length === 0 ? <li className="text-sm text-muted-foreground">Nothing matches “{query}”.</li> : null}
        {visible.map((entry) => {
          const next = matchesOf(draft, segments, entry).find((s) => s.to > at);
          const name = entryName(entry) ?? "Unnamed entry";
          return (
            <li key={entry.id}>
              <button
                type="button"
                onClick={() => onOpen(entry.id)}
                className="grid w-full grid-cols-[2.5rem_minmax(0,1fr)] items-center gap-2 rounded-lg bg-card-system px-3 py-2 text-left transition-colors outline-none hover:bg-(--field-raised) focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="text-xs font-semibold text-muted-foreground tabular-nums">{placeOf(draft, entry) ?? "–"}</span>
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-sm font-semibold" title={name}>
                    {name}
                  </span>
                  <span className="truncate text-xs text-muted-foreground tabular-nums">
                    {next
                      ? `Next ${clock(next.from)} · Court ${courtOf(draft, next.courtId) ?? "?"}`
                      : draft.draw[entry.categoryId]
                        ? "No more matches"
                        : "Not drawn yet"}
                    {draft.categories.length > 1 ? ` · ${categoryName(draft, entry.categoryId)}` : ""}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function TeamDetail({
  draft,
  update,
  entry,
  segments,
  at,
}: {
  draft: PlanDraft;
  update: Update;
  entry: EntryDraft;
  segments: LocalSegment[];
  at: number;
}) {
  const [playerId, setPlayerId] = useState<string | null>(null);
  const player = entry.players.find((p) => p.id === playerId);
  const team = draft.unit === "team";
  const category = draft.categories.find((c) => c.id === entry.categoryId);
  const place = placeOf(draft, entry);
  const matches = matchesOf(draft, segments, entry, player);
  const rubbers = team && category ? rubbersOf(category) : [];
  const nameOf = (id: string) => entry.players.find((p) => p.id === id)?.name || "Unnamed player";
  const draw = draft.draw[entry.categoryId];
  // Swapping from the keyboard: everyone else drawn in the category.
  const others =
    draw && !draw.locked && place
      ? draw.groups
          .flat()
          .filter((id) => id !== entry.id)
          .map((id) => draft.entries.find((e) => e.id === id))
          .filter((e): e is EntryDraft => Boolean(e))
      : [];

  return (
    <section aria-label={entryName(entry) ?? "Entry"} className="flex flex-col gap-4">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground tabular-nums">
        {[
          categoryName(draft, entry.categoryId),
          place ? (place.startsWith("Seed") ? place : `Group ${place.charAt(0)}, place ${place.slice(1)}`) : "Not drawn yet",
          entry.seed ? `seeded ${entry.seed}` : null,
        ]
          .filter(Boolean)
          .join(" · ")}
        {entry.external ? <Badge variant="outline">External</Badge> : null}
      </p>

      {others.length > 0 ? (
        <div className="flex flex-col gap-1">
          <label htmlFor={`swap-${entry.id}`} className="text-xs leading-4 text-muted-foreground">
            Swap draw place with
          </label>
          <NativeSelect
            id={`swap-${entry.id}`}
            className="w-full"
            value=""
            data-empty
            onChange={(e) => {
              const other = e.target.value;
              if (other) update((d) => swapDrawn(d, entry.categoryId, entry.id, other));
            }}
          >
            <NativeSelectOption value="">Choose</NativeSelectOption>
            {others.map((o) => (
              <NativeSelectOption key={o.id} value={o.id}>
                {placeOf(draft, o)} · {entryName(o) ?? "Unnamed entry"}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold">{team ? "Squad" : entry.players.length === 1 ? "Player" : "Players"}</h3>
        <ul className="flex flex-col gap-1">
          {entry.players.map((p) =>
            team ? (
              <li key={p.id}>
                <button
                  type="button"
                  aria-pressed={p.id === playerId}
                  title={p.id === playerId ? "Show the whole team's matches" : "Show only this player's matches"}
                  onClick={() => setPlayerId(p.id === playerId ? null : p.id)}
                  className={cn(
                    "-mx-2 max-w-full truncate rounded-md px-2 py-1 text-left text-sm outline-none hover:bg-(--field) focus-visible:ring-2 focus-visible:ring-ring",
                    p.id === playerId && "bg-(--field) font-semibold",
                  )}
                >
                  {p.name || "Unnamed player"}
                </button>
              </li>
            ) : (
              <li key={p.id} className="truncate text-sm">
                {p.name || "Unnamed player"}
              </li>
            ),
          )}
        </ul>
      </div>

      {team && rubbers.length > 0 ? (
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold">Line-up, every tie</h3>
          <ul className="flex flex-col gap-1 text-sm">
            {rubbers.map((r) => {
              const ids = entry.lineUp[String(r.number)] ?? [];
              return (
                <li key={r.number} className="flex justify-between gap-2">
                  <span className="text-muted-foreground">
                    Rubber {r.number} · {EVENT_LABELS[r.event]}
                  </span>
                  <span className="truncate font-medium">{ids.length > 0 ? ids.map(nameOf).join(" & ") : "Not set"}</span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold">
          {player ? `${player.name || "This player"}'s matches` : "Matches"} ({matches.length})
        </h3>
        {matches.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {place ? "No matches on the schedule yet." : "Matches appear once the draw is made."}
          </p>
        ) : (
          <ol className="flex flex-col gap-1">
            {matches.map((s) => {
              const { where, rubber } = matchText(draft, s.match);
              const home = entryForSlot(draft, s.match.categoryId, s.match.home)?.id === entry.id;
              return (
                <li
                  key={s.id}
                  className={cn("flex flex-col gap-1 rounded-lg bg-card-system px-3 py-2 text-sm", s.to <= at && "text-muted-foreground")}
                >
                  <span className="flex justify-between gap-2 text-xs text-muted-foreground tabular-nums">
                    <span>
                      {clock(s.from)}–{clock(s.to)} · Court {courtOf(draft, s.courtId) ?? "?"}
                    </span>
                    <span className="truncate">{[where, rubber?.replace(/: .*/, "")].filter(Boolean).join(" · ")}</span>
                  </span>
                  <span className="flex min-w-0 items-baseline gap-1">
                    <span className="text-muted-foreground">v</span>
                    <Side draft={draft} segment={s} slot={home ? s.match.away : s.match.home} />
                  </span>
                </li>
              );
            })}
          </ol>
        )}
        <p className="text-xs text-muted-foreground">Knockout matches fill in as results arrive in Live.</p>
      </div>
    </section>
  );
}

/** A court's games for the day, in time order: when, what, and both sides. */
function CourtGames({ draft, segments, courtId }: { draft: PlanDraft; segments: LocalSegment[]; courtId: string }) {
  const games = segments.filter((s) => s.courtId === courtId).sort((a, b) => a.from - b.from);
  return (
    <section aria-label="Games on this court" className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground tabular-nums">
        {games.length === 0
          ? "No games on this court."
          : `${games.length} ${games.length === 1 ? "game" : "games"} · ${clock(games[0]!.from)}–${clock(games.at(-1)!.to)}`}
      </p>
      <ol className="flex flex-col gap-1">
        {games.map((s) => {
          const { where, rubber } = matchText(draft, s.match);
          return (
            <li key={s.id} className="flex flex-col gap-1 rounded-lg bg-card-system px-3 py-2 text-sm">
              <span className="flex justify-between gap-2 text-xs text-muted-foreground tabular-nums">
                <span>
                  {clock(s.from)}–{clock(s.to)}
                </span>
                <span className="truncate">
                  {[where, rubber?.replace(/: .*/, ""), draft.categories.length > 1 ? categoryName(draft, s.match.categoryId) : null]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </span>
              <span className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-baseline gap-2">
                <Side draft={draft} segment={s} slot={s.match.home} />
                <span className="text-xs text-muted-foreground">v</span>
                <Side draft={draft} segment={s} slot={s.match.away} />
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
