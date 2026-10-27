"use client";

import {
  CaretDownIcon,
  CheckCircleIcon,
  CopySimpleIcon,
  EraserIcon,
  PlusIcon,
  TrashIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import { useContext, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { bandCoverage, type CourtGroups, type Span } from "@/engine";
import {
  clearHall,
  courtNumber,
  emptyBand,
  emptyCourt,
  hallName,
  keepOneRate,
  newId,
  setHallWindow,
  type HallDraft,
  type PlanDraft,
  type RateBandDraft,
} from "@/lib/tournament/draft";
import { clock, minutesOfDay } from "@/lib/tournament/time";
import { HallTrack } from "./hall-track";
import { CourtCard, type HallGroup } from "./court-card";
import type { CourtStatus } from "./timeline";
import { IconButton, InfoTip, NumberField, StepperField, TextField } from "./fields";
import { categoryName, formatMoney } from "./labels";
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

  return (
    <div className="flex flex-col gap-4 rounded-lg bg-inset p-4">
      <div>
        <div className={`grid gap-3 ${hall.multipleRates ? "grid-cols-[1fr_1fr_8.5rem]" : "grid-cols-[1fr_1fr_8.5rem_8.5rem]"}`}>
          <TextField label="Hall hours from" type="time" path={path("from")} value={hall.from} onChange={(v) => setHours("from", v)} />
          <TextField label="Until" type="time" path={path("to")} value={hall.to} onChange={(v) => setHours("to", v)} />
          <StepperField
            label="Charged per (min)"
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
          onCheckedChange={(on) => {
            if (on) {
              editHall((h) => void (h.multipleRates = true));
              return;
            }
            if (hall.bands.length > 1 && !window.confirm("Use one rate all day? The other bands will be removed.")) return;
            editHall(keepOneRate);
          }}
        />
        <Label htmlFor={`${hall.id}-rates`}>Rate changes during the day</Label>
        <InfoTip about="rates during the day">
          For halls with different rates at different times, e.g. off-peak and peak. Set each band on the strip or below.
        </InfoTip>
      </div>

      {hall.multipleRates ? (
        <>
        <div className="flex flex-col gap-2">
          <HallTrack
            draft={draft}
            hallIndex={hallIndex}
            update={update}
            detailed
            className="h-8 rounded-md bg-muted/40"
            hoverGuide
            onSelectBand={setSelectedBand}
          />
          <HallTicks hall={hall} />
        </div>

        <div className="flex flex-col gap-2">
          {hall.bands.map((band, i) => (
            <div
              key={band.id}
              className={`grid grid-cols-[1.4fr_1fr_1fr_1fr_auto] items-end gap-2 rounded-lg p-1 transition-colors ${
                selectedBand === i ? "bg-background ring-1 ring-foreground/20" : ""
              }`}
            >
              <TextField label="Band name" placeholder={`Band ${i + 1}`} path={path("bands", i, "name")} value={band.name} onChange={editBand(i, "name")} />
              <TextField label="From" type="time" path={path("bands", i, "from")} value={band.from} onChange={editBand(i, "from")} />
              <TextField label="Until" type="time" path={path("bands", i, "to")} value={band.to} onChange={editBand(i, "to")} />
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
                disabled={hall.bands.length === 1}
                onClick={() => editHall((h) => void h.bands.splice(i, 1))}
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
            <p className="flex items-center gap-1.5 text-sm text-fits-text">
              <CheckCircleIcon weight="fill" /> Bands cover the hall&apos;s hours with no overlap
            </p>
          ) : (
            <ul className="flex flex-col gap-0.5 text-sm text-over-text">
              {problems.map((p) => (
                <li key={p} className="flex items-center gap-1.5">
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

/** The hall's hours and band edges under its strip, placed on the shared view of the day. */
function HallTicks({ hall }: { hall: HallDraft }) {
  const { range } = useContext(ViewRangeContext);
  const span = Math.max(1, range.end - range.start);
  const ticks = [...new Set([hall.from, hall.to, ...hall.bands.flatMap((b) => [b.from, b.to])])]
    .map(minutesOfDay)
    .filter((m): m is number => m !== null)
    .sort((a, b) => a - b);
  return (
    <div className="relative h-4 text-xs text-muted-foreground tabular-nums" aria-hidden="true">
      {ticks.map((m) => (
        <span key={m} className="absolute -translate-x-1/2" style={{ left: `${((m - range.start) / span) * 100}%` }}>
          {clock(m)}
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
}: {
  draft: PlanDraft;
  hallIndex: number;
  update: Update;
  /** Each court's groups when groups keep their own courts; null when courts are shared. */
  courtGroups: Map<string, CourtGroups> | null;
  statuses: Map<string, CourtStatus> | null;
}) {
  const hall = draft.frame.halls[hallIndex]!;
  const [settingsOpen, setSettingsOpen] = useState(!hall.from || !hall.to);
  const [copyOpen, setCopyOpen] = useState(false);
  const summary = [
    hall.from && hall.to ? `${hall.from}–${hall.to}` : "Hours not set",
    hall.unitMinutes ? `charged per ${hall.unitMinutes === 60 ? "hour" : `${hall.unitMinutes} min`}` : "unit not set",
    hall.multipleRates
      ? `${hall.bands.length} rate ${hall.bands.length === 1 ? "band" : "bands"}`
      : hall.bands[0]?.rate != null
        ? `${formatMoney(hall.bands[0].rate)} ${hall.unitMinutes === 60 ? "per hour" : hall.unitMinutes ? `per ${hall.unitMinutes} min` : "per unit"}`
        : "rate not set",
    `${hall.courts.length} ${hall.courts.length === 1 ? "court" : "courts"}`,
  ].join(" · ");

  const name = hallName(hall, hallIndex);
  // The groups this hall plays, for each court's group menu.
  const hallGroups: HallGroup[] = [];
  for (const court of hall.courts) {
    for (const g of courtGroups?.get(court.id)?.groups ?? []) {
      const key = `${g.categoryId}:${g.groupIndex}`;
      if (hallGroups.some((x) => x.key === key)) continue;
      const label = draft.categories.length > 1 ? `Group ${g.group} · ${categoryName(draft, g.categoryId)}` : `Group ${g.group}`;
      hallGroups.push({ key, label });
    }
  }
  hallGroups.sort((a, b) => a.label.localeCompare(b.label));
  const others = draft.frame.halls
    .map((h, i) => ({ hall: h, index: i }))
    .filter(({ index }) => index !== hallIndex);

  function copyFrom(index: number) {
    const source = draft.frame.halls[index];
    if (!source) return;
    if (!window.confirm(`Replace ${name}'s hours, rates and courts with ${hallName(source, index)}'s?`)) return;
    setCopyOpen(false);
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
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-1 gap-y-0.5">
          <input
            aria-label="Hall name"
            value={hall.name}
            placeholder={name}
            onChange={(e) => update((d) => void (d.frame.halls[hallIndex]!.name = e.target.value))}
            className="heading-card -mx-1 field-sizing-content max-w-full min-w-[4ch] rounded-md bg-transparent px-1 outline-none placeholder:text-turf hover:bg-inset focus-visible:bg-inset focus-visible:ring-2 focus-visible:ring-ring"
          />
          <IconButton
            label={settingsOpen ? `Hide ${name} settings` : `${name} settings`}
            aria-expanded={settingsOpen}
            data-hall-settings={hallIndex}
            onClick={() => setSettingsOpen((v) => !v)}
          >
            <CaretDownIcon weight="bold" className={`transition-transform motion-reduce:transition-none ${settingsOpen ? "rotate-180" : ""}`} />
          </IconButton>
          <p className="ml-1 text-sm text-muted-foreground tabular-nums">{summary}</p>
          {others.length > 0 ? (
            <Popover open={copyOpen} onOpenChange={setCopyOpen}>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <PopoverTrigger
                      render={<Button variant="ghost" size="icon-sm" aria-label={`Copy another hall into ${name}`} />}
                    />
                  }
                >
                  <CopySimpleIcon />
                </TooltipTrigger>
                <TooltipContent>Copy from another hall</TooltipContent>
              </Tooltip>
              <PopoverContent align="start" className="w-60 gap-1 p-1.5">
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
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <IconButton
            label={`Clear ${name}`}
            onClick={() => {
              if (!window.confirm(`Clear ${name}'s hours, rates and courts? Its name is kept.`)) return;
              update((d) => clearHall(d.frame.halls[hallIndex]!));
              setSettingsOpen(true);
            }}
          >
            <EraserIcon />
          </IconButton>
          {draft.frame.halls.length > 1 ? (
            <IconButton
              label={`Delete ${name}`}
              onClick={() => {
                if (!window.confirm(`Delete ${name} and its courts?`)) return;
                update((d) => void d.frame.halls.splice(hallIndex, 1));
              }}
            >
              <TrashIcon />
            </IconButton>
          ) : null}
        </div>
      </header>

      {settingsOpen ? <HallSettings draft={draft} hall={hall} hallIndex={hallIndex} update={update} /> : null}

      <div className="grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] gap-3">
        {hall.courts.map((court, i) => (
          <CourtCard
            key={court.id}
            hall={hall}
            hallIndex={hallIndex}
            courtIndex={i}
            number={courtNumber(draft.frame.halls, hallIndex, i)}
            status={statuses?.get(court.id) ?? null}
            groups={courtGroups?.get(court.id) ?? null}
            hallGroups={hallGroups}
            update={update}
          />
        ))}
        <button
          type="button"
          onClick={() => update((d) => void d.frame.halls[hallIndex]!.courts.push(emptyCourt()))}
          className="flex min-h-80 flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-input text-[15px] font-semibold text-primary transition-colors outline-none hover:border-primary hover:bg-tile focus-visible:ring-2 focus-visible:ring-ring"
        >
          <PlusIcon className="size-5" /> Add court
        </button>
      </div>
    </section>
  );
}
