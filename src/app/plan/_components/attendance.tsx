"use client";

import type { Attendance, PlanDraft, PlayerDraft } from "@/lib/tournament/draft";
import type { AttendanceCounts } from "@/lib/tournament/entries";
import { cn } from "@/lib/utils";
import type { Update } from "./plan-editor";
import { useWatchOnly } from "./watch-only";

const ATTENDANCE: { value: Attendance; label: string }[] = [
  { value: "arrived", label: "Arrived" },
  { value: "notYet", label: "Not yet" },
  { value: "absent", label: "Absent" },
];

/** Arrived, not yet or absent: three buttons side by side, the chosen one filled. */
export function AttendanceChoice({ player, onChange }: { player: PlayerDraft; onChange: (a: Attendance) => void }) {
  const watch = useWatchOnly();
  return (
    <div
      role="radiogroup"
      aria-label={`${player.name || "Player"} check-in`}
      data-slot="segmented"
      className="flex shrink-0 gap-1 rounded-md bg-inset p-1"
    >
      {ATTENDANCE.map((a) => {
        const selected = player.attendance === a.value;
        return (
          <button
            key={a.value}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={watch}
            onClick={() => onChange(a.value)}
            className={cn(
              "min-h-6 rounded-sm px-3 text-sm font-semibold transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none",
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

/** Marks one player of the tournament arrived, not yet or absent. */
export function setAttendance(update: Update, playerId: string, attendance: Attendance) {
  update((d: PlanDraft) => {
    for (const entry of d.entries) for (const p of entry.players) if (p.id === playerId) p.attendance = attendance;
  });
}

/** Some players, each with their check-in buttons: checked in where the desk is looking, not only on the Check-in page. */
export function PlayerCheckIn({ players, update }: { players: PlayerDraft[]; update: Update }) {
  return (
    <ul className="flex flex-col gap-1">
      {players.map((p, i) => (
        <li key={p.id} className="flex items-center justify-between gap-2">
          <span className="min-w-0 truncate text-sm" title={p.name || undefined}>
            {p.name || `Player ${i + 1}`}
          </span>
          <AttendanceChoice player={p} onChange={(a) => setAttendance(update, p.id, a)} />
        </li>
      ))}
    </ul>
  );
}

/** How many have arrived (green), are still awaited (yellow) and are absent (red). */
export function AttendanceTally({ counts }: { counts: AttendanceCounts }) {
  return (
    <span className="flex shrink-0 gap-2 text-xs font-semibold tabular-nums">
      <span className="text-fits-text">{counts.arrived} in</span>
      <span className="text-tight-text">{counts.notYet} not yet</span>
      <span className="text-over-text">{counts.absent} absent</span>
    </span>
  );
}
