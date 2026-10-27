"use client";

import { CaretDownIcon, CaretUpIcon, CopyIcon, PushPinIcon, TrashIcon } from "@phosphor-icons/react";
import { useState, type KeyboardEvent } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { CourtGroups } from "@/engine";
import {
  UMPIRE_SPOTS,
  courtHours,
  setCourtGroup,
  setCourtTime,
  steppedCourtTime,
  toggleUmpire,
  umpireSpots,
  type CourtDraft,
  type HallDraft,
  type UmpireSpot,
} from "@/lib/tournament/draft";
import { pathKey } from "./fields";
import type { Update } from "./plan-editor";
import { STAGE_COLOURS, type CourtStatus } from "./timeline";

/** Where each umpire spot sits on the court, and what it's called. */
const SPOTS: Record<UmpireSpot, { className: string; name: string }> = {
  topLeft: { className: "top-0 left-0", name: "top left corner" },
  topRight: { className: "top-0 left-full", name: "top right corner" },
  netLeft: { className: "top-1/2 left-0", name: "left end of the net" },
  netRight: { className: "top-1/2 left-full", name: "right end of the net" },
  bottomLeft: { className: "top-full left-0", name: "bottom left corner" },
  bottomRight: { className: "top-full left-full", name: "bottom right corner" },
};

/** Small icon buttons in the court's surround: white on court green. */
const SURROUND_BUTTON =
  "grid size-7 shrink-0 place-items-center rounded-md text-white outline-none transition-colors hover:bg-white/15 focus-visible:ring-2 focus-visible:ring-white disabled:pointer-events-none disabled:opacity-40 [&_svg]:size-4";

function umpireText(umpires: number | null): string {
  if (umpires === null) return "Umpires not set";
  return `${umpires} ${umpires === 1 ? "umpire" : "umpires"}`;
}

/**
 * One end of a court's time: the time, with chevrons that move it by the hall's
 * charging unit. Arrow keys do the same when it has focus.
 */
function CourtTime({
  hall,
  court,
  which,
  label,
  path,
  onChange,
}: {
  hall: HallDraft;
  court: CourtDraft;
  which: "from" | "to";
  label: string;
  path: PropertyKey[];
  onChange: (value: string) => void;
}) {
  const value = courtHours(hall, court)[which];
  const later = steppedCourtTime(hall, court, which, 1);
  const earlier = steppedCourtTime(hall, court, which, -1);
  const own = court[which] !== null;
  function onKeyDown(event: KeyboardEvent) {
    const next = event.key === "ArrowUp" ? later : event.key === "ArrowDown" ? earlier : null;
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    event.preventDefault();
    if (next) onChange(next);
  }
  return (
    <span className="flex items-center gap-1" data-path={pathKey(path)}>
      <span
        role="spinbutton"
        tabIndex={0}
        aria-label={own ? `${label} (own hours)` : label}
        aria-valuetext={value || "Not set"}
        onKeyDown={onKeyDown}
        className={`rounded px-1 text-[13px] tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-white ${
          own ? "font-bold" : "font-medium"
        }`}
      >
        {value || "--:--"}
      </span>
      <span className="flex flex-col">
        <button
          type="button"
          tabIndex={-1}
          aria-label={`${label} later`}
          disabled={!later}
          onClick={() => later && onChange(later)}
          className="grid h-3.5 w-5 place-items-center rounded-sm text-white/85 outline-none hover:bg-white/15 hover:text-white disabled:opacity-30"
        >
          <CaretUpIcon weight="bold" className="size-3" />
        </button>
        <button
          type="button"
          tabIndex={-1}
          aria-label={`${label} earlier`}
          disabled={!earlier}
          onClick={() => earlier && onChange(earlier)}
          className="grid h-3.5 w-5 place-items-center rounded-sm text-white/85 outline-none hover:bg-white/15 hover:text-white disabled:opacity-30"
        >
          <CaretDownIcon weight="bold" className="size-3" />
        </button>
      </span>
    </span>
  );
}

/** A group of the tournament, for the courts' group menus. */
export interface GroupOption {
  /** "categoryId:groupIndex". */
  key: string;
  label: string;
  /** The courts it plays on now: "C1, C2". */
  courts: string;
}

/**
 * The court's groups in the group stage, as a menu: give the court to one of
 * the hall's groups, or back to the automatic split.
 */
