"use client";

import { CopyIcon, TrashIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { courtHours, type CourtDraft, type HallDraft } from "@/lib/tournament/draft";
import { StepperField, TextField } from "./fields";
import type { Update } from "./plan-editor";
import { STAGE_COLOURS, type CourtStatus } from "./timeline";

/** A badminton court seen from above: a green court with white lines (outline, net, service and centre lines). */
function CourtIcon() {
  return (
    <svg viewBox="0 0 61 134" className="h-16 w-auto shrink-0" fill="none" stroke="white" strokeWidth="2" aria-hidden="true">
      <rect x="0" y="0" width="61" height="134" rx="3" fill="var(--surface-feature)" stroke="none" />
      <rect x="1" y="1" width="59" height="132" rx="1" />
      <line x1="5.5" y1="1" x2="5.5" y2="133" />
      <line x1="55.5" y1="1" x2="55.5" y2="133" />
      <line x1="1" y1="8.5" x2="60" y2="8.5" />
      <line x1="1" y1="125.5" x2="60" y2="125.5" />
      <line x1="1" y1="47" x2="60" y2="47" />
      <line x1="1" y1="87" x2="60" y2="87" />
      <line x1="30.5" y1="1" x2="30.5" y2="47" />
      <line x1="30.5" y1="87" x2="30.5" y2="133" />
      <line x1="0" y1="67" x2="61" y2="67" strokeWidth="3.5" />
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
  status,
  update,
}: {
  hall: HallDraft;
  hallIndex: number;
  courtIndex: number;
  number: number;
  open: boolean;
  dimmed: boolean;
  onOpenChange: (open: boolean) => void;
  /** What the court is doing at the timeline's playhead. */
  status: CourtStatus | null;
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
            className={`flex flex-col gap-2 rounded-lg border bg-tile p-3 text-left transition-[opacity,box-shadow,border-color] duration-200 outline-none hover:border-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card ${
              open ? "border-primary ring-1 ring-primary" : "border-tile-border"
            } ${dimmed ? "opacity-40" : ""}`}
          />
        }
      >
        <span className="flex items-center gap-3">
          <CourtIcon />
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="font-display text-[22px] leading-none font-bold text-turf uppercase">Court {number}</span>
            <span className="text-[13px] text-muted-foreground tabular-nums">
              {hours.from && hours.to ? `${hours.from}–${hours.to}` : "Hours not set"}
            </span>
            <span className="text-[13px] text-muted-foreground">{umpireText(court.umpires)}</span>
          </span>
        </span>
        {status ? (
          <span className="flex min-h-5 items-start gap-1.5 border-t border-tile-border pt-2 text-[13px] leading-tight font-medium" data-court-status>
            {status.kind === "playing" ? (
              <>
                <span
                  aria-hidden="true"
                  className={`mt-0.5 size-2.5 shrink-0 rounded-[3px] ring-1 ring-tl-outline ${STAGE_COLOURS[status.stage]}`}
                />
                {status.label}
              </>
            ) : (
              <span className="text-muted-foreground">{status.kind === "free" ? "Free" : "Not booked"}</span>
            )}
          </span>
        ) : null}
      </PopoverTrigger>
      <PopoverContent side="right" align="start" sideOffset={12} className="w-80 gap-4 p-4">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="heading-card text-xl">Court {number}</h3>
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
