"use client";

import { ArrowCounterClockwiseIcon, MagnifyingGlassIcon, PrinterIcon, UserMinusIcon } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { LOG_KIND_LABELS, canReverse, reversalBlockedBy, reverseChange } from "@/lib/tournament/changes";
import type { LogEntryDraft, LogKind, PlanDraft } from "@/lib/tournament/draft";
import { cn } from "@/lib/utils";
import { WithdrawDialog } from "./live-dialogs";
import type { Update } from "./plan-editor";

/** A log time in the tournament's time zone: "14:32". */
function timeOf(draft: PlanDraft, iso: string): string {
  try {
    return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: draft.frame.timeZone || undefined }).format(new Date(iso));
  } catch {
    return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
  }
}

/** The kinds that are worth a filter: what's in the log, in a fixed order. */
const KINDS = Object.keys(LOG_KIND_LABELS) as LogKind[];

/**
 * The Live stage's Changes page: the controlled changes the desk may make
 * while the tournament is Live, and the log of every one. A withdrawal is
 * made here; the others are made where they happen and all end up in the log.
 * A change is taken back with Reverse, which is logged too.
 */
export function ChangesView({ draft, update }: { draft: PlanDraft; update: Update }) {
  const confirm = useConfirm();
  const [withdrawing, setWithdrawing] = useState(false);
  const [kind, setKind] = useState<LogKind | "">("");
  const [query, setQuery] = useState("");
  const [printing, setPrinting] = useState(false);
  const q = query.trim().toLowerCase();
  const newestFirst = [...draft.log].reverse();
  const shown = newestFirst.filter((e) => (!kind || e.kind === kind) && (!q || e.text.toLowerCase().includes(q) || e.note.toLowerCase().includes(q)));
  // Changes in force: going Live is where the log starts, and a reversed change (or its reversal) no longer stands.
  const count = draft.log.filter((e) => e.kind !== "live" && e.kind !== "reversal" && e.reversedAt === null).length;

  // Once the log is on the page, print it; afterwards take it off again.
  useEffect(() => {
    if (!printing) return;
    const done = () => setPrinting(false);
    window.addEventListener("afterprint", done);
    const timer = window.setTimeout(() => window.print(), 50);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("afterprint", done);
    };
  }, [printing]);

  async function reverse(entry: LogEntryDraft) {
    const leaving = entry.kind === "live";
    if (
      !(await confirm(
        leaving
          ? {
              title: "Take the tournament out of Live?",
              body: "It goes back to the Draw stage. Scores and this log are kept, and the draw stays locked. Money is shown again.",
              action: "Take out of Live",
              destructive: true,
            }
          : { title: "Reverse this change?", body: `“${entry.text}” is put back to how it was. The reversal is logged.`, action: "Reverse", destructive: true },
      ))
    )
      return;
    update((d) => void reverseChange(d, entry.id, new Date().toISOString()));
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 className="heading-card">Changes</h2>
          <p className="text-sm tabular-nums" aria-live="polite">
            <span className="font-semibold">{count}</span>{" "}
            <span className="text-muted-foreground">
              {count === 1 ? "change" : "changes"} in force · {draft.log.length} {draft.log.length === 1 ? "entry" : "entries"} in the log
            </span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled={draft.log.length === 0} onClick={() => setPrinting(true)}>
            <PrinterIcon /> Print log
          </Button>
          <Button size="sm" onClick={() => setWithdrawing(true)}>
            <UserMinusIcon /> Withdraw an entry…
          </Button>
        </div>
      </div>
      <p className="text-sm text-muted-foreground">
        Everything else is changed where it happens, and logged here: a walkover, a retirement or a corrected score on the game (Court board), a court
        move by dragging the game on the Court board&apos;s timeline, and a level group on its table (Standings and bracket). There is no undo while
        Live: take a change back with Reverse.
      </p>

      <div className="flex flex-wrap items-end gap-3 border-t pt-4">
        <div className="relative min-w-60 flex-1">
          <MagnifyingGlassIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input aria-label="Search the log" placeholder="Search the log" className="pl-9" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <NativeSelect aria-label="Kind of change" value={kind} onChange={(e) => setKind(e.target.value as LogKind | "")}>
          <NativeSelectOption value="">Every kind</NativeSelectOption>
          {KINDS.filter((k) => draft.log.some((e) => e.kind === k)).map((k) => (
            <NativeSelectOption key={k} value={k}>
              {LOG_KIND_LABELS[k]}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </div>

      {draft.log.length === 0 ? (
        <p className="rounded-lg bg-card-system p-4 text-sm text-muted-foreground">
          Nothing in the log: this tournament went Live before the log existed. Changes made from now on are recorded here.
        </p>
      ) : shown.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing in the log matches.</p>
      ) : (
        <ol aria-label="Log, newest first" className="flex flex-col gap-2">
          {shown.map((entry) => {
            const reversed = entry.reversedAt !== null;
            const blocker = reversed || entry.kind === "reversal" ? null : reversalBlockedBy(draft, entry.id);
            return (
              <li key={entry.id} className="flex items-start gap-3 rounded-lg bg-card-system p-3">
                <span className="w-12 shrink-0 pt-0.5 text-sm font-semibold tabular-nums">{timeOf(draft, entry.at)}</span>
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <Badge variant={entry.kind === "reversal" ? "outline" : "off"}>{LOG_KIND_LABELS[entry.kind]}</Badge>
                    <span className="text-xs text-muted-foreground">by {entry.by}</span>
                    {reversed ? <span className="text-xs text-muted-foreground tabular-nums">· Reversed {timeOf(draft, entry.reversedAt!)}</span> : null}
                  </span>
                  <p className={cn("text-sm", reversed && "text-muted-foreground line-through")}>{entry.text}</p>
                  {entry.note ? <p className="text-xs text-muted-foreground">Note: {entry.note}</p> : null}
                </div>
                {entry.kind === "reversal" || reversed ? null : (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!canReverse(draft, entry.id)}
                    title={blocker ? `Reverse the later change first: “${blocker.text}”` : undefined}
                    onClick={() => reverse(entry)}
                  >
                    <ArrowCounterClockwiseIcon /> {entry.kind === "live" ? "Take out of Live" : "Reverse"}
                  </Button>
                )}
              </li>
            );
          })}
        </ol>
      )}

      {withdrawing ? <WithdrawDialog draft={draft} update={update} onClose={() => setWithdrawing(false)} /> : null}

      {printing
        ? createPortal(
            <div className="print-root p-[6mm] font-sans text-[10pt] text-black">
              <h1 className="text-[14pt] font-bold">{draft.name.trim() || "Tournament"}: log of changes</h1>
              <p className="pb-[4mm] text-[9pt]">
                {draft.frame.date} · times in {draft.frame.timeZone}
              </p>
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="border-b border-black text-[8pt] uppercase">
                    <th className="w-[14mm] py-[1.5mm] font-normal">Time</th>
                    <th className="w-[30mm] py-[1.5mm] font-normal">Kind</th>
                    <th className="py-[1.5mm] font-normal">Change</th>
                    <th className="w-[16mm] py-[1.5mm] font-normal">By</th>
                  </tr>
                </thead>
                <tbody>
                  {draft.log.map((entry) => (
                    <tr key={entry.id} className="border-b border-black/30 align-top">
                      <td className="py-[1.5mm] tabular-nums">{timeOf(draft, entry.at)}</td>
                      <td className="py-[1.5mm]">{LOG_KIND_LABELS[entry.kind]}</td>
                      <td className="py-[1.5mm]">
                        {entry.text}
                        {entry.note ? ` (Note: ${entry.note})` : ""}
                        {entry.reversedAt ? ` [Reversed ${timeOf(draft, entry.reversedAt)}]` : ""}
                      </td>
                      <td className="py-[1.5mm]">{entry.by}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
