"use client";

import { CaretDownIcon, CaretUpIcon, CopyIcon, PushPinIcon, TrashIcon } from "@phosphor-icons/react";
import { createContext, useContext, useState, type KeyboardEvent } from "react";
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
import { TeamName } from "./draw-panel";
import type { Update } from "./plan-editor";
import type { CourtStatus } from "./timeline";

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
  "grid size-6 shrink-0 place-items-center rounded-md text-white outline-none transition-colors hover:bg-white/15 focus-visible:ring-2 focus-visible:ring-white disabled:pointer-events-none disabled:opacity-40 [&_svg]:size-4";

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
  className = "",
  fixed = false,
}: {
  /** Shown, not changed. */
  fixed?: boolean;
  hall: HallDraft;
  court: CourtDraft;
  which: "from" | "to";
  label: string;
  path: PropertyKey[];
  onChange: (value: string) => void;
  className?: string;
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
  if (fixed) return <span className={`px-1 text-xs font-medium tabular-nums ${className}`}>{value || "--:--"}</span>;
  return (
    <span className={`flex items-center gap-1 ${className}`} data-path={pathKey(path)}>
      <span
        role="spinbutton"
        tabIndex={0}
        aria-label={own ? `${label} (own hours)` : label}
        aria-valuetext={value || "Not set"}
        onKeyDown={onKeyDown}
        className={`rounded px-1 text-xs tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-white ${
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

/**
 * How large the venue's courts are drawn: large shows everything; medium drops
 * the name bands and the lighter lines; small is the court's box, its sides
 * and its group, for seeing many halls at once (a click opens the whole court).
 */
export type CourtSize = "large" | "medium" | "small";
/** From the most zoomed out to the most zoomed in. */
export const COURT_SIZES: CourtSize[] = ["small", "medium", "large"];
/** A court card's width at each size, in pixels. */
export const COURT_WIDTH: Record<CourtSize, number> = { large: 200, medium: 160, small: 120 };
/** The size of every court in the venue, and how to change it (a view setting, kept in this browser). */
export const CourtSizeContext = createContext<{ size: CourtSize; setSize: (size: CourtSize) => void }>({
  size: "large",
  setSize: () => {},
});

/** "Group A", "Groups A, C" or "No group". */
function groupText(groups: CourtGroups): string {
  const names = groups.groups.map((g) => g.group).join(", ");
  return groups.groups.length === 0 ? "No group" : `${groups.groups.length > 1 ? "Groups" : "Group"} ${names}`;
}

/** The line along the net, shortened for smaller courts: "Wave 1 · R1/2" becomes "W1". */
function shortNet(text: string): string {
  return text.split(" · ")[0]!.replace(/^Wave /, "W");
}

/**
 * The venue as planned, to look at rather than rebuild (the Draw stage's
 * Schedule page): halls, hours, courts and umpires can't be changed, added or
 * removed. A court's groups still can.
 */
export const VenueFixedContext = createContext(false);

/** Picking a court to show in a side panel (the Draw and Live stages); absent while planning. */
export const CourtSelectionContext = createContext<{ selected: string | null; onSelect: (courtId: string) => void } | null>(
  null,
);

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
  const text = groupText(groups);
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

/** A side in its half of the court: who plays once known, otherwise its draw slot, large. */
function Half({
  code,
  players,
  entryId = null,
  size = "large",
}: {
  code: string | null;
  players: string[];
  /** The entry playing here, opened from its names where there's a side panel. */
  entryId?: string | null;
  size?: CourtSize;
}) {
  const slot = size === "large" ? (code && code.length > 4 ? "text-lg" : "text-[28px]") : size === "medium" ? "text-xl" : "text-sm";
  return (
    <div
      className={`relative z-10 grid flex-1 place-items-center text-center ${
        size === "large" ? "min-h-14 px-3" : size === "medium" ? "min-h-10 px-2" : "min-h-6 px-1"
      }`}
    >
      {players.length > 0 ? (
        <TeamName entryId={entryId} className="flex max-w-full flex-col gap-1 text-center text-xs leading-tight font-semibold">
          {players.map((name) => (
            <span key={name} className="block max-w-full truncate" title={name}>
              {name}
            </span>
          ))}
        </TeamName>
      ) : code ? (
        <span
          className={`max-w-full truncate font-display leading-none font-bold text-balance uppercase ${slot}`}
        >
          {code}
        </span>
      ) : null}
    </div>
  );
}

/** The centre line of one half, from the back line to the front service line, behind the text. */
function CentreLine() {
  return <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-white/50" />;
}

/** The band behind a back line, holding a side's name. */
function NameBand({ text, edge }: { text: string | null; edge: "top" | "bottom" }) {
  return (
    <div
      className={`relative z-10 grid h-7 place-items-center truncate px-3 text-xs font-semibold ${
        edge === "top" ? "border-b" : "border-t"
      } border-white/50`}
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
  size: sizeProp,
}: {
  /** The size to draw it at; the venue's size when not given. */
  size?: CourtSize;
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
  const selection = useContext(CourtSelectionContext);
  const selected = selection?.selected === court.id;
  const fixed = useContext(VenueFixedContext);
  const venueSize = useContext(CourtSizeContext).size;
  const size = sizeProp ?? venueSize;
  const medium = size === "medium";
  const [popupOpen, setPopupOpen] = useState(false);

  // Small: the court's box, its two sides and its group. A click opens the whole court to change it.
  if (size === "small") {
    const card = (
      <>
        <span className="h-5 truncate text-center text-xs leading-5 font-semibold">{groups ? groupText(groups) : null}</span>
        <span className="relative flex min-h-20 flex-col border-2 border-white/90">
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 z-0 grid place-items-center font-display text-[56px] leading-none font-bold text-black/18 mix-blend-multiply select-none"
          >
            {number}
          </span>
          <Half size="small" code={face?.home ?? null} players={face?.homePlayers ?? []} />
          <span aria-hidden="true" className="relative z-10 h-0.5 bg-white" />
          <Half size="small" code={face?.away ?? null} players={face?.awayPlayers ?? []} />
          {spots.map((spot) => (
            <span
              key={spot}
              aria-hidden="true"
              className={`absolute z-20 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-umpire ${SPOTS[spot].className}`}
            />
          ))}
        </span>
      </>
    );
    const about = [
      `Court ${number}`,
      groups ? groupText(groups) : null,
      hours.from && hours.to ? `${hours.from} to ${hours.to}` : "hours not set",
      umpireText(court.umpires),
      status?.kind === "playing" ? status.label : idle,
    ]
      .filter(Boolean)
      .join(", ");
    const shell = `flex flex-col gap-1 rounded-lg bg-court px-2 pt-1 pb-2 text-left text-white outline-none transition-[opacity,box-shadow] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
      status?.kind === "notBooked" ? "opacity-60" : ""
    }`;
    // Where a click picks the court for a side panel (the Draw stage), it still does.
    if (selection) {
      return (
        <button
          type="button"
          aria-pressed={selected}
          aria-label={`${about}. Show in the panel`}
          onClick={() => selection.onSelect(court.id)}
          className={`${shell} cursor-pointer ${selected ? "ring-2 ring-shuttle ring-offset-2 ring-offset-background" : ""}`}
        >
          {card}
        </button>
      );
    }
    return (
      <Popover open={popupOpen} onOpenChange={setPopupOpen}>
        <PopoverTrigger render={<button type="button" aria-label={`${about}. Open to change`} className={`${shell} cursor-pointer`} />}>
          {card}
        </PopoverTrigger>
        <PopoverContent side="right" align="start" className="w-[200px] gap-0 bg-transparent p-0 shadow-lg ring-0">
          <CourtCard
            size="large"
            hall={hall}
            hallIndex={hallIndex}
            courtIndex={courtIndex}
            number={number}
            status={status}
            groups={groups}
            allGroups={allGroups}
            update={update}
          />
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <div
      role="group"
      aria-label={`Court ${number}`}
      aria-describedby={descriptionId}
      onClick={selection ? () => selection.onSelect(court.id) : undefined}
      className={`flex flex-col gap-1 rounded-lg bg-court px-3 pt-1 pb-2 text-white transition-[opacity,box-shadow] ${
        status?.kind === "notBooked" ? "opacity-60" : ""
      } ${selection ? "cursor-pointer" : ""} ${selected ? "ring-2 ring-shuttle ring-offset-2 ring-offset-background" : ""}`}
    >
      {selection ? (
        <button
          type="button"
          aria-pressed={selected}
          onClick={(e) => {
            e.stopPropagation();
            selection.onSelect(court.id);
          }}
          className="sr-only focus:not-sr-only focus:rounded-md focus:bg-shuttle focus:px-2 focus:py-1 focus:text-xs focus:font-semibold focus:text-shuttle-foreground"
        >
          Show court {number} in the panel
        </button>
      ) : null}
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
      <div className="mx-1 flex h-8 items-center justify-between gap-1">
        {fixed ? <span className="size-6 shrink-0" aria-hidden="true" /> : (
        <button
          type="button"
          aria-label={`Copy court ${courtIndex} into court ${number}`}
          title="Copy hours and umpires from the previous court"
          disabled={courtIndex === 0}
          className={`-ml-1 ${SURROUND_BUTTON}`}
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
        )}
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
        {fixed ? <span className="size-6 shrink-0" aria-hidden="true" /> : (
        <button
          type="button"
          aria-label={`Delete court ${number}`}
          title="Delete court"
          disabled={hall.courts.length === 1}
          className={`-mr-1 ${SURROUND_BUTTON}`}
          onClick={() => update((d) => void d.frame.halls[hallIndex]!.courts.splice(courtIndex, 1))}
        >
          <TrashIcon />
        </button>
        )}
      </div>

      {/* The court: outer lines, tramlines, the net band in the middle. */}
      {/* Medium keeps the outer box and the net only, and drops the name bands. */}
      <div
        className={`relative mx-1 flex flex-col border-2 border-white/90 ${medium ? "min-h-40" : "min-h-64"}`}
        data-path={pathKey(path("umpires"))}
      >
        {medium ? null : (
          <>
            <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-[10px] w-px bg-white/50" />
            <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-[10px] w-px bg-white/50" />
          </>
        )}
        <span
          aria-hidden="true"
          className={`pointer-events-none absolute inset-0 z-0 grid place-items-center font-display leading-none font-bold text-black/18 mix-blend-multiply select-none ${
            medium ? "text-[96px]" : "text-[132px]"
          }`}
        >
          {number}
        </span>

        <div className="relative flex flex-1 flex-col">
          {medium ? null : <CentreLine />}
          {medium ? null : <NameBand edge="top" text={face?.homeLabel ?? null} />}
          <Half size={size} code={face?.home ?? null} players={face?.homePlayers ?? []} entryId={face?.homeEntryId} />
        </div>
        {/* The net band: one line above the net, an equal space below, so the net stays mid-court. */}
        <div className={`relative z-10 flex flex-col ${medium ? "" : "border-y border-white/50"}`}>
          <p className={`flex items-center justify-center px-2 text-xs font-semibold ${medium ? "h-5" : "h-7"}`}>
            <span className="truncate">{face ? (medium ? shortNet(face.net) : face.net) : (idle ?? (medium ? "No estimate" : "No estimate yet"))}</span>
          </p>
          <span aria-hidden="true" className="h-[3px] bg-white" />
          <span aria-hidden="true" className={medium ? "h-5" : "h-7"} />
        </div>
        <div className="relative flex flex-1 flex-col">
          {medium ? null : <CentreLine />}
          <Half size={size} code={face?.away ?? null} players={face?.awayPlayers ?? []} entryId={face?.awayEntryId} />
          {medium ? null : <NameBand edge="bottom" text={face?.awayLabel ?? null} />}
        </div>

        {UMPIRE_SPOTS.map((spot) => {
          const on = spots.includes(spot);
          if (fixed) {
            // Shown where they stand; the venue isn't changed here.
            return on ? (
              <span
                key={spot}
                aria-hidden="true"
                className={`absolute z-20 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-umpire ring-2 ring-umpire ${SPOTS[spot].className}`}
              />
            ) : null;
          }
          return (
            <button
              key={spot}
              type="button"
              aria-pressed={on}
              aria-label={`Umpire at the ${SPOTS[spot].name}`}
              title={on ? "Remove umpire" : "Add umpire"}
              onClick={() => edit((c) => toggleUmpire(c, spot))}
              // The button is a square around the circle, 4px larger all round and not drawn: hovering or clicking anywhere in it counts.
              className={`group/spot absolute z-20 grid size-6 -translate-x-1/2 -translate-y-1/2 cursor-pointer place-items-center outline-none ${SPOTS[spot].className}`}
            >
              <span
                className={`size-3 rounded-full ring-2 outline-offset-4 outline-white transition-colors group-focus-visible/spot:outline-2 ${
                  on ? "bg-umpire ring-umpire" : "bg-court ring-white/70 group-hover/spot:ring-umpire"
                }`}
              />
            </button>
          );
        })}
      </div>

      {/* Surround, bottom: the court's hours. */}
      <div className="mx-1 flex items-center justify-between gap-1 pt-1">
        <CourtTime
          hall={hall}
          court={court}
          which="from"
          label={`Court ${number} starts`}
          className="-ml-1"
          fixed={fixed}
          path={path("from")}
          onChange={(v) => edit((c) => setCourtTime(hall, c, "from", v))}
        />
        <span aria-hidden="true" className="text-xs">
          –
        </span>
        <CourtTime
          hall={hall}
          court={court}
          which="to"
          label={`Court ${number} ends`}
          className="-mr-1"
          fixed={fixed}
          path={path("to")}
          onChange={(v) => edit((c) => setCourtTime(hall, c, "to", v))}
        />
      </div>
    </div>
  );
}
