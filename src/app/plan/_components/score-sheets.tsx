"use client";

import type { PlanDraft } from "@/lib/tournament/draft";
import type { SheetDesign } from "@/lib/tournament/resources";

/** "Sat 14 Nov 2026" from the plan's date. */
function dateText(date: string): string {
  if (!date) return "";
  const [y, m, d] = date.split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })
    .format(new Date(Date.UTC(y!, m! - 1, d!)))
    .replace(",", "");
}

/** A blank to write on: its caption, then a line. */
function Blank({ label, className = "" }: { label: string; className?: string }) {
  return (
    <div className={`flex flex-col gap-[6mm] ${className}`}>
      <span className="text-[7.5pt] uppercase">{label}</span>
      <span className="border-b border-black" />
    </div>
  );
}

/**
 * A blank score sheet for one match: a full A4 page. It carries no names, so
 * any sheet of a design does for any match scored that way. For each game
 * (one, or three for best of three) each side has a row of numbered boxes to
 * cross off as points are won: up to the points per game, and on to the
 * deuce limit where there is one (those boxes are lighter). Names only are
 * written on it at the court; never a phone number or money.
 */
export function BlankScoreSheet({ draft, design }: { draft: PlanDraft; design: SheetDesign }) {
  const team = draft.unit === "team";
  const several = design.categoryIds.length > 1;
  const points = Array.from({ length: design.limit }, (_, i) => i + 1);
  const cell = "border border-black";
  return (
    <section className="score-sheet flex flex-col gap-[5mm] p-[4mm] font-sans text-[10pt] leading-tight text-black">
      <header className="flex items-baseline justify-between gap-[4mm] border-b-2 border-black pb-[2mm]">
        <span className="text-[15pt] font-bold">{draft.name.trim() || "Tournament"}</span>
        <span>{dateText(draft.frame.date)}</span>
      </header>
      <div className="flex flex-col gap-[1mm]">
        <span className="text-[7.5pt] uppercase">Score sheet for</span>
        {design.uses.map((use) => (
          <span key={use} className="text-[11pt] font-bold">
            {use}
          </span>
        ))}
        <span>{design.scoring}</span>
      </div>

      <div className={`grid gap-[5mm] ${several ? "grid-cols-5" : "grid-cols-4"}`}>
        {several ? <Blank label="Category" /> : null}
        <Blank label="Court" />
        <Blank label="Time" />
        <Blank label="Group or round" />
        <Blank label={team ? "Tie and rubber" : "Match"} />
      </div>
      <div className="grid grid-cols-2 gap-[8mm]">
        {["Side A", "Side B"].map((side) => (
          <div key={side} className="flex flex-col gap-[4mm]">
            <Blank label={team ? `${side}: team` : side} />
            <Blank label="Players" />
          </div>
        ))}
      </div>

      {Array.from({ length: design.bestOf }, (_, g) => (
        <div key={g} className="flex flex-col gap-[1.5mm] break-inside-avoid">
          <div className="flex items-baseline justify-between">
            <span className="font-bold">{design.bestOf === 1 ? "Game" : `Game ${g + 1}`}</span>
            <span className="text-[7.5pt] uppercase">Cross off a box for each point won</span>
          </div>
          <table className="w-full table-fixed border-collapse">
            <tbody>
              {["A", "B"].map((side) => (
                <tr key={side}>
                  <th className={`${cell} w-[9mm] py-[1.6mm] text-[10pt] font-bold`}>{side}</th>
                  {points.map((n) => (
                    <td
                      key={n}
                      // Past the points per game: only reached from deuce.
                      className={`${cell} py-[1.6mm] text-center text-[7.5pt] tabular-nums ${n > design.target ? "bg-black/10" : ""}`}
                    >
                      {n}
                    </td>
                  ))}
                  <td className={`${cell} w-[16mm]`} />
                </tr>
              ))}
            </tbody>
          </table>
          <span className="self-end text-[7.5pt] uppercase">Game score in the end box</span>
        </div>
      ))}

      <div className="grid grid-cols-[2fr_1fr] gap-[8mm]">
        <Blank label="Match won by" />
        <Blank label={design.bestOf === 1 ? "Score" : "Games"} />
      </div>
      <div className="mt-auto grid grid-cols-3 gap-[8mm] pt-[4mm]">
        <Blank label="Umpire's signature" />
        <Blank label="Side A's signature" />
        <Blank label="Side B's signature" />
      </div>
    </section>
  );
}
