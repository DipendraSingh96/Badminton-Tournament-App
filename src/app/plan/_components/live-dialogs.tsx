"use client";

import { ArrowDownIcon, ArrowUpIcon } from "@phosphor-icons/react";
import { produce } from "immer";
import { useId, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { FormDialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOptGroup, NativeSelectOption } from "@/components/ui/native-select";
import { awardMatch, decideTie, planWithdrawal, withdrawEntry } from "@/lib/tournament/changes";
import { entryName, type PlanDraft } from "@/lib/tournament/draft";
import { categoryLabel, entryIdOn, groupTable, matchRef, type GroupTable } from "@/lib/tournament/entries";
import { WALKOVER_LABELS } from "@/lib/tournament/events";
import { cn } from "@/lib/utils";
import { IconButton } from "./fields";
import type { Update } from "./plan-editor";

const now = () => new Date().toISOString();

/** One of a few choices, each with a line saying what it does. */
function Choices<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string; detail?: string; disabled?: boolean }[];
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-col gap-1">
      <span className="text-xs leading-4 text-muted-foreground">{label}</span>
      <div className="flex flex-col gap-1">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={o.value === value}
            disabled={o.disabled}
            onClick={() => onChange(o.value)}
            className={cn(
              "flex flex-col gap-0.5 rounded-md border px-3 py-2 text-left transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50",
              o.value === value ? "border-primary ring-1 ring-primary" : "border-border hover:bg-(--field)",
            )}
          >
            <span className="font-semibold">{o.label}</span>
            {o.detail ? <span className="text-xs text-muted-foreground">{o.detail}</span> : null}
          </button>
        ))}
      </div>
    </div>
  );
}

/** An optional reason, kept in the log with the change. */
function Note({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder: string }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-xs leading-4 text-muted-foreground">
        Note for the log (optional)
      </label>
      <Input id={id} value={value} maxLength={120} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

/** A side's name in a match, or where it comes from while it isn't known. */
function sideOf(draft: PlanDraft, categoryId: string, slot: string): string {
  const id = entryIdOn(draft, categoryId, slot);
  const entry = id ? draft.entries.find((e) => e.id === id) : undefined;
  return entry ? (entryName(entry) ?? "Unnamed entry") : slot;
}

/**
 * Award a match: a walkover (a side didn't play) or a retirement (a side
 * stopped during play). The desk says who wins it; how it's scored follows
 * the tournament's rule.
 */
export function AwardDialog({
  draft,
  update,
  matchId,
  started,
  midGame,
  onClose,
}: {
  draft: PlanDraft;
  update: Update;
  matchId: string;
  /** Scores have been entered: a retirement is the likely reason. */
  started: boolean;
  /** The last game entered isn't finished: on a retirement its points stand but it's nobody's game. */
  midGame: boolean;
  onClose: () => void;
}) {
  const ref = matchRef(draft, matchId);
  const [reason, setReason] = useState<"walkover" | "retired">(started ? "retired" : "walkover");
  const [winner, setWinner] = useState<"0" | "1" | "">("");
  const [note, setNote] = useState("");
  if (!ref) return null;
  const home = sideOf(draft, ref.categoryId, ref.home);
  const away = sideOf(draft, ref.categoryId, ref.away);
  const rule = draft.rules.walkover ? WALKOVER_LABELS[draft.rules.walkover] : null;
  return (
    <FormDialog
      open
      onOpenChange={(open) => (open ? undefined : onClose())}
      title="Award this match"
      description={`${ref.label}: ${home} v ${away}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={winner === ""}
            onClick={() => {
              update((d) => void awardMatch(d, { matchId, winner: winner === "0" ? 0 : 1, reason, open: midGame, note, now: now() }));
              onClose();
            }}
          >
            Award match
          </Button>
        </>
      }
    >
      <Choices
        label="Why"
        value={reason}
        onChange={setReason}
        options={[
          {
            value: "walkover",
            label: "Walkover",
            detail: `A side didn't play.${rule ? ` Scored by the tournament's rule: ${rule.toLowerCase()}.` : ""}${started ? " The scores entered so far are replaced." : ""}`,
          },
          { value: "retired", label: "Retired", detail: "A side stopped during play. The scores entered stand; the other side is given the match." },
        ]}
      />
      <Choices
        label="Who wins it"
        value={winner}
        onChange={setWinner}
        options={[
          { value: "0", label: home, detail: `${away} ${reason === "walkover" ? "didn't play" : "retired"}` },
          { value: "1", label: away, detail: `${home} ${reason === "walkover" ? "didn't play" : "retired"}` },
        ]}
      />
      <Note value={note} onChange={setNote} placeholder={reason === "walkover" ? "Didn't arrive" : "Ankle injury"} />
    </FormDialog>
  );
}