function GroupMenu({
  number,
  groups,
  allGroups,
  onChoose,
}: {
  number: number;
  groups: CourtGroups;
  allGroups: GroupOption[];
  /** A group's key, "" for no group, or null for the automatic split. */
  onChoose: (key: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const names = groups.groups.map((g) => g.group).join(", ");
  const text = groups.groups.length === 0 ? "No group" : `${groups.groups.length > 1 ? "Groups" : "Group"} ${names}`;
  const choose = (key: string | null) => {
    setOpen(false);
    onChoose(key);
  };
  const current = !groups.pinned
    ? null
    : groups.groups[0]
      ? `${groups.groups[0].categoryId}:${groups.groups[0].groupIndex}`
      : "";
  const optionClass =
    "flex items-baseline justify-between gap-2 rounded-md px-2 py-2 text-left text-sm font-medium outline-none hover:bg-inset focus-visible:bg-inset focus-visible:ring-2 focus-visible:ring-ring aria-pressed:bg-accent";
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <button
            type="button"
            aria-label={`Court ${number} plays ${groups.groups.length === 0 ? "no group" : text}${groups.pinned ? ", given by hand" : ""}. Change`}
            className="flex min-w-0 items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-white outline-none hover:bg-white/15 focus-visible:ring-2 focus-visible:ring-white"
          />
        }
      >
        {groups.pinned ? <PushPinIcon weight="fill" className="size-3.5 shrink-0" aria-hidden="true" /> : null}
        <span className="truncate">{text}</span>
        <CaretDownIcon weight="bold" className="size-3 shrink-0" aria-hidden="true" />
      </PopoverTrigger>
      <PopoverContent align="center" className="max-h-96 w-64 gap-1 overflow-y-auto p-2">
        <p className="px-2 py-1 text-xs font-semibold text-muted-foreground">Group stage on court {number}</p>
        {allGroups.map((g) => (
          <button key={g.key} type="button" aria-pressed={current === g.key} onClick={() => choose(g.key)} className={optionClass}>
            <span>{g.label}</span>
            <span className="shrink-0 text-xs font-normal text-muted-foreground tabular-nums">{g.courts || "No court"}</span>
          </button>
        ))}
        <span className="my-1 h-px bg-border" aria-hidden="true" />
        <button type="button" aria-pressed={current === ""} onClick={() => choose("")} className={optionClass}>
          No group
        </button>
        <button type="button" aria-pressed={current === null} onClick={() => choose(null)} className={optionClass}>
          <span>
            Automatic split
            <span className="block text-xs font-normal text-muted-foreground">Shared out by each group&apos;s matches</span>
          </span>
        </button>
      </PopoverContent>
    </Popover>
  );
}

/** A side's draw slot, large, in its half of the court. */
function Half({ code }: { code: string | null }) {
  return (
    <div className="relative z-10 grid min-h-14 flex-1 place-items-center px-3 text-center">
      {code ? (
        <span
          className={`font-display leading-none font-bold text-balance uppercase ${code.length > 4 ? "text-lg" : "text-[28px]"}`}
        >
          {code}
        </span>
      ) : null}
    </div>
  );
}

/** The band behind a back line, holding a side's name. */
function NameBand({ text, edge }: { text: string | null; edge: "top" | "bottom" }) {
  return (
    <div
      className={`relative z-10 grid h-7 place-items-center truncate px-3 text-xs font-semibold ${
        edge === "top" ? "border-b-2" : "border-t-2"
      } border-white/90`}
    >
      {text}
    </div>
  );
}

/**
 * A court drawn from above, after the organiser's wireframe: copy and delete
 * in the surround, each side's name and draw slot at its end, the group and
 * wave along the net, the court's number as a watermark, umpire spots to
 * toggle, and the court's hours to step underneath.
 */
