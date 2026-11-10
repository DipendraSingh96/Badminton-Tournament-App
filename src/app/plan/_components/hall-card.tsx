"use client";

import {
  FlipHorizontalIcon,
  MagnifyingGlassMinusIcon,
  MagnifyingGlassPlusIcon,
  CaretDownIcon,
  CheckCircleIcon,
  CopySimpleIcon,
  PlusIcon,
  TrashIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import { useContext, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useConfirm } from "@/components/ui/confirm";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { bandCoverage, type CourtGroups, type Span } from "@/engine";
import {
  courtNumber,
  emptyBand,
  emptyCourt,
  hallName,
  keepOneRate,
  newId,
  removeBand,
  setBandTime,
  setHallWindow,
  splitRates,
  steppedHallTime,
  type HallDraft,
  type PlanDraft,
  type RateBandDraft,
} from "@/lib/tournament/draft";
import { clock, minutesOfDay } from "@/lib/tournament/time";
import { BandTrack } from "./hall-track";
import { COURT_SIZES, COURT_WIDTH, CourtCard, CourtSizeContext, type GroupOption } from "./court-card";
import { CourtStrip } from "./court-strip";
import type { CourtStatus } from "./timeline";
import { IconButton, InfoTip, NumberField, StepperField, TextField } from "./fields";
import { InlineNumber, InlineTime } from "./inline-fields";
import type { Update } from "./plan-editor";
import { ViewRangeContext } from "./time-window";

/** Problems with a hall's bands, worked out live for the status line. */
function bandProblems(hall: HallDraft): string[] | null {
  const open = minutesOfDay(hall.from);
  const close = minutesOfDay(hall.to);
  if (open === null || close === null || close <= open) return null;
  const spans: Span[] = [];
  const problems: string[] = [];
  hall.bands.forEach((band) => {
    const from = minutesOfDay(band.from);
    const to = minutesOfDay(band.to);
    if (from === null || to === null) return;
    if (to <= from) problems.push(`A band ends before it starts (${band.from} to ${band.to})`);
    else if (from < open || to > close) problems.push(`A band runs outside the hall's hours (${band.from} to ${band.to})`);
    else spans.push({ from, to });
  });
  const coverage = bandCoverage({ from: open, to: close }, spans);
  problems.push(
    ...coverage.gaps.map((g) => `No band covers ${clock(g.from)} to ${clock(g.to)}`),
    ...coverage.overlaps.map((o) => `Bands overlap from ${clock(o.from)} to ${clock(o.to)}`),
  );
  return problems;
}

function HallSettings({
  draft,
  hall,
  hallIndex,
  update,
}: {
  draft: PlanDraft;
  hall: HallDraft;
  hallIndex: number;
  update: Update;
}) {
  const [selectedBand, setSelectedBand] = useState<number | null>(null);
  const confirm = useConfirm();
  const problems = bandProblems(hall);
  const path = (...rest: PropertyKey[]) => ["frame", "halls", hallIndex, ...rest];
  const editHall = (recipe: (h: HallDraft) => void) => update((d) => recipe(d.frame.halls[hallIndex]!));
  const editBand =
    <K extends keyof RateBandDraft>(i: number, key: K) =>
    (value: RateBandDraft[K]) =>
      editHall((h) => void (h.bands[i]![key] = value));

  /** Set the hall's hours; bands on a moved edge (or a single band) move with them. */
  function setHours(key: "from" | "to", value: string) {
    editHall((h) => setHallWindow(h, key === "from" ? value : h.from, key === "to" ? value : h.to));
  }

  /** A band's time; the hall's hours follow its bands. */
  const editBandTime = (i: number, key: "from" | "to") => (value: string) => editHall((h) => setBandTime(h, i, key, value));

  return (
    <div className="flex flex-col gap-4 rounded-lg bg-card-system p-4">
      <div>
        <div className="grid grid-cols-[9rem_9rem_minmax(0,13rem)_minmax(0,12rem)] gap-x-2 gap-y-3">
          <TextField label="Opens" type="time" path={path("from")} value={hall.from} onChange={(v) => setHours("from", v)} />
          <TextField label="Closes" type="time" path={path("to")} value={hall.to} onChange={(v) => setHours("to", v)} />
          <StepperField
            label="Time unit (min)"
            hint="The time the hall charges by, e.g. 60, 40 or 30 minutes. Hall hours, band edges and court hours must fall on these steps from opening."
            min={1}
            path={path("unitMinutes")}
            value={hall.unitMinutes}
            onChange={(v) => editHall((h) => void (h.unitMinutes = v))}
          />
          {!hall.multipleRates ? (
            <NumberField
              label={rateLabel(hall.unitMinutes)}
              path={path("bands", 0, "rate")}
              value={hall.bands[0]?.rate ?? null}
              onChange={(v) =>
                editHall((h) => {
                  if (h.bands.length === 0) h.bands.push({ ...emptyBand(), from: h.from, to: h.to });
                  h.bands[0]!.rate = v;
                })
              }
            />
          ) : null}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Checkbox
          id={`${hall.id}-rates`}
          checked={hall.multipleRates}
          onCheckedChange={async (on) => {
            if (on) {
              editHall(splitRates);
              return;
            }
            if (
              hall.bands.length > 1 &&
              !(await confirm({
                title: "Use one rate all day?",
                body: "The other bands will be removed.",
                action: "Remove bands",
                destructive: true,
              }))
            )
              return;
            editHall(keepOneRate);
          }}
        />
        <Label htmlFor={`${hall.id}-rates`}>Rate changes during the day</Label>
        <InfoTip about="rates during the day">
          For halls with different rates at different times, e.g. off-peak and peak. Drag on the day to set each band, or type its times below; together the bands set the hall&apos;s hours.
        </InfoTip>
      </div>

      {hall.multipleRates ? (
        <>
        <ViewRangeContext value={DAY_TRACK}>
        <div className="flex flex-col gap-2">
          <BandTrack
            draft={draft}
            hallIndex={hallIndex}
            update={update}
            className="h-8 rounded-md bg-muted/40"
            selected={selectedBand}
            onSelectBand={setSelectedBand}
          />
          <HallTicks hall={hall} />
        </div>
        </ViewRangeContext>

        <div className="flex flex-col gap-2">
          {hall.bands.map((band, i) => (
            <div
              key={band.id}
              className={`grid grid-cols-[repeat(4,minmax(0,12rem))_auto] items-end gap-2 rounded-lg ${
                selectedBand === i ? "outline-1 outline-offset-4 outline-foreground/30" : ""
              }`}
            >
              <TextField label="Band name" placeholder={`Band ${i + 1}`} path={path("bands", i, "name")} value={band.name} onChange={editBand(i, "name")} />
              <TextField label="From" type="time" path={path("bands", i, "from")} value={band.from} onChange={editBandTime(i, "from")} />
              <TextField label="Until" type="time" path={path("bands", i, "to")} value={band.to} onChange={editBandTime(i, "to")} />
              <NumberField
                label={rateLabel(hall.unitMinutes)}
                path={path("bands", i, "rate")}
                value={band.rate}
                onChange={editBand(i, "rate")}
              />
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Remove ${band.name || `band ${i + 1}`}`}
                disabled={hall.bands.length === 1 && band.from === "" && band.to === ""}
                onClick={() => {
                  setSelectedBand(null);
                  editHall((h) => removeBand(h, i));
                }}
              >
                <TrashIcon />
              </Button>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button variant="outline" size="sm" onClick={() => editHall((h) => void h.bands.push(emptyBand()))}>
            <PlusIcon /> Add band
          </Button>
          {problems === null ? null : problems.length === 0 ? (
            <p className="flex items-center gap-2 text-sm text-fits-text">
              <CheckCircleIcon weight="fill" /> Bands cover the hall&apos;s hours with no overlap
            </p>
          ) : (
            <ul className="flex flex-col gap-1 text-sm text-over-text">
              {problems.map((p) => (
                <li key={p} className="flex items-center gap-2">
                  <WarningCircleIcon weight="fill" /> {p}
                </li>
              ))}
            </ul>
          )}
        </div>
        </>
      ) : null}
    </div>
  );
}

/** The rate-band track: always 06:00 to midnight, so it never shifts (a view of the day, not a tournament value). */
const DAY_TRACK = { range: { start: 6 * 60, end: 24 * 60 }, setDragging: () => {} };

/**
 * Times under the rate-band track: the hall's hours and band edges, and the
 * day's scale every three hours (dimmer, and left out where an edge is close).
 */
function HallTicks({ hall }: { hall: HallDraft }) {
  const { range } = useContext(ViewRangeContext);
  const span = Math.max(1, range.end - range.start);
  const edges = [...new Set([hall.from, hall.to, ...hall.bands.flatMap((b) => [b.from, b.to])])]
    .map(minutesOfDay)
    .filter((m): m is number => m !== null && m >= range.start && m <= range.end);
  const scale: number[] = [];
  for (let m = Math.ceil(range.start / 180) * 180; m <= range.end; m += 180) {
    if (!edges.some((e) => Math.abs(e - m) < 75)) scale.push(m);
  }
  const ticks = [...edges.map((m) => ({ m, edge: true })), ...scale.map((m) => ({ m, edge: false }))].sort((a, b) => a.m - b.m);
  return (
    <div className="relative h-4 text-xs tabular-nums" aria-hidden="true">
      {ticks.map(({ m, edge }) => (
        <span
          key={m}
          className={`absolute ${m === range.start ? "" : m === range.end ? "-translate-x-full" : "-translate-x-1/2"} ${
            edge ? "text-foreground" : "text-muted-foreground"
          }`}
          style={{ left: `${((m - range.start) / span) * 100}%` }}
        >
          {m === 24 * 60 ? "24:00" : clock(m)}
        </span>
      ))}
    </div>
  );
}

/** "£ per court per hour", or per the hall's unit, e.g. "£ per court per 40 min". */
function rateLabel(unitMinutes: number | null): string {
  if (unitMinutes === 60) return "£ per court per hour";
  return unitMinutes ? `£ per court per ${unitMinutes} min` : "£ per court per unit";
}

export function HallCard({
  draft,
  hallIndex,
  update,
  statuses,
  courtGroups,
  allGroups,
}: {
  draft: PlanDraft;
  hallIndex: number;
  update: Update;
  /** Every group of the tournament, for the courts' group menus. */
  allGroups: GroupOption[];
  /** Each court's groups when groups keep their own courts; null when courts are shared. */
  courtGroups: Map<string, CourtGroups> | null;
  statuses: Map<string, CourtStatus> | null;
}) {
  const hall = draft.frame.halls[hallIndex]!;
  // The hours, unit and rate are set in the heading's line; the panel under it is for rate bands.
  const [settingsOpen, setSettingsOpen] = useState(hall.multipleRates);
  const [copyOpen, setCopyOpen] = useState(false);
  const confirm = useConfirm();
  // The courts' size is one setting for the whole venue; every hall's line can change it.
  const { size, setSize } = useContext(CourtSizeContext);
  const sizeStep = COURT_SIZES.indexOf(size);
  const path = (...rest: PropertyKey[]) => ["frame", "halls", hallIndex, ...rest];
  const editHall = (recipe: (h: HallDraft) => void) => update((d) => recipe(d.frame.halls[hallIndex]!));
  const setHours = (key: "from" | "to") => (value: string) =>
    editHall((h) => setHallWindow(h, key === "from" ? value : h.from, key === "to" ? value : h.to));

  const name = hallName(hall, hallIndex);
  const others = draft.frame.halls
    .map((h, i) => ({ hall: h, index: i }))
    .filter(({ index }) => index !== hallIndex);

  async function copyFrom(index: number) {
    const source = draft.frame.halls[index];
    if (!source) return;
    setCopyOpen(false);
    if (
      !(await confirm({
        title: `Copy ${hallName(source, index)} into ${name}?`,
        body: `${name}'s hours, rates and courts are replaced with ${hallName(source, index)}'s.`,
        action: "Replace",
        destructive: true,
      }))
    )
      return;
    update((d) => {
      const h = d.frame.halls[hallIndex]!;
      h.from = source.from;
      h.to = source.to;
      h.unitMinutes = source.unitMinutes;
      h.multipleRates = source.multipleRates;
      h.bands = source.bands.map((b) => ({ ...b, id: newId() }));
      h.courts = source.courts.map((c) => ({ ...c, id: newId() }));
    });
  }

  return (
    <section className="flex flex-col gap-3 border-t pt-4 first:border-t-0 first:pt-0">
      <header className="flex items-center gap-2">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-1 gap-y-1">
          <input
            aria-label="Hall name"
            value={hall.name}
            placeholder={name}
            onChange={(e) => update((d) => void (d.frame.halls[hallIndex]!.name = e.target.value))}
            className="heading-card -mx-2 field-sizing-content max-w-full min-w-[4ch] rounded-md bg-transparent px-2 py-1 outline-none placeholder:text-foreground hover:bg-inset focus-visible:bg-inset focus-visible:ring-2 focus-visible:ring-ring"
          />
          <IconButton
            label={settingsOpen ? `Hide ${name} settings` : `${name} settings`}
            aria-expanded={settingsOpen}
            data-hall-settings={hallIndex}
            onClick={() => setSettingsOpen((v) => !v)}
          >
            <CaretDownIcon weight="bold" className={`transition-transform motion-reduce:transition-none ${settingsOpen ? "rotate-180" : ""}`} />
          </IconButton>
          {/* The hall's settings in a line; the panel under it holds the same values. */}
          <div className="ml-1 flex flex-wrap items-center gap-x-3 gap-y-1">
            <InlineTime
              label="Opens"
              path={path("from")}
              value={hall.from}
              onChange={setHours("from")}
              earlier={steppedHallTime(hall, "from", -1)}
              later={steppedHallTime(hall, "from", 1)}
            />
            <InlineTime
              label="Closes"
              path={path("to")}
              value={hall.to}
              onChange={setHours("to")}
              earlier={steppedHallTime(hall, "to", -1)}
              later={steppedHallTime(hall, "to", 1)}
            />
            <InlineNumber
              label="Time unit"
              path={path("unitMinutes")}
              value={hall.unitMinutes}
              onChange={(v) => editHall((h) => void (h.unitMinutes = v))}
              after="min"
              min={1}
              whole
            />
            {hall.multipleRates ? (
              <span className="flex items-center gap-1 text-sm">
                <span className="text-muted-foreground">Rate</span>
                <button
                  type="button"
                  onClick={() => setSettingsOpen(true)}
                  className="rounded-sm px-1 outline-none hover:bg-inset focus-visible:bg-inset focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {hall.bands.length} rate {hall.bands.length === 1 ? "band" : "bands"}
                </button>
              </span>
            ) : (
              <InlineNumber
                label="Rate"
                path={path("bands", 0, "rate")}
                value={hall.bands[0]?.rate ?? null}
                onChange={(v) =>
                  editHall((h) => {
                    if (h.bands.length === 0) h.bands.push({ ...emptyBand(), from: h.from, to: h.to });
                    h.bands[0]!.rate = v;
                  })
                }
                before="£"
              />
            )}
            <span className="text-sm text-muted-foreground tabular-nums">
              {hall.courts.length} {hall.courts.length === 1 ? "court" : "courts"}
            </span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
            <span className="flex items-center">
              <IconButton
                label="Smaller courts, to see more halls"
                disabled={sizeStep === 0}
                onClick={() => setSize(COURT_SIZES[sizeStep - 1]!)}
              >
                <MagnifyingGlassMinusIcon />
              </IconButton>
              <IconButton
                label="Larger courts, with more detail"
                disabled={sizeStep === COURT_SIZES.length - 1}
                onClick={() => setSize(COURT_SIZES[sizeStep + 1]!)}
              >
                <MagnifyingGlassPlusIcon />
              </IconButton>
            </span>
          {others.length > 0 ? (
            <Popover open={copyOpen} onOpenChange={setCopyOpen}>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <PopoverTrigger
                      render={<Button variant="ghost" size="icon" aria-label={`Copy another hall into ${name}`} />}
                    />
                  }
                >
                  <CopySimpleIcon />
                </TooltipTrigger>
                <TooltipContent>Copy from another hall</TooltipContent>
              </Tooltip>
              <PopoverContent align="end" className="w-60 gap-1 p-2">
                <p className="px-2 py-1 text-xs font-semibold text-muted-foreground">Copy hours, rates and courts from</p>
                {others.map(({ hall: other, index }) => (
                  <button
                    key={other.id}
                    type="button"
                    onClick={() => copyFrom(index)}
                    className="rounded-md px-2 py-2 text-left text-sm font-medium outline-none hover:bg-inset focus-visible:bg-inset focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {hallName(other, index)}
                  </button>
                ))}
              </PopoverContent>
            </Popover>
          ) : null}
          <IconButton
            label={hall.flipped ? `${name} is drawn right to left. Flip back` : `Flip ${name}: draw its courts right to left`}
            aria-pressed={Boolean(hall.flipped)}
            onClick={() => update((d) => void (d.frame.halls[hallIndex]!.flipped = !d.frame.halls[hallIndex]!.flipped))}
          >
            <FlipHorizontalIcon weight={hall.flipped ? "fill" : "regular"} />
          </IconButton>
          {draft.frame.halls.length > 1 ? (
            <IconButton
              label={`Delete ${name}`}
              onClick={async () => {
                if (!(await confirm({ title: `Delete ${name}?`, body: "Its courts go with it.", action: "Delete hall", destructive: true })))
                  return;
                update((d) => void d.frame.halls.splice(hallIndex, 1));
              }}
            >
              <TrashIcon />
            </IconButton>
          ) : null}
        </div>
      </header>

      {settingsOpen ? <HallSettings draft={draft} hall={hall} hallIndex={hallIndex} update={update} /> : null}

      <CourtStrip count={hall.courts.length} width={COURT_WIDTH[size]} reversed={Boolean(hall.flipped)}>
        {hall.courts.map((court, i) => (
          <CourtCard
            key={court.id}
            hall={hall}
            hallIndex={hallIndex}
            courtIndex={i}
            number={courtNumber(draft.frame.halls, hallIndex, i)}
            status={statuses?.get(court.id) ?? null}
            groups={courtGroups?.get(court.id) ?? null}
            allGroups={allGroups}
            update={update}
          />
        ))}
        <button
          type="button"
          onClick={() => update((d) => void d.frame.halls[hallIndex]!.courts.push(emptyCourt()))}
          className={`flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed ${
            size === "large" ? "min-h-80" : size === "medium" ? "min-h-56" : "min-h-28"
          } border-foreground/30 bg-background text-sm font-semibold text-foreground transition-colors outline-none hover:border-foreground/60 hover:bg-inset focus-visible:ring-2 focus-visible:ring-ring`}
        >
          <PlusIcon className="size-5" /> Add court
        </button>
      </CourtStrip>
    </section>
  );
}
