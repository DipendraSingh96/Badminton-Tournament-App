"use client";

import { MagnifyingGlassIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { groupLetter } from "@/engine";
import {
  courtNumber,
  entryName,
  type Attendance,
  type EntryDraft,
  type PlanDraft,
  type PlayerDraft,
} from "@/lib/tournament/draft";
import { entryForSlot, rubbersOf } from "@/lib/tournament/entries";
import { EVENT_LABELS } from "@/lib/tournament/events";
import { clock } from "@/lib/tournament/time";
import { cn } from "@/lib/utils";
import { categoryName } from "./labels";
import type { Update } from "./plan-editor";
import { matchText, sideLabel, type LocalSegment } from "./timeline";

const ATTENDANCE: { value: Attendance; label: string }[] = [
  { value: "arrived", label: "Arrived" },
  { value: "notYet", label: "Not yet" },
  { value: "absent", label: "Absent" },
];

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
 * An entry's matches in time order: every match its draw place plays (the
 * group stage, and knockout only by seed). With a player, only the rubbers
 * that player is in the line-up for.
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

/** Arrived, not yet or absent, as three small choices. */
function AttendanceChoice({ player, onChange }: { player: PlayerDraft; onChange: (a: Attendance) => void }) {
  return (
    <div role="radiogroup" aria-label={`${player.name || "Player"} check-in`} className="flex gap-1 rounded-md bg-inset p-1">
      {ATTENDANCE.map((a) => {
        const selected = player.attendance === a.value;
        return (
          <button
            key={a.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(a.value)}
            className={cn(
              "h-6 rounded-sm px-2 text-xs font-semibold transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
              selected
                ? a.value === "arrived"
                  ? "bg-primary text-primary-foreground"
                  : a.value === "absent"
                    ? "bg-over-strong text-over-foreground"
                    : "bg-card text-foreground"
                : "text-muted-foreground hover:bg-card hover:text-foreground",
            )}
          >
            {a.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * The Draw stage's Teams view: every team and player, with check-in on the
 * day and each one's next match; choose one to see its squad, line-up and
 * every match.
 */
export function TeamsView({
  draft,
  update,
  segments,
  moment,
}: {
  draft: PlanDraft;
  update: Update;
  segments: LocalSegment[];
  /** The timeline's playhead, in minutes since midnight: "next" is from here. */
  moment: number | null;
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(draft.entries[0]?.id ?? null);
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
  const selected = draft.entries.find((e) => e.id === selectedId) ?? null;
  const setAttendance = (entryId: string, playerId: string | null, attendance: Attendance) =>
    update((d) => {
      const entry = d.entries.find((e) => e.id === entryId);
      for (const p of entry?.players ?? []) if (playerId === null || p.id === playerId) p.attendance = attendance;
    });
  const at = moment ?? -Infinity;

  if (draft.entries.length === 0) {
    return <p className="rounded-lg bg-inset p-4 text-sm text-muted-foreground">No entries yet: add them on the Entries view.</p>;
  }

  return (
    <div className="grid min-h-0 grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] gap-6">
      <section aria-label={team ? "Teams" : "Entries"} className="flex min-w-0 flex-col gap-3">
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
        <p className="text-sm text-muted-foreground tabular-nums">
          {draft.entries.flatMap((e) => e.players).filter((p) => p.attendance === "arrived").length} of{" "}
          {draft.entries.flatMap((e) => e.players).length} players checked in
        </p>
        <ul className="flex flex-col gap-1">
          {visible.length === 0 ? <li className="text-sm text-muted-foreground">Nothing matches “{query}”.</li> : null}
          {visible.map((entry) => {
            const arrived = entry.players.filter((p) => p.attendance === "arrived").length;
            const absent = entry.players.some((p) => p.attendance === "absent");
            const next = matchesOf(draft, segments, entry).find((s) => s.to > at);
            const place = placeOf(draft, entry);
            return (
              <li key={entry.id}>
                <button
                  type="button"
                  aria-pressed={entry.id === selectedId}
                  onClick={() => setSelectedId(entry.id)}
                  className={cn(
                    "grid w-full grid-cols-[3rem_minmax(0,1fr)_auto] items-center gap-2 rounded-lg border px-3 py-2 text-left transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    entry.id === selectedId ? "border-primary bg-accent" : "border-transparent bg-inset hover:border-input",
                  )}
                >
                  <span className="text-xs font-semibold text-muted-foreground tabular-nums">{place ?? "–"}</span>
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-sm font-semibold">{entryName(entry) ?? "Unnamed entry"}</span>
                    <span className="truncate text-xs text-muted-foreground tabular-nums">
                      {next
                        ? `Next ${clock(next.from)} · Court ${courtOf(draft, next.courtId) ?? "?"}`
                        : draft.draw[entry.categoryId]
                          ? "No more matches"
                          : "Not drawn yet"}
                      {draft.categories.length > 1 ? ` · ${categoryName(draft, entry.categoryId)}` : ""}
                    </span>
                  </span>
                  {absent ? (
                    <Badge variant="over">Absent</Badge>
                  ) : (
                    <Badge variant={arrived === entry.players.length ? "fits" : "off"}>
                      {arrived}/{entry.players.length} in
                    </Badge>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      {selected ? (
        <EntryDetail
          key={selected.id}
          draft={draft}
          entry={selected}
          segments={segments}
          at={at}
          place={placeOf(draft, selected)}
          onAttendance={(playerId, a) => setAttendance(selected.id, playerId, a)}
        />
      ) : null}
    </div>
  );
}

function EntryDetail({
  draft,
  entry,
  segments,
  at,
  place,
  onAttendance,
}: {
  draft: PlanDraft;
  entry: EntryDraft;
  segments: LocalSegment[];
  at: number;
  place: string | null;
  onAttendance: (playerId: string | null, attendance: Attendance) => void;
}) {
  const [playerId, setPlayerId] = useState<string | null>(null);
  const player = entry.players.find((p) => p.id === playerId);
  const team = draft.unit === "team";
  const category = draft.categories.find((c) => c.id === entry.categoryId);
  const matches = matchesOf(draft, segments, entry, player);
  const rubbers = team && category ? rubbersOf(category) : [];
  const nameOf = (id: string) => entry.players.find((p) => p.id === id)?.name || "Unnamed player";

  return (
    <section aria-label={entryName(entry) ?? "Entry"} className="flex min-w-0 flex-col gap-4 rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-col gap-1">
          <h2 className="heading-card">{entryName(entry) ?? "Unnamed entry"}</h2>
          <p className="text-sm text-muted-foreground tabular-nums">
            {[
              categoryName(draft, entry.categoryId),
              place ? (place.startsWith("Seed") ? place : `Group ${place.charAt(0)}, place ${place.slice(1)}`) : "Not drawn yet",
              entry.seed ? `seeded ${entry.seed}` : null,
              entry.external ? "external" : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => onAttendance(null, "arrived")}>
          Check in everyone
        </Button>
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold">{team ? "Squad and check-in" : "Check-in"}</h3>
        <ul className="flex flex-col gap-2">
          {entry.players.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-2">
              <button
                type="button"
                aria-pressed={p.id === playerId}
                title={p.id === playerId ? "Show the whole team's matches" : "Show only this player's matches"}
                onClick={() => setPlayerId(p.id === playerId ? null : p.id)}
                className={cn(
                  "min-w-0 truncate rounded-md px-2 py-1 text-left text-sm outline-none hover:bg-inset focus-visible:ring-2 focus-visible:ring-ring",
                  p.id === playerId && "bg-accent font-semibold",
                )}
              >
                {p.name || "Unnamed player"}
              </button>
              <AttendanceChoice player={p} onChange={(a) => onAttendance(p.id, a)} />
            </li>
          ))}
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
              const opponent = sideLabel(draft, s.match, home ? s.match.away : s.match.home);
              const done = s.to <= at;
              return (
                <li
                  key={s.id}
                  className={cn(
                    "grid grid-cols-[6.5rem_4.5rem_minmax(0,1fr)] items-baseline gap-2 rounded-md px-2 py-1 text-sm tabular-nums",
                    s.from <= at && at < s.to ? "bg-accent" : "",
                    done && "text-muted-foreground",
                  )}
                >
                  <span>
                    {clock(s.from)}–{clock(s.to)}
                  </span>
                  <span>Court {courtOf(draft, s.courtId) ?? "?"}</span>
                  <span className="truncate" title={[where, rubber, `v ${opponent}`].filter(Boolean).join(" · ")}>
                    v <span className="font-semibold">{opponent}</span>
                    <span className="text-muted-foreground"> · {[where, rubber?.replace(/: .*/, "")].filter(Boolean).join(" · ")}</span>
                  </span>
                </li>
              );
            })}
          </ol>
        )}
        <p className="text-xs text-muted-foreground">Knockout matches, results and qualification follow once Live mode records scores.</p>
      </div>
    </section>
  );
}