export function CourtCard({
  hall,
  hallIndex,
  courtIndex,
  number,
  status,
  groups,
  allGroups,
  update,
}: {
  hall: HallDraft;
  hallIndex: number;
  courtIndex: number;
  number: number;
  /** What the court is doing at the timeline's playhead. */
  status: CourtStatus | null;
  /** The court's groups when groups keep their own courts; null when courts are shared. */
  groups: CourtGroups | null;
  /** Every group of the tournament, for its group menu. */
  allGroups: GroupOption[];
  update: Update;
}) {
  const court = hall.courts[courtIndex]!;
  const spots = umpireSpots(court);
  const path = (key: keyof CourtDraft) => ["frame", "halls", hallIndex, "courts", courtIndex, key];
  const edit = (recipe: (c: CourtDraft) => void) =>
    update((d) => recipe(d.frame.halls[hallIndex]!.courts[courtIndex]!));
  const face = status?.kind === "playing" ? status.face : null;
  const idle = status?.kind === "free" ? "Free" : status?.kind === "notBooked" ? "Not booked" : null;
  const hours = courtHours(hall, court);
  const descriptionId = `court-${court.id}-about`;

  return (
    <div
      role="group"
      aria-label={`Court ${number}`}
      aria-describedby={descriptionId}
      className={`flex flex-col gap-1 rounded-lg bg-court px-3 pt-1 pb-2 text-white transition-opacity ${
        status?.kind === "notBooked" ? "opacity-60" : ""
      }`}
    >
      <p id={descriptionId} className="sr-only">
        {[
          hours.from && hours.to ? `${hours.from} to ${hours.to}` : "Hours not set",
          umpireText(court.umpires),
          status?.kind === "playing" ? status.label : idle,
        ]
          .filter(Boolean)
          .join(". ")}
      </p>

      {/* Surround, top: copy and delete, with the court's groups (or a missing count) between. */}
      <div className="flex h-8 items-center justify-between gap-1">
        <button
          type="button"
          aria-label={`Copy court ${courtIndex} into court ${number}`}
          title="Copy hours and umpires from the previous court"
          disabled={courtIndex === 0}
          className={SURROUND_BUTTON}
          onClick={() =>
            update((d) => {
              const courts = d.frame.halls[hallIndex]!.courts;
              const previous = courts[courtIndex - 1]!;
              const target = courts[courtIndex]!;
              target.from = previous.from;
              target.to = previous.to;
              target.umpires = previous.umpires;
              target.umpireSpots = previous.umpireSpots ? [...previous.umpireSpots] : undefined;
            })
          }
        >
          <CopyIcon />
        </button>
        {groups ? (
          <GroupMenu
            number={number}
            groups={groups}
            allGroups={allGroups}
            onChoose={(key) => update((d) => setCourtGroup(d, court.id, key))}
          />
        ) : (
          <span className="truncate text-xs font-semibold text-white/85">
            {court.umpires === null ? "Umpires not set" : null}
          </span>
        )}
        <button
          type="button"
          aria-label={`Delete court ${number}`}
          title="Delete court"
          disabled={hall.courts.length === 1}
          className={SURROUND_BUTTON}
          onClick={() => update((d) => void d.frame.halls[hallIndex]!.courts.splice(courtIndex, 1))}
        >
          <TrashIcon />
        </button>
      </div>

      {/* The court: outer lines, tramlines, the net band in the middle. */}
      <div className="relative mx-1 flex min-h-64 flex-col border-2 border-white/90" data-path={pathKey(path("umpires"))}>
        <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-2 w-px bg-white/60" />
        <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-2 w-px bg-white/60" />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-0 grid place-items-center font-display text-[132px] leading-none font-bold text-black/18 mix-blend-multiply select-none"
        >
          {number}
        </span>

        <NameBand edge="top" text={face?.homeLabel ?? null} />
        <Half code={face?.home ?? null} />
        {/* The net band: one line above the net, an equal space below, so the net stays mid-court. */}
        <div className="relative z-10 flex flex-col border-y-2 border-white/90">
          <p className="flex h-7 items-center justify-center gap-2 px-2 text-[13px] font-semibold">
            {status?.kind === "playing" ? (
              <span aria-hidden="true" className={`size-2.5 shrink-0 rounded-[3px] ring-1 ring-white/70 ${STAGE_COLOURS[status.stage]}`} />
            ) : null}
            <span className="truncate">{face?.net ?? idle ?? "No estimate yet"}</span>
          </p>
          <span aria-hidden="true" className="h-[3px] bg-white" />
          <span aria-hidden="true" className="h-7" />
        </div>
        <Half code={face?.away ?? null} />
        <NameBand edge="bottom" text={face?.awayLabel ?? null} />

        {UMPIRE_SPOTS.map((spot) => {
          const on = spots.includes(spot);
          return (
            <button
              key={spot}
              type="button"
              aria-pressed={on}
              aria-label={`Umpire at the ${SPOTS[spot].name}`}
              title={on ? "Remove umpire" : "Add umpire"}
              onClick={() => edit((c) => toggleUmpire(c, spot))}
              className={`absolute z-20 grid size-6 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-white ${SPOTS[spot].className}`}
            >
              <span
                className={`size-3 rounded-full ring-2 transition-colors ${
                  on ? "bg-umpire ring-white" : "bg-court ring-white/70 hover:ring-white"
                }`}
              />
            </button>
          );
        })}
      </div>

      {/* Surround, bottom: the court's hours. */}
      <div className="flex items-center justify-center gap-1 pt-1">
        <CourtTime
          hall={hall}
          court={court}
          which="from"
          label={`Court ${number} starts`}
          path={path("from")}
          onChange={(v) => edit((c) => setCourtTime(hall, c, "from", v))}
        />
        <span aria-hidden="true" className="text-[13px]">
          –
        </span>
        <CourtTime
          hall={hall}
          court={court}
          which="to"
          label={`Court ${number} ends`}
          path={path("to")}
          onChange={(v) => edit((c) => setCourtTime(hall, c, "to", v))}
        />
      </div>
    </div>
  );
}
