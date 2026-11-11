"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { groupLetter, knockoutBracket } from "@/engine";
import { courtNumber, entryName, type PlanDraft } from "@/lib/tournament/draft";
import { categoryFormatOf, entryGroups, sideName } from "@/lib/tournament/entries";
import { longDate, rulebook, venueLines } from "@/lib/tournament/resources";
import { clock } from "@/lib/tournament/time";
import { categoryName } from "./labels";
import { matchText, sideLabel, type LocalSegment } from "./timeline";

// The documents an organiser sends to players before the day: the rulebook
// and the programme. Each is one component, shown on screen in a preview and
// printed through the browser's own dialog (which also saves a PDF). They are
// black on white whatever the theme, and never carry a phone number or money.

/**
 * Prints something: it is put on the page for the print dialog only, and
 * taken off again afterwards. Render `portal` anywhere; call `print` with
 * what to print.
 */
export function usePrint(): { print: (content: ReactNode) => void; portal: ReactNode } {
  const [job, setJob] = useState<ReactNode>(null);
  useEffect(() => {
    if (!job) return;
    const done = () => setJob(null);
    window.addEventListener("afterprint", done);
    const timer = window.setTimeout(() => window.print(), 50);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("afterprint", done);
    };
  }, [job]);
  return { print: setJob, portal: job ? createPortal(<div className="print-root">{job}</div>, document.body) : null };
}

/** A round's name from its size: Final, Semi-finals, Quarter-finals, Round of 16. */
function roundName(size: number): string {
  if (size === 2) return "Final";
  if (size === 4) return "Semi-finals";
  if (size === 8) return "Quarter-finals";
  return `Round of ${size}`;
}

/** A court's number from its id. */
function courtOf(draft: PlanDraft, courtId: string): number | null {
  for (const [h, hall] of draft.frame.halls.entries()) {
    const c = hall.courts.findIndex((x) => x.id === courtId);
    if (c !== -1) return courtNumber(draft.frame.halls, h, c);
  }
  return null;
}

/** The top of a document: the tournament, what the document is, and the date. */
function Head({ draft, title }: { draft: PlanDraft; title: string }) {
  return (
    <header className="flex flex-col gap-[1mm] border-b-2 border-black pb-[3mm]">
      <span className="text-[9pt] uppercase">{title}</span>
      <h1 className="text-[18pt] leading-tight font-bold">{draft.name.trim() || "Tournament"}</h1>
      {draft.frame.date ? <span className="text-[11pt]">{longDate(draft.frame.date)}</span> : null}
    </header>
  );
}

const DOC = "print-doc flex flex-col gap-[5mm] font-sans text-[10.5pt] leading-snug text-black";
const H2 = "text-[13pt] leading-tight font-bold";

/** The rulebook: the tournament's rules in words, from the settings the app scores and ranks by. */
export function RulebookDocument({ draft }: { draft: PlanDraft }) {
  const { sections } = rulebook(draft, draft.resources.houseRules);
  return (
    <article className={DOC}>
      <Head draft={draft} title="Rulebook" />
      {sections.map((section) => (
        <section key={section.title} className="flex flex-col gap-[1.5mm] break-inside-avoid">
          <h2 className={H2}>{section.title}</h2>
          {section.lines.map((line, i) => (
            <p key={i}>{line}</p>
          ))}
        </section>
      ))}
    </article>
  );
}

/** The programme: when and where, each category's groups and knockout, and every court's games in order. Names only. */
export function ProgrammeDocument({ draft, segments }: { draft: PlanDraft; segments: LocalSegment[] }) {
  const groups = entryGroups(draft);
  const courts = draft.frame.halls.flatMap((hall) => hall.courts.map((c) => c.id));
  const cell = "border-b border-black/30 py-[1mm] pr-[3mm] align-top";
  return (
    <article className={DOC}>
      <Head draft={draft} title="Programme" />
      <section className="flex flex-col gap-[1mm]">
        <h2 className={H2}>Venue</h2>
        {venueLines(draft).map((line) => (
          <p key={line}>{line}</p>
        ))}
        <p>Check in at the desk when you arrive. Times are the plan for the day: listen for your game being called.</p>
      </section>

      {draft.categories.map((category) => {
        const own = groups.filter((g) => g.categoryId === category.id && g.kind !== "undrawn");
        const format = categoryFormatOf(draft, category);
        const bracket =
          format.ok && draft.format !== "groups" ? knockoutBracket(format.format.qualifiers, format.format.groupSizes.length, category.bronze) : null;
        return (
          <section key={category.id} className="flex flex-col gap-[3mm]">
            <h2 className={H2}>{categoryName(draft, category.id)}</h2>
            {own.length === 0 ? (
              <p>The draw hasn&apos;t been made yet.</p>
            ) : (
              <div className="grid grid-cols-2 gap-x-[8mm] gap-y-[3mm]">
                {own.map((group) => (
                  <div key={group.key} className="break-inside-avoid">
                    <h3 className="border-b border-black pb-[0.5mm] font-bold">{group.kind === "group" ? `Group ${groupLetter(group.group!)}` : "Seeds"}</h3>
                    <ol>
                      {group.entries.map((entry, i) => (
                        <li key={entry.id} className="flex gap-[2mm] border-b border-black/30 py-[1mm]">
                          <span className="w-[8mm] shrink-0 tabular-nums">{group.kind === "group" ? `${groupLetter(group.group!)}${i + 1}` : i + 1}</span>
                          <span>{entryName(entry) ?? "Unnamed entry"}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                ))}
              </div>
            )}
            {bracket && bracket.rounds.length > 0 ? (
              <div className="flex flex-col gap-[1mm] break-inside-avoid">
                <h3 className="font-bold">Knockout</h3>
                {[...bracket.rounds.map((r) => ({ name: roundName(r.size), matches: r.matches })), ...(bracket.bronze ? [{ name: "Third place", matches: [bracket.bronze] }] : [])].map(
                  (round) => (
                    <p key={round.name}>
                      <span className="font-bold">{round.name}:</span>{" "}
                      {round.matches
                        .map((m) => `${sideName(draft, category.id, m.home) ?? m.home} v ${sideName(draft, category.id, m.away) ?? m.away}`)
                        .join("; ")}
                    </p>
                  ),
                )}
              </div>
            ) : null}
          </section>
        );
      })}

      <section className="flex flex-col gap-[3mm]">
        <h2 className={H2}>Order of play</h2>
        {segments.length === 0 ? <p>The schedule isn&apos;t ready yet.</p> : null}
        {courts.map((courtId) => {
          const games = segments.filter((s) => s.courtId === courtId).sort((a, b) => a.from - b.from);
          if (games.length === 0) return null;
          return (
            <table key={courtId} className="w-full border-collapse text-left">
              <caption className="border-b border-black pb-[0.5mm] text-left font-bold">Court {courtOf(draft, courtId)}</caption>
              <tbody>
                {games.map((s) => {
                  const { where, rubber } = matchText(draft, s.match);
                  return (
                    <tr key={s.id} className="break-inside-avoid">
                      <td className={`${cell} w-[14mm] tabular-nums`}>{clock(s.from)}</td>
                      <td className={`${cell} w-[58mm]`}>
                        {[draft.categories.length > 1 ? categoryName(draft, s.match.categoryId) : null, where, rubber?.replace(/: .*/, "")].filter(Boolean).join(" · ")}
                      </td>
                      <td className={cell}>
                        {sideLabel(draft, s.match, s.match.home)} v {sideLabel(draft, s.match, s.match.away)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          );
        })}
      </section>
    </article>
  );
}
