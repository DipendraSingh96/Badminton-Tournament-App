"use client";

import { CaretDownIcon, XIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { courtNumber, type Attendance, type PlanDraft, type PlayerDraft } from "@/lib/tournament/draft";
import { sidePlayers } from "@/lib/tournament/entries";
import { clock } from "@/lib/tournament/time";
import { cn } from "@/lib/utils";
import { IconButton } from "./fields";
import { categoryName } from "./labels";
import { matchText, sideLabel, type LocalSegment } from "./timeline";

const ATTENDANCE: Record<Attendance, { label: string; variant: "fits" | "off" | "over" }> = {
  arrived: { label: "Arrived", variant: "fits" },
  notYet: { label: "Not yet", variant: "off" },
  absent: { label: "Absent", variant: "over" },
};

/** How many of the up-next matches a court shows before "Later". */
const UP_NEXT = 3;
/** How many matches the venue-wide call-up list shows. */
const CALL_UP = 12;

/** A court's number and name, from its id. */
function courtLabel(draft: PlanDraft, courtId: string): string {
  for (const [h, hall] of draft.frame.halls.entries()) {
    const c = hall.courts.findIndex((x) => x.id === courtId);
    if (c !== -1) return `Court ${courtNumber(draft.frame.halls, h, c)}`;
  }
  return "Court";
}

/** Who's not ready among a match's players: not checked in yet, or absent. */
function notReady(players: PlayerDraft[]): number {
  return players.filter((p) => p.attendance !== "arrived").length;
}

/** One side of a match: its name and, once known, who plays, with their check-in. */
function Side({ draft, segment, slot }: { draft: PlanDraft; segment: LocalSegment; slot: string }) {
  const name = sideLabel(draft, segment.match, slot);
  const players = sidePlayers(draft, segment.match.categoryId, slot, segment.match.rubber?.number);
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="truncate text-sm font-semibold" title={name}>
        {name}
      </span>
      {players.length > 0 ? (
        <ul className="flex flex-col gap-1">
          {players.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-2 text-sm">
              <span className="truncate">{p.name || "Unnamed player"}</span>
              <Badge variant={ATTENDANCE[p.attendance].variant}>{ATTENDANCE[p.attendance].label}</Badge>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** A match on a court: when, what, and both sides. */
function MatchItem({ draft, segment, showCourt }: { draft: PlanDraft; segment: LocalSegment; showCourt?: boolean }) {
  const { where, rubber } = matchText(draft, segment.match);
  const players = [segment.match.home, segment.match.away].flatMap((slot) =>
    sidePlayers(draft, segment.match.categoryId, slot, segment.match.rubber?.number),
  );
  const waiting = notReady(players);
  return (
    <li className="flex flex-col gap-2 rounded-lg bg-inset p-3">
      <div className="flex items-center justify-between gap-2 text-xs font-semibold text-muted-foreground tabular-nums">
        <span className="truncate">
          {clock(segment.from)}–{clock(segment.to)}
          {showCourt ? ` · ${courtLabel(draft, segment.courtId)}` : ""}
        </span>
        {players.length > 0 ? (
          waiting === 0 ? (
            <Badge variant="fits">Ready</Badge>
          ) : (
            <Badge variant="tight">{waiting} not checked in</Badge>
          )
        ) : null}
      </div>
      <p className="truncate text-sm text-muted-foreground" title={[where, rubber, categoryName(draft, segment.match.categoryId)].filter(Boolean).join(" · ")}>
        {[where, rubber?.replace(/: .*/, ""), draft.categories.length > 1 ? categoryName(draft, segment.match.categoryId) : null]
          .filter(Boolean)
          .join(" · ")}
      </p>
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-2">
        <Side draft={draft} segment={segment} slot={segment.match.home} />
        <span className="pt-1 text-xs font-semibold text-muted-foreground">v</span>
        <Side draft={draft} segment={segment} slot={segment.match.away} />
      </div>
    </li>
  );
}

/**
 * The right-hand panel in the Draw (and Live) stage. With a court chosen: the
 * match on it at the playhead, who's up next and should get ready, and the
 * rest of its day. With none: the call-up list across the venue.
 */
export function CourtPanel({
  draft,
  segments,
  moment,
  courtId,
  onClose,
}: {
  draft: PlanDraft;
  segments: LocalSegment[];
  /** The timeline's playhead, in minutes since midnight. */
  moment: number | null;
  courtId: string | null;
  onClose: () => void;
}) {
  const [laterOpen, setLaterOpen] = useState(false);
  const at = moment ?? -Infinity;

  if (!courtId) {
    const upcoming = segments
      .filter((s) => s.to > at)
      .sort((a, b) => a.from - b.from || a.courtId.localeCompare(b.courtId))
      .slice(0, CALL_UP);
    return (
      <aside aria-label="Call-up" className="flex h-full flex-col border-l bg-card">
        <div className="flex flex-col gap-1 border-b px-4 py-4">
          <h2 className="heading-card">Call-up</h2>
          <p className="text-sm text-muted-foreground">
            The next matches across the venue{moment !== null ? ` from ${clock(moment)}` : ""}. Choose a court to see its
            day.
          </p>
        </div>
        <ol className="scroll-pane flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-(--pane-x) py-4">
          {upcoming.length === 0 ? <p className="text-sm text-muted-foreground">No more matches today.</p> : null}
          {upcoming.map((s) => (
            <MatchItem key={s.id} draft={draft} segment={s} showCourt />
          ))}
        </ol>
      </aside>
    );
  }

  const day = segments.filter((s) => s.courtId === courtId).sort((a, b) => a.from - b.from);
  const now = day.find((s) => s.from <= at && at < s.to) ?? null;
  const after = day.filter((s) => s.from >= at && s !== now);
  const next = after.slice(0, UP_NEXT);
  const later = after.slice(UP_NEXT);
  return (
    <aside aria-label={courtLabel(draft, courtId)} className="flex h-full flex-col border-l bg-card">
      <div className="flex items-center justify-between gap-2 border-b px-4 py-4">
        <div className="flex flex-col gap-1">
          <h2 className="heading-card">{courtLabel(draft, courtId)}</h2>
          <p className="text-sm text-muted-foreground tabular-nums">
            {day.length} {day.length === 1 ? "match" : "matches"} today{moment !== null ? ` · at ${clock(moment)}` : ""}
          </p>
        </div>
        <IconButton label="Back to the call-up list" onClick={onClose}>
          <XIcon />
        </IconButton>
      </div>
      <div className="scroll-pane flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-(--pane-x) py-4">
        <section aria-labelledby="court-now" className="flex flex-col gap-2">
          <h3 id="court-now" className="text-sm font-semibold">
            Now
          </h3>
          {now ? (
            <ol>
              <MatchItem draft={draft} segment={now} />
            </ol>
          ) : (
            <p className="text-sm text-muted-foreground">Nothing on this court at the moment.</p>
          )}
        </section>
        <section aria-labelledby="court-next" className="flex flex-col gap-2">
          <h3 id="court-next" className="text-sm font-semibold">
            Up next
          </h3>
          {next.length > 0 ? (
            <ol className="flex flex-col gap-2">
              {next.map((s) => (
                <MatchItem key={s.id} draft={draft} segment={s} />
              ))}
            </ol>
          ) : (
            <p className="text-sm text-muted-foreground">No more matches on this court.</p>
          )}
        </section>
        {later.length > 0 ? (
          <section className="flex flex-col gap-2">
            <button
              type="button"
              aria-expanded={laterOpen}
              onClick={() => setLaterOpen(!laterOpen)}
              className="flex items-center gap-2 self-start rounded-md text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Later today ({later.length})
              <CaretDownIcon weight="bold" className={cn("size-4 transition-transform", laterOpen && "rotate-180")} />
            </button>
            {laterOpen ? (
              <ol className="flex flex-col gap-2">
                {later.map((s) => (
                  <MatchItem key={s.id} draft={draft} segment={s} />
                ))}
              </ol>
            ) : null}
          </section>
        ) : null}
      </div>
    </aside>
  );
}