/** A group's table in one line an entry: "1 Smashers · 2 Net Gains". */
function TableList({ draft, table, title }: { draft: PlanDraft; table: GroupTable; title: string }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1">
      <span className="text-xs leading-4 text-muted-foreground">{title}</span>
      <ol className="flex flex-col gap-0.5 tabular-nums">
        {table.rows.map((row) => {
          const entry = draft.entries.find((e) => e.id === row.id);
          return (
            <li key={row.id} className={cn("flex gap-2", table.withdrawn.includes(row.id) && "text-muted-foreground line-through")}>
              <span className="w-4 shrink-0 text-muted-foreground">{row.place}</span>
              <span className="min-w-0 flex-1 truncate">{(entry && entryName(entry)) ?? "Unnamed entry"}</span>
              <span className="shrink-0 text-muted-foreground">
                {row.won}–{row.lost}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/**
 * Withdraw an entry (a team or pair withdraws as a whole). Shows what it
 * would do before it's done: the games given away or voided, and for a group
 * its table before and after.
 */
export function WithdrawDialog({ draft, update, onClose }: { draft: PlanDraft; update: Update; onClose: () => void }) {
  const selectId = useId();
  const [entryId, setEntryId] = useState("");
  // The Plan stage's rule is the starting choice; the desk can choose the other on the day.
  const [results, setResults] = useState<"stand" | "void">(draft.rules.withdrawal === "byesThenVoid" ? "void" : "stand");
  const [note, setNote] = useState("");
  const entry = draft.entries.find((e) => e.id === entryId);
  const plan = entry ? planWithdrawal(draft, entry.id, results) : null;
  const category = entry ? draft.categories.find((c) => c.id === entry.categoryId) : undefined;
  const group = entry && category ? (draft.draw[category.id]?.groups.findIndex((ids) => ids.includes(entry.id)) ?? -1) : -1;

  let preview: ReactNode = null;
  if (entry && category && plan?.ok) {
    const after = produce(draft, (d) => void withdrawEntry(d, { entryId: entry.id, results, now: now() }));
    const games = (ids: string[]) =>
      ids.map((id) => {
        const ref = matchRef(draft, id)!;
        // The entry itself is named above: each game is who it's against.
        const other = entryIdOn(draft, ref.categoryId, ref.home) === entry.id ? ref.away : ref.home;
        return (
          <li key={id} className="truncate">
            {ref.label}, against {sideOf(draft, ref.categoryId, other)}
          </li>
        );
      });
    const before = plan.stage === "group" && group !== -1 ? groupTable(draft, category, group) : null;
    const then = plan.stage === "group" && group !== -1 ? groupTable(after, category, group) : null;
    preview = (
      <>
        {plan.stage === "group" ? (
          <Choices
            label="Its results"
            value={results}
            onChange={setResults}
            options={[
              { value: "stand", label: "Played results stand", detail: "Its remaining games are walkovers to the other side." },
              { value: "void", label: "All its results are voided", detail: "Its games no longer count for anyone; games not yet played aren't played." },
            ]}
          />
        ) : (
          <p className="text-muted-foreground">Its group has finished, so the table doesn&apos;t change. Its next knockout game is a walkover to the other side.</p>
        )}
        <div className="flex flex-col gap-1">
          <span className="text-xs leading-4 text-muted-foreground">
            {plan.walkovers.length > 0
              ? `Given as walkovers (${plan.walkovers.length})`
              : plan.voided.length > 0
                ? `No longer counted (${plan.voided.length})`
                : "Games affected"}
          </span>
          {plan.walkovers.length + plan.voided.length > 0 ? (
            <ul className="flex flex-col gap-0.5">{games([...plan.walkovers, ...plan.voided])}</ul>
          ) : (
            <p>None: it has no games left to play.</p>
          )}
        </div>
        {before && then ? (
          <div className="flex gap-4 rounded-md bg-inset p-3">
            <TableList draft={draft} table={before} title={`Group ${before.letter} now`} />
            <TableList draft={after} table={then} title="After" />
          </div>
        ) : null}
        <Note value={note} onChange={setNote} placeholder="Injured in warm-up" />
      </>
    );
  }

  return (
    <FormDialog
      open
      onOpenChange={(open) => (open ? undefined : onClose())}
      title="Withdraw an entry"
      description="The whole entry leaves the tournament. One player missing from a team isn't a withdrawal."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={!plan?.ok}
            onClick={() => {
              update((d) => void withdrawEntry(d, { entryId, results, note, now: now() }));
              onClose();
            }}
          >
            Withdraw entry
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-1">
        <label htmlFor={selectId} className="text-xs leading-4 text-muted-foreground">
          Who is withdrawing
        </label>
        <NativeSelect id={selectId} className="w-full" value={entryId} onChange={(e) => setEntryId(e.target.value)}>
          <NativeSelectOption value="">Choose an entry</NativeSelectOption>
          {draft.categories.map((c) => (
            <NativeSelectOptGroup key={c.id} label={categoryLabel(draft, c.id)}>
              {draft.entries
                .filter((e) => e.categoryId === c.id && !draft.withdrawn[e.id])
                .map((e) => (
                  <NativeSelectOption key={e.id} value={e.id}>
                    {entryName(e) ?? "Unnamed entry"}
                  </NativeSelectOption>
                ))}
            </NativeSelectOptGroup>
          ))}
        </NativeSelect>
      </div>
      {plan && !plan.ok ? <p className="text-over-text">{plan.reason}</p> : null}
      {preview}
    </FormDialog>
  );
}

/**
 * Decide a group's level entries by hand: put them in order (after a coin
 * toss, a play-off, the referee's ruling). Used only where every tiebreak
 * has left entries level.
 */
export function DecideDialog({
  draft,
  update,
  categoryId,
  table,
  level,
  onClose,
}: {
  draft: PlanDraft;
  update: Update;
  categoryId: string;
  table: GroupTable;
  /** The entries level on every tiebreak, as the table has them. */
  level: string[];
  onClose: () => void;
}) {
  const [order, setOrder] = useState(level);
  const [note, setNote] = useState("");
  const move = (at: number, by: number) =>
    setOrder((list) => {
      const next = [...list];
      [next[at], next[at + by]] = [next[at + by]!, next[at]!];
      return next;
    });
  return (
    <FormDialog
      open
      onOpenChange={(open) => (open ? undefined : onClose())}
      title={`Decide Group ${table.letter} by hand`}
      description="These entries are level on every tiebreak. Put them in order, best first; everyone else keeps their place."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              update((d) => decideTie(d, { categoryId, group: table.index, order, note, now: now() }));
              onClose();
            }}
          >
            Decide
          </Button>
        </>
      }
    >
      <ol className="flex flex-col gap-1">
        {order.map((id, i) => {
          const entry = draft.entries.find((e) => e.id === id);
          const name = (entry && entryName(entry)) ?? "Unnamed entry";
          return (
            <li key={id} className="flex items-center gap-2 rounded-md border px-3 py-1">
              <span className="w-4 shrink-0 text-muted-foreground tabular-nums">{i + 1}</span>
              <span className="min-w-0 flex-1 truncate font-medium">{name}</span>
              <IconButton label={`Move ${name} up`} disabled={i === 0} onClick={() => move(i, -1)}>
                <ArrowUpIcon />
              </IconButton>
              <IconButton label={`Move ${name} down`} disabled={i === order.length - 1} onClick={() => move(i, 1)}>
                <ArrowDownIcon />
              </IconButton>
            </li>
          );
        })}
      </ol>
      <Note value={note} onChange={setNote} placeholder="Coin toss" />
    </FormDialog>
  );
}
