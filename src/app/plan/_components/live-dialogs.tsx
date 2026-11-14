"use client";

import { ArrowDownIcon, ArrowUpIcon, WarningIcon } from "@phosphor-icons/react";
import { produce } from "immer";
import { useId, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { FormDialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOptGroup, NativeSelectOption } from "@/components/ui/native-select";
import { awardMatch, decideKnockout, decideTie, planWithdrawal, withdrawEntry } from "@/lib/tournament/changes";
import { entryName, type PlanDraft } from "@/lib/tournament/draft";
import {
  categoryLabel,
  entryIdOn,
  groupStatus,
  groupTable,
  groupTables,
  knockoutLevel,
  knockoutRoundName,
  levelKnockoutTies,
  matchRef,
  sidePlayers,
  type GroupTable,
} from "@/lib/tournament/entries";
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
  // Who isn't checked in on each side: it says which side can't play.
  const rubber = draft.unit === "team" ? Number(/:r(\d+)$/.exec(matchId)?.[1] ?? 1) : undefined;
  const missing = (slot: string | undefined) =>
    !ref || !slot
      ? []
      : sidePlayers(draft, ref.categoryId, slot, rubber)
          .filter((p) => p.attendance !== "arrived")
          .map((p) => p.name.trim() || "A player");
  const out: [string[], string[]] = [missing(ref?.home), missing(ref?.away)];
  const [reason, setReason] = useState<"walkover" | "retired">(started ? "retired" : "walkover");
  // With players missing from one side only, the other side is the likely winner: picked to begin with, and still the desk's to change.
  const [winner, setWinner] = useState<"0" | "1" | "">(out[0].length > 0 && out[1].length === 0 ? "1" : out[1].length > 0 && out[0].length === 0 ? "0" : "");
  const [note, setNote] = useState("");
  if (!ref) return null;
  const home = sideOf(draft, ref.categoryId, ref.home);
  const away = sideOf(draft, ref.categoryId, ref.away);
  const rule = draft.rules.walkover ? WALKOVER_LABELS[draft.rules.walkover] : null;
  return (
    <FormDialog
      open
      onOpenChange={(open) => (open ? undefined : onClose())}
      title="Walkover"
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
            Give the match
          </Button>
        </>
      }
    >
      <Choices
        label="Who wins it"
        value={winner}
        onChange={setWinner}
        options={[
          {
            value: "0",
            label: home,
            detail: `${away} ${reason === "walkover" ? "didn't play" : "retired"}${out[1].length > 0 ? `. Not checked in from ${away}: ${out[1].join(", ")}` : ""}`,
          },
          {
            value: "1",
            label: away,
            detail: `${home} ${reason === "walkover" ? "didn't play" : "retired"}${out[0].length > 0 ? `. Not checked in from ${home}: ${out[0].join(", ")}` : ""}`,
          },
        ]}
      />
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

/** An entry's name by its id. */
function nameOf(draft: PlanDraft, id: string): string {
  const entry = draft.entries.find((e) => e.id === id);
  return (entry && entryName(entry)) ?? "Unnamed entry";
}

/**
 * Decide a knockout tie that ended level on rubbers, games and points: the
 * desk says who goes through (after a deciding game, a coin toss, the
 * referee's ruling). The scores stand as entered.
 */
export function DecideKnockoutDialog({
  draft,
  update,
  categoryId,
  code,
  onClose,
}: {
  draft: PlanDraft;
  update: Update;
  categoryId: string;
  code: string;
  onClose: () => void;
}) {
  const [winner, setWinner] = useState("");
  const [note, setNote] = useState("");
  const category = draft.categories.find((c) => c.id === categoryId);
  const level = category ? knockoutLevel(draft, category, code) : null;
  if (!level) return null;
  const home = nameOf(draft, level.home);
  const away = nameOf(draft, level.away);
  const round = knockoutRoundName(code);
  return (
    <FormDialog
      open
      onOpenChange={(open) => (open ? undefined : onClose())}
      title={`Decide ${round === "Final" || round === "Bronze match" ? `the ${round.toLowerCase()}` : round} by hand`}
      description={`${home} v ${away} ended level on rubbers, games and points. The scores stand as entered; this only says who it goes to.`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={winner === ""}
            onClick={() => {
              update((d) => void decideKnockout(d, { categoryId, code, winnerId: winner, note, now: now() }));
              onClose();
            }}
          >
            Decide
          </Button>
        </>
      }
    >
      <Choices
        label={code === "Final" ? "Who wins it" : code === "Bronze" ? "Who takes third place" : "Who goes through"}
        value={winner}
        onChange={setWinner}
        options={[
          { value: level.home, label: home },
          { value: level.away, label: away },
        ]}
      />
      <Note value={note} onChange={setNote} placeholder="Deciding game, 21–18" />
    </FormDialog>
  );
}

/**
 * What needs the desk, at the top of the Live side panel: why a simulation
 * has paused, courts that can't start, knockout ties that ended level (each
 * with its Decide button) and groups level on every tiebreak that hold the
 * knockout up. Nothing at all when nothing needs the desk and no simulation
 * is running. `footer` is the simulation's own line.
 */
export function NeedsYou({
  draft,
  update,
  paused,
  waiting,
  onCourt,
  onGroups,
  footer,
}: {
  draft: PlanDraft;
  update: Update;
  /** Why a simulation is waiting for the desk, in words; null when it isn't. */
  paused: string | null;
  /** Courts whose game can't start because a player isn't checked in, with their numbers. */
  waiting: { courtId: string; number: number | null }[];
  onCourt: (courtId: string) => void;
  /** Opens the group tables. */
  onGroups: () => void;
  footer?: ReactNode;
}) {
  const [deciding, setDeciding] = useState<{ categoryId: string; code: string } | null>(null);
  const ties = levelKnockoutTies(draft);
  // Groups whose places across the qualifying line are level on every tiebreak: the knockout can't be filled until the desk decides.
  const groups = draft.categories.flatMap((category) =>
    groupTables(draft, category)
      .filter((table) => table.rows.some((row) => groupStatus(table, row) === "level"))
      .map((table) => ({ categoryId: category.id, letter: table.letter })),
  );
  const several = draft.categories.length > 1;
  const link = "rounded-sm font-semibold underline decoration-primary decoration-2 underline-offset-2 outline-none hover:decoration-[3px] focus-visible:ring-2 focus-visible:ring-ring";
  const item = "flex items-start gap-2 text-sm";
  const mark = <WarningIcon className="mt-1 size-3 shrink-0 text-over-text" aria-hidden="true" />;
  const needs = (paused ? 1 : 0) + (waiting.length > 0 ? 1 : 0) + ties.length + groups.length;
  if (needs === 0 && !footer && !deciding) return null;
  return (
    <>
      {needs > 0 || footer ? (
        <div data-needs-you={needs} className="mx-4 mb-3 flex shrink-0 flex-col gap-2 rounded-lg bg-card-system py-2 pr-2 pl-3">
          {needs > 0 ? (
            <ul aria-label="Needs you" className="flex flex-col gap-2">
              {paused ? (
                <li className={item}>
                  {mark}
                  <span>{paused}.</span>
                </li>
              ) : null}
              {waiting.length > 0 ? (
                <li className={item}>
                  {mark}
                  <span>
                    {waiting.map((court, i) => (
                      <span key={court.courtId}>
                        {i > 0 ? ", " : ""}
                        <button type="button" className={link} onClick={() => onCourt(court.courtId)}>
                          Court {court.number ?? "?"}
                        </button>
                      </span>
                    ))}{" "}
                    can&apos;t start: players not checked in.
                  </span>
                </li>
              ) : null}
              {ties.map((tie) => (
                <li key={`${tie.categoryId}:${tie.code}`} data-level-tie={tie.code} className="flex items-center justify-between gap-3">
                  <p className={cn(item, "min-w-0")}>
                    {mark}
                    <span className="min-w-0">
                      <span className="font-semibold">
                        {several ? `${categoryLabel(draft, tie.categoryId)}, ` : ""}
                        {knockoutRoundName(tie.code)} ended level.
                      </span>{" "}
                      {nameOf(draft, tie.home)} v {nameOf(draft, tie.away)}: decide who {tie.code === "Final" ? "wins it" : tie.code === "Bronze" ? "takes third place" : "goes through"}.
                    </span>
                  </p>
                  <Button variant="outline" size="sm" onClick={() => setDeciding({ categoryId: tie.categoryId, code: tie.code })}>
                    Decide…
                  </Button>
                </li>
              ))}
              {groups.map((group) => (
                <li key={`${group.categoryId}:${group.letter}`} data-level-group={group.letter} className={item}>
                  {mark}
                  <span>
                    <span className="font-semibold">
                      {several ? `${categoryLabel(draft, group.categoryId)}, ` : ""}Group {group.letter} is level on every tiebreak.
                    </span>{" "}
                    <button type="button" className={link} onClick={onGroups}>
                      Decide it in the group tables
                    </button>
                    : the knockout waits for it.
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
          {footer}
        </div>
      ) : null}
      {deciding ? <DecideKnockoutDialog draft={draft} update={update} categoryId={deciding.categoryId} code={deciding.code} onClose={() => setDeciding(null)} /> : null}
    </>
  );
}
