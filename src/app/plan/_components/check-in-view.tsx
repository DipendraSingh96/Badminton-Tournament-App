"use client";

import { CheckIcon, MagnifyingGlassIcon, PhoneIcon } from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { entryName, type EntryDraft, type PlanDraft, type PlayerDraft } from "@/lib/tournament/draft";
import { entryForSlot, entryGroups } from "@/lib/tournament/entries";
import { clock } from "@/lib/tournament/time";
import { cn } from "@/lib/utils";
import { AttendanceChoice, AttendanceTally } from "./attendance";
import { TeamName, courtOf, entryGroupTitle, placeOf } from "./draw-panel";
import { SwitchField } from "./fields";
import { categoryName } from "./labels";
import type { Update } from "./plan-editor";
import type { LocalSegment } from "./timeline";

/**
 * The Live stage's Check-in page: the first thing the desk does on the day.
 * Everyone entered, the people playing soonest first, each marked Arrived,
 * Not yet or Absent; with a phone number to reach them on. Absent doesn't
 * withdraw anyone: that is a controlled change.
 */
export function CheckInView({ draft, update, segments }: { draft: PlanDraft; update: Update; segments: LocalSegment[] }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [waiting, setWaiting] = useState(false);
  // In order of first game (who to check in first), or gathered by group (who is missing from each).
  const [order, setOrder] = useState<"first" | "group">("first");
  const team = draft.unit === "team";
  // The desk types a name as each person walks up: the search has the keyboard when the page
  // opens (a moment later, after a dialog that led here has handed focus back).
  const search = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const timer = window.setTimeout(() => search.current?.focus(), 100);
    return () => window.clearTimeout(timer);
  }, []);

  // Each entry's first game: when and where.
  const first = useMemo(() => {
    const found = new Map<string, LocalSegment>();
    for (const s of [...segments].sort((a, b) => a.from - b.from)) {
      for (const slot of [s.match.home, s.match.away]) {
        const entry = entryForSlot(draft, s.match.categoryId, slot);
        if (entry && !found.has(entry.id)) found.set(entry.id, s);
      }
    }
    return found;
  }, [draft, segments]);

  const players = draft.entries.flatMap((e) => e.players);
  const arrived = players.filter((p) => p.attendance === "arrived").length;
  const absent = players.filter((p) => p.attendance === "absent").length;
  const q = query.trim().toLowerCase();
  const categoryOrder = (e: EntryDraft) => draft.categories.findIndex((c) => c.id === e.categoryId);
  const visible = draft.entries
    .filter(
      (e) =>
        (!category || e.categoryId === category) &&
        (!waiting || e.players.some((p) => p.attendance !== "arrived")) &&
        (!q || (entryName(e) ?? "").toLowerCase().includes(q) || e.players.some((p) => p.name.toLowerCase().includes(q))),
    )
    // Soonest first game first; entries with no game yet last, in category order.
    .sort(
      (a, b) =>
        (first.get(a.id)?.from ?? Infinity) - (first.get(b.id)?.from ?? Infinity) ||
        categoryOrder(a) - categoryOrder(b) ||
        (placeOf(draft, a) ?? "").localeCompare(placeOf(draft, b) ?? ""),
    );

  const setPlayer = (entryId: string, playerId: string | null, recipe: (p: PlayerDraft) => void) =>
    update((d) => {
      const entry = d.entries.find((e) => e.id === entryId);
      for (const p of entry?.players ?? []) if (playerId === null || p.id === playerId) recipe(p);
    });

  const card = (entry: EntryDraft) => {
          const game = first.get(entry.id);
          const allIn = entry.players.every((p) => p.attendance === "arrived");
          const anyAbsent = entry.players.some((p) => p.attendance === "absent");
          const name = entryName(entry) ?? "Unnamed entry";
          return (
            <li key={entry.id} className="flex flex-col gap-3 rounded-lg bg-card-system p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 flex-col gap-1">
                  <span className="flex min-w-0 items-center gap-2">
                    <TeamName entryId={entry.id} className="truncate text-sm font-semibold">
                      <span title={name}>{name}</span>
                    </TeamName>
                    {draft.withdrawn[entry.id] ? (
                      <Badge variant="outline">Withdrawn</Badge>
                    ) : anyAbsent ? (
                      <Badge variant="over">Absent</Badge>
                    ) : allIn ? (
                      <Badge variant="fits">All in</Badge>
                    ) : null}
                  </span>
                  <span className="truncate text-xs text-muted-foreground tabular-nums">
                    {[
                      categoryName(draft, entry.categoryId),
                      placeOf(draft, entry),
                      game ? `First game ${clock(game.from)} · Court ${courtOf(draft, game.courtId) ?? "?"}` : "No game scheduled",
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </div>
                {entry.players.length > 1 ? (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={allIn}
                    onClick={() => setPlayer(entry.id, null, (p) => void (p.attendance = "arrived"))}
                  >
                    <CheckIcon /> All arrived
                  </Button>
                ) : null}
              </div>
              <ul className="flex flex-col gap-2">
                {entry.players.map((p, i) => (
                  <li key={p.id} className="flex flex-wrap items-center gap-2">
                    <span className="min-w-0 flex-1 basis-40 truncate text-sm" title={p.name || undefined}>
                      {p.name || `Player ${i + 1}`}
                    </span>
                    <span className="flex items-center gap-1">
                      <Input
                        type="tel"
                        inputMode="tel"
                        aria-label={`${p.name || `Player ${i + 1}`}'s phone number`}
                        placeholder="Phone"
                       
                        value={p.phone ?? ""}
                        onChange={(e) => setPlayer(entry.id, p.id, (x) => void (x.phone = e.target.value))}
                        className="w-40 tabular-nums"
                      />
                      {/* A number to ring from the desk: organiser only, never on the audience board. */}
                      {p.phone?.trim() ? (
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Call ${p.name || `player ${i + 1}`}`}
                          title={`Call ${p.phone.trim()}`}
                          nativeButton={false}
                          render={<a href={`tel:${p.phone.replace(/[^\d+]/g, "")}`} />}
                        >
                          <PhoneIcon />
                        </Button>
                      ) : (
                        <span className="size-8" aria-hidden="true" />
                      )}
                    </span>
                    <AttendanceChoice player={p} onChange={(a) => setPlayer(entry.id, p.id, (x) => void (x.attendance = a))} />
                  </li>
                ))}
              </ul>
            </li>
          );
  };

  if (draft.entries.length === 0) {
    return <p className="rounded-lg bg-card-system p-4 text-sm text-muted-foreground">No entries: add them on the Draw stage.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <h2 className="heading-card">Check-in</h2>
          <p className="text-sm tabular-nums" aria-live="polite">
            <span className="font-semibold">
              {arrived} of {players.length}
            </span>{" "}
            <span className="text-muted-foreground">players checked in</span>
            {absent > 0 ? <span className="font-semibold text-over-text"> · {absent} absent</span> : null}
          </p>
        </div>
        {/* How far check-in has got: arrived, then absent, of everyone. */}
        <div
          role="img"
          aria-label={`${arrived} of ${players.length} players checked in, ${absent} absent`}
          className="flex h-2 overflow-hidden rounded-full bg-border"
        >
          <span className="bg-fits" style={{ width: `${(arrived / Math.max(1, players.length)) * 100}%` }} />
          <span className="bg-over" style={{ width: `${(absent / Math.max(1, players.length)) * 100}%` }} />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 basis-60">
          <MagnifyingGlassIcon
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            ref={search}
            aria-label={team ? "Search teams and players" : "Search players"}
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
        <SwitchField label="Not checked in" checked={waiting} onChange={setWaiting} />
        <div role="radiogroup" aria-label="Order" data-slot="segmented" className="flex shrink-0 gap-1 rounded-md bg-inset p-1">
          {(
            [
              ["first", "By first game"],
              ["group", "By group"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={order === value}
              onClick={() => setOrder(value)}
              className={cn(
                "min-h-6 rounded-sm px-3 text-sm font-semibold transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
                order === value ? "bg-card text-foreground" : "text-muted-foreground hover:bg-card hover:text-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="text-sm text-muted-foreground">{q ? `Nothing matches “${query}”.` : "Everyone here has checked in."}</p>
      ) : order === "first" ? (
        <ul className="flex flex-col gap-2">{visible.map(card)}</ul>
      ) : (
        // A group at a time, the group playing soonest first.
        <ul className="flex flex-col gap-4">
          {entryGroups(draft, visible)
            .map((group) => ({ group, from: Math.min(...group.entries.map((e) => first.get(e.id)?.from ?? Infinity)) }))
            .sort((a, b) => a.from - b.from)
            .map(({ group }) => (
              <li key={group.key} className="flex flex-col gap-2">
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="text-sm font-semibold">{entryGroupTitle(draft, group)}</h3>
                  <AttendanceTally counts={group.counts} />
                </div>
                <ul className="flex flex-col gap-2">{group.entries.map(card)}</ul>
              </li>
            ))}
        </ul>
      )}
    </div>
  );
}
