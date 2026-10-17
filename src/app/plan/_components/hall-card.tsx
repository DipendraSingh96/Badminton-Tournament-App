"use client";

import { CheckCircleIcon, PlusIcon, SlidersHorizontalIcon, TrashIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { useContext, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { bandCoverage, type Span } from "@/engine";
import {
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
import { CourtCard } from "./court-card";
import type { CourtStatus } from "./timeline";
import { InfoTip, NumberField, StepperField, TextField } from "./fields";
import { formatMoney } from "./labels";
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
  const others = draft.frame.halls
    .map((h, i) => ({ hall: h, index: i }))
    .filter(({ index }) => index !== hallIndex);
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
    <div className="flex flex-col gap-4 rounded-xl bg-muted/60 p-4 ring-1 ring-foreground/5">
      <div className="flex flex-wrap items-end justify-between gap-3">
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
        {others.length > 0 ? (
          <NativeSelect
            aria-label="Copy everything from another hall"
            value=""
            onChange={(e) => {
              const source = draft.frame.halls[Number(e.target.value)];
              if (!source) return;
              const name = hallName(source, Number(e.target.value));
              if (!window.confirm(`Replace this hall's hours, rates and courts with ${name}'s?`)) return;
              editHall((h) => {
                h.from = source.from;
                h.to = source.to;
                h.unitMinutes = source.unitMinutes;
                h.multipleRates = source.multipleRates;
                h.bands = source.bands.map((b) => ({ ...b, id: newId() }));
                h.courts = source.courts.map((c) => ({ ...c, id: newId() }));
              });
            }}
          >
            <NativeSelectOption value="" disabled>
              Copy everything from another hall
            </NativeSelectOption>
            {others.map(({ hall: other, index }) => (
              <NativeSelectOption key={other.id} value={String(index)}>
                {hallName(other, index)}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        ) : null}
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
            <p className="flex items-center gap-1.5 text-sm text-success">
              <CheckCircleIcon weight="fill" /> Bands cover the hall&apos;s hours with no overlap
            </p>
          ) : (
            <ul className="flex flex-col gap-0.5 text-sm text-destructive">
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
  openCourtId,
  onOpenCourt,
  statuses,
}: {
  draft: PlanDraft;
  hallIndex: number;
  update: Update;
  openCourtId: string | null;
  onOpenCourt: (courtId: string | null) => void;
  statuses: Map<string, CourtStatus> | null;
}) {
  const hall = draft.frame.halls[hallIndex]!;
  const [settingsOpen, setSettingsOpen] = useState(!hall.from || !hall.to);
  const courtOpenHere = hall.courts.some((c) => c.id === openCourtId);
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

  return (
    <section className="flex flex-col gap-4 rounded-2xl bg-card p-5 ring-1 ring-foreground/10">
      <header className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <input
            aria-label="Hall name"
            value={hall.name}
            placeholder={hallName(hall, hallIndex)}
            onChange={(e) => update((d) => void (d.frame.halls[hallIndex]!.name = e.target.value))}
            className="-mx-1 rounded-md bg-transparent px-1 text-lg font-semibold tracking-tight outline-none placeholder:text-foreground hover:bg-muted focus-visible:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
          />
          <p className="text-sm text-muted-foreground tabular-nums">{summary}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {draft.frame.halls.length > 1 ? (
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Remove ${hallName(hall, hallIndex)}`}
              onClick={() => {
                if (!window.confirm(`Remove ${hallName(hall, hallIndex)} and its courts?`)) return;
                update((d) => void d.frame.halls.splice(hallIndex, 1));
              }}
            >
              <TrashIcon />
            </Button>
          ) : null}
          <Button
            variant={settingsOpen ? "secondary" : "outline"}
            aria-expanded={settingsOpen}
            data-hall-settings={hallIndex}
            onClick={() => setSettingsOpen((v) => !v)}
          >
            <SlidersHorizontalIcon /> Hall settings
          </Button>
        </div>
      </header>

      {settingsOpen ? <HallSettings draft={draft} hall={hall} hallIndex={hallIndex} update={update} /> : null}

      <div className="grid grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] gap-3">
        {hall.courts.map((court, i) => (
          <CourtCard
            key={court.id}
            hall={hall}
            hallIndex={hallIndex}
            courtIndex={i}
            number={courtNumber(draft.frame.halls, hallIndex, i)}
            open={openCourtId === court.id}
            dimmed={courtOpenHere && openCourtId !== court.id}
            onOpenChange={(open) => onOpenCourt(open ? court.id : null)}
            status={statuses?.get(court.id) ?? null}
            update={update}
          />
        ))}
        <button
          type="button"
          onClick={() => update((d) => void d.frame.halls[hallIndex]!.courts.push(emptyCourt()))}
          className={`flex min-h-48 flex-col items-center justify-center gap-2 rounded-xl border border-dashed text-sm text-muted-foreground transition-[opacity,colors] hover:border-foreground/40 hover:text-foreground ${
            courtOpenHere ? "opacity-40" : ""
          }`}
        >
          <PlusIcon className="size-5" /> Add court
        </button>
      </div>
    </section>
  );
}
