"use client";

import { PrinterIcon } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { categoryRules, courtNumber, type PlanDraft } from "@/lib/tournament/draft";
import { sidePlayers } from "@/lib/tournament/entries";
import { clock } from "@/lib/tournament/time";
import { categoryName } from "./labels";
import { matchText, sideLabel, type LocalSegment } from "./timeline";

/** A court's number from its id. */
function courtOf(draft: PlanDraft, courtId: string): number | null {
  for (const [h, hall] of draft.frame.halls.entries()) {
    const c = hall.courts.findIndex((x) => x.id === courtId);
    if (c !== -1) return courtNumber(draft.frame.halls, h, c);
  }
  return null;
}

/** "Sat 14 Nov 2026" from the plan's date. */
function dateText(date: string): string {
  if (!date) return "";
  const [y, m, d] = date.split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(y!, m! - 1, d!)),
  );
}

/** One game's paper score sheet: half an A4 page. Names only; no phone numbers and no money. */
export function ScoreSheet({ draft, segment }: { draft: PlanDraft; segment: LocalSegment }) {
  const { match } = segment;
  const { where, rubber } = matchText(draft, match);
  const category = draft.categories.find((c) => c.id === match.categoryId);
  const games = category ? (categoryRules(draft, category)[match.stage].bestOf ?? 1) : 1;
  const side = (slot: string) => ({
    name: sideLabel(draft, match, slot),
    players: sidePlayers(draft, match.categoryId, slot, match.rubber?.number)
      .map((p) => p.name.trim())
      .filter(Boolean),
  });
  const sides = [side(match.home), side(match.away)];
  const cell = "border border-black";
  return (
    <section className="score-sheet flex flex-col gap-[4mm] px-[4mm] py-[6mm] font-sans text-[11pt] leading-tight text-black">
      <header className="flex items-baseline justify-between gap-[4mm] border-b-2 border-black pb-[2mm]">
        <span className="text-[14pt] font-bold">{draft.name.trim() || "Tournament"}</span>
        <span>{dateText(draft.frame.date)}</span>
      </header>
      <div className="grid grid-cols-4 gap-[3mm]">
        {[
          ["Court", String(courtOf(draft, segment.courtId) ?? "")],
          ["Time", clock(segment.from)],
          ["Category", categoryName(draft, match.categoryId)],
          ["Game", [where, rubber?.replace(/: .*/, "")].filter(Boolean).join(" · ")],
        ].map(([label, value]) => (
          <div key={label} className="flex flex-col">
            <span className="text-[8pt] uppercase">{label}</span>
            <span className="text-[13pt] font-bold">{value}</span>
          </div>
        ))}
      </div>
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className={`${cell} px-[2mm] py-[1.5mm] text-left text-[8pt] font-normal uppercase`}>Side</th>
            {Array.from({ length: games }, (_, g) => (
              <th key={g} className={`${cell} w-[22mm] py-[1.5mm] text-[8pt] font-normal uppercase`}>
                {games === 1 ? "Score" : `Game ${g + 1}`}
              </th>
            ))}
            <th className={`${cell} w-[22mm] py-[1.5mm] text-[8pt] font-normal uppercase`}>Winner (tick)</th>
          </tr>
        </thead>
        <tbody>
          {sides.map((s, i) => (
            <tr key={i}>
              <td className={`${cell} h-[20mm] px-[2mm] align-middle`}>
                <span className="block font-bold">{s.name}</span>
                {/* A team's players for this rubber, or a pair's two, when they aren't already the name. */}
                {s.players.length > 0 && s.players.join(" / ") !== s.name ? <span className="block text-[9pt]">{s.players.join(" / ")}</span> : null}
              </td>
              {Array.from({ length: games }, (_, g) => (
                <td key={g} className={cell} />
              ))}
              <td className={cell} />
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-auto grid grid-cols-2 gap-[6mm]">
        {["Umpire's name", "Umpire's signature"].map((label) => (
          <div key={label} className="flex flex-col gap-[7mm]">
            <span className="text-[8pt] uppercase">{label}</span>
            <span className="border-b border-black" />
          </div>
        ))}
      </div>
    </section>
  );
}

/**
 * Print score sheets: for umpires without a phone. A small menu asks which
 * games; the sheets print two to an A4 page through the browser's own print
 * dialog (which can also save a PDF). Available once any draw is locked.
 */
export function ScoreSheetsButton({ draft, segments, label = "Print score sheets" }: { draft: PlanDraft; segments: LocalSegment[]; label?: string }) {
  const [open, setOpen] = useState(false);
  const [which, setWhich] = useState("all");
  const [printing, setPrinting] = useState<LocalSegment[] | null>(null);
  const locked = Object.values(draft.draw).some((d) => d.locked);
  const courts = draft.frame.halls.flatMap((hall, h) => hall.courts.map((c, i) => ({ id: c.id, number: courtNumber(draft.frame.halls, h, i) })));
  const ordered = [...segments].sort(
    (a, b) => a.from - b.from || (courtOf(draft, a.courtId) ?? 0) - (courtOf(draft, b.courtId) ?? 0),
  );
  const chosen =
    which === "all"
      ? ordered
      : which === "group"
        ? ordered.filter((s) => s.stage === "group")
        : which.startsWith("court:")
          ? ordered.filter((s) => s.courtId === which.slice(6))
          : ordered.filter((s) => s.match.categoryId === which.slice(9));

  // Once the sheets are on the page, print them; afterwards take them off again.
  useEffect(() => {
    if (!printing) return;
    const done = () => setPrinting(null);
    window.addEventListener("afterprint", done);
    const timer = window.setTimeout(() => window.print(), 50);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("afterprint", done);
    };
  }, [printing]);

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button
              variant="outline"
              size="sm"
              disabled={!locked || segments.length === 0}
              title={!locked ? "Lock a draw first: sheets carry the names it gives." : undefined}
            />
          }
        >
          <PrinterIcon /> {label}
        </PopoverTrigger>
        <PopoverContent align="end" className="w-72 gap-3 p-3">
          <div className="flex flex-col gap-1">
            <label htmlFor="score-sheets-which" className="text-xs leading-4 text-muted-foreground">
              Which games
            </label>
            <NativeSelect id="score-sheets-which" className="w-full" value={which} onChange={(e) => setWhich(e.target.value)}>
              <NativeSelectOption value="all">Every game</NativeSelectOption>
              <NativeSelectOption value="group">Group stage only</NativeSelectOption>
              {courts.map((c) => (
                <NativeSelectOption key={c.id} value={`court:${c.id}`}>
                  Court {c.number}
                </NativeSelectOption>
              ))}
              {draft.categories.length > 1
                ? draft.categories.map((c) => (
                    <NativeSelectOption key={c.id} value={`category:${c.id}`}>
                      {categoryName(draft, c.id)}
                    </NativeSelectOption>
                  ))
                : null}
            </NativeSelect>
          </div>
          <p className="text-xs text-muted-foreground tabular-nums">
            {chosen.length} {chosen.length === 1 ? "sheet" : "sheets"}, two to an A4 page ({Math.ceil(chosen.length / 2)}{" "}
            {Math.ceil(chosen.length / 2) === 1 ? "page" : "pages"}). Knockout sheets name their sides once the groups decide them.
          </p>
          <Button
            size="sm"
            className="self-end"
            disabled={chosen.length === 0}
            onClick={() => {
              setOpen(false);
              setPrinting(chosen);
            }}
          >
            <PrinterIcon /> Print
          </Button>
        </PopoverContent>
      </Popover>
      {printing
        ? createPortal(
            <div className="print-root" data-sheets={printing.length}>
              {printing.map((s) => (
                <ScoreSheet key={s.id} draft={draft} segment={s} />
              ))}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
