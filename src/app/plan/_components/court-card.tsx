"use client";

import { CopyIcon, TrashIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { courtHours, type CourtDraft, type HallDraft } from "@/lib/tournament/draft";
import { StepperField, TextField } from "./fields";
import type { Update } from "./plan-editor";

/** A badminton court seen from above: outline, net, service and centre lines. */
function CourtIllustration() {
  return (
    <svg viewBox="0 0 61 134" className="h-24 w-auto text-foreground/60" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <rect x="1" y="1" width="59" height="132" rx="1" />
      <line x1="5.5" y1="1" x2="5.5" y2="133" />
      <line x1="55.5" y1="1" x2="55.5" y2="133" />
      <line x1="1" y1="8.5" x2="60" y2="8.5" />
      <line x1="1" y1="125.5" x2="60" y2="125.5" />
      <line x1="1" y1="47" x2="60" y2="47" />
      <line x1="1" y1="87" x2="60" y2="87" />
      <line x1="30.5" y1="1" x2="30.5" y2="47" />
      <line x1="30.5" y1="87" x2="30.5" y2="133" />
      <line x1="0" y1="67" x2="61" y2="67" strokeWidth="2.5" />
    </svg>
  );
}

function umpireText(umpires: number | null): string {
  if (umpires === null) return "Umpires not set";
  return `${umpires} ${umpires === 1 ? "umpire" : "umpires"}`;
}

export function CourtCard({
  hall,
  hallIndex,
  courtIndex,
  number,
  open,
  dimmed,
  onOpenChange,
  update,
}: {
  hall: HallDraft;
  hallIndex: number;
  courtIndex: number;
  number: number;
  open: boolean;
  dimmed: boolean;
  onOpenChange: (open: boolean) => void;
  update: Update;
}) {
  const court = hall.courts[courtIndex]!;
  const hours = courtHours(hall, court);
  const narrowed = court.from !== null || court.to !== null;
  const path = (key: keyof CourtDraft) => ["frame", "halls", hallIndex, "courts", courtIndex, key];
  const edit = (recipe: (c: CourtDraft) => void) =>
    update((d) => recipe(d.frame.halls[hallIndex]!.courts[courtIndex]!));

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger
        render={
          <button
            type="button"
            className={`flex flex-col items-center gap-2 rounded-xl bg-card p-4 text-center ring-1 transition-[opacity,box-shadow] duration-200 hover:ring-foreground/30 focus-visible:outline-2 focus-visible:outline-ring ${
              open ? "ring-2 ring-foreground" : "ring-foreground/10"
            } ${dimmed ? "opacity-40" : ""}`}
          />
        }
      >
        <CourtIllustration />
        <span className="font-medium">Court {number}</span>
        <span className="text-xs text-muted-foreground tabular-nums">
          {hours.from && hours.to ? `${hours.from}–${hours.to}` : "Hours not set"} · {umpireText(court.umpires)}
        </span>
      </PopoverTrigger>
      <PopoverContent side="right" align="start" sideOffset={12} className="w-80 gap-4 p-4">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="font-semibold">Court {number}</h3>
          {narrowed ? (
            <button
              type="button"
              className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
              onClick={() => edit((c) => void ((c.from = null), (c.to = null)))}
            >
              Use hall hours
            </button>
          ) : (
            <span className="text-xs text-muted-foreground">Hall hours</span>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <TextField
            label="Available from"
            type="time"
            path={path("from")}
            value={hours.from}
            onChange={(v) => edit((c) => void (c.from = v === hall.from ? null : v))}
          />
          <TextField
            label="Until"
            type="time"
            path={path("to")}
            value={hours.to}
            onChange={(v) => edit((c) => void (c.to = v === hall.to ? null : v))}
          />
        </div>
        <StepperField
          label="Umpires on this court"
          path={path("umpires")}
          value={court.umpires}
          onChange={(v) => edit((c) => void (c.umpires = v))}
        />
        <div className="flex items-center justify-between gap-2 border-t pt-3">
          <Button
            variant="ghost"
            size="sm"
            disabled={courtIndex === 0}
            onClick={() =>
              update((d) => {
                const courts = d.frame.halls[hallIndex]!.courts;
                const previous = courts[courtIndex - 1]!;
                const target = courts[courtIndex]!;
                target.from = previous.from;
                target.to = previous.to;
                target.umpires = previous.umpires;
              })
            }
          >
            <CopyIcon /> Copy from previous court
          </Button>
          <Button
            variant="destructive"
            size="sm"
            disabled={hall.courts.length === 1}
            onClick={() => {
              onOpenChange(false);
              update((d) => void d.frame.halls[hallIndex]!.courts.splice(courtIndex, 1));
            }}
          >
            <TrashIcon /> Delete court
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
