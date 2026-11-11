import { groupLetter } from "@/engine";
import {
  categoryRules,
  courtNumber,
  entryName,
  newId,
  type LogEntryDraft,
  type LogKind,
  type MatchAwardDraft,
  type MatchResultDraft,
  type PlanDraft,
} from "./draft";
import {
  categoryLabel,
  categoryMatchIds,
  entryIdOn,
  groupTable,
  matchRef,
  sidesChanged,
  type MatchRef,
} from "./entries";
import { finishGame } from "./live";

// Controlled changes: the few things the desk may change while the tournament
// is Live. Each one writes a log entry with what it replaced, so it can be
// reversed. Every function here changes the draft in place.

/** Who makes a change until sign-in exists. */
export const DESK = "Desk";

export const LOG_KIND_LABELS: Record<LogKind, string> = {
  live: "Went Live",
  withdrawal: "Withdrawal",
  walkover: "Walkover",
  retirement: "Retirement",
  correction: "Score correction",
  move: "Court move",
  decision: "Tie decided",
  reversal: "Reversal",
};

const resultKey = (matchId: string) => `results/${matchId}`;
const MOVES = "matchMoves";
const STAGE = "stage";

function copy<T>(value: T): T {
  return value === undefined ? value : (JSON.parse(JSON.stringify(value)) as T);
}

/** What the draft holds under a log key; null for nothing. */
function read(draft: PlanDraft, key: string): unknown {
  if (key === MOVES) return copy(draft.matchMoves);
  if (key === STAGE) return draft.stage;
  const [where, ...rest] = key.split("/");
  const id = rest.join("/");
  const held =
    where === "results" ? draft.results[id] : where === "withdrawn" ? draft.withdrawn[id] : where === "decided" ? draft.decided[id] : undefined;
  return held === undefined ? null : copy(held);
}

/** Puts back what a log key held. */
function write(draft: PlanDraft, key: string, value: unknown): void {
  if (key === MOVES) {
    draft.matchMoves = copy(value) as PlanDraft["matchMoves"];
    return;
  }
  if (key === STAGE) {
    draft.stage = value as PlanDraft["stage"];
    return;
  }
  const [where, ...rest] = key.split("/");
  const id = rest.join("/");
  const map = (where === "results" ? draft.results : where === "withdrawn" ? draft.withdrawn : draft.decided) as Record<string, unknown>;
  if (value === null) delete map[id];
  else map[id] = copy(value);
}

/**
 * Makes a change and logs it: what the keys held is kept first, so the change
 * can be reversed. `before` gives a key's earlier value where it's no longer
 * in the draft (a score being corrected).
 */
function logged(
  draft: PlanDraft,
  entry: { kind: LogKind; text: string; note?: string; now: string },
  keys: string[],
  change: () => void,
  before?: Record<string, unknown>,
): LogEntryDraft {
  const kept = Object.fromEntries(keys.map((key) => [key, before && key in before ? copy(before[key]) : read(draft, key)]));
  change();
  const made: LogEntryDraft = {
    id: newId(),
    at: entry.now,
    by: DESK,
    kind: entry.kind,
    text: entry.text,
    note: entry.note?.trim() ?? "",
    before: kept,
    reversedAt: null,
  };
  draft.log.push(made);
  return made;
}

/**
 * The later change that must be reversed before this one can be: one still
 * standing that changed any of the same things. Null when it can be reversed
 * (or already has been, or is itself a reversal).
 */
export function reversalBlockedBy(draft: PlanDraft, entryId: string): LogEntryDraft | null {
  const at = draft.log.findIndex((e) => e.id === entryId);
  const entry = draft.log[at];
  if (!entry) return null;
  const keys = Object.keys(entry.before);
  return (
    draft.log
      .slice(at + 1)
      .reverse()
      .find((later) => later.kind !== "reversal" && later.reversedAt === null && keys.some((key) => key in later.before)) ?? null
  );
}

/** Whether a log entry can be reversed now. */
export function canReverse(draft: PlanDraft, entryId: string): boolean {
  const entry = draft.log.find((e) => e.id === entryId);
  return Boolean(entry) && entry!.kind !== "reversal" && entry!.reversedAt === null && reversalBlockedBy(draft, entryId) === null;
}

/** Puts back everything a change replaced, and logs that. Nothing happens if it can't be reversed. */
export function reverseChange(draft: PlanDraft, entryId: string, now: string, note?: string): boolean {
  if (!canReverse(draft, entryId)) return false;
  const entry = draft.log.find((e) => e.id === entryId)!;
  logged(draft, { kind: "reversal", text: `Reversed: ${entry.text}`, note, now }, Object.keys(entry.before), () => {
    for (const [key, value] of Object.entries(entry.before)) write(draft, key, value);
    entry.reversedAt = now;
  });
  return true;
}

/** The tournament goes Live: the first entry in the log. Reversing it takes the tournament back to the draw. */
export function goLive(draft: PlanDraft, now: string): void {
  logged(draft, { kind: "live", text: "The tournament went Live", now }, [STAGE], () => {
    draft.stage = "live";
  });
}

/** A side's name in a match, or where it comes from while it isn't known. */
function sideText(draft: PlanDraft, ref: MatchRef, side: 0 | 1): string {
  const slot = side === 0 ? ref.home : ref.away;
  const id = entryIdOn(draft, ref.categoryId, slot);
  const entry = id ? draft.entries.find((e) => e.id === id) : undefined;
  return entry ? (entryName(entry) ?? "Unnamed entry") : slot;
}

/** A match's scores in words: "21–17, 19–21", "walkover", "21–15, 11–5 retired". */
export function resultText(result: Pick<MatchResultDraft, "games" | "award"> | undefined): string {
  const games = (result?.games ?? []).filter(([home, away]) => home !== null || away !== null).map(([home, away]) => `${home ?? 0}–${away ?? 0}`);
  const mark = result?.award ? (result.award.reason === "walkover" ? "walkover" : "retired") : "";
  return [games.join(", "), mark].filter(Boolean).join(" ") || "no score";
}

/** The games a walkover is recorded with, by the tournament's rule: straight games at the stage's points, or none. */
function walkoverGames(draft: PlanDraft, ref: MatchRef, winner: 0 | 1): [number, number][] {
  if (draft.rules.walkover !== "straightGamesAtTarget") return [];
  const category = draft.categories.find((c) => c.id === ref.categoryId)!;
  const rules = categoryRules(draft, category)[ref.stage];
  if (!rules.pointsPerGame || !rules.bestOf) return [];
  const game: [number, number] = winner === 0 ? [rules.pointsPerGame, 0] : [0, rules.pointsPerGame];
  return Array.from({ length: Math.ceil(rules.bestOf / 2) }, () => [...game] as [number, number]);
}

/** Records a match as awarded, without logging: the entries that would play it are kept if known. */
function award(draft: PlanDraft, ref: MatchRef, given: MatchAwardDraft, now: string): void {
  const earlier = draft.results[ref.id];
  const home = entryIdOn(draft, ref.categoryId, ref.home);
  const away = entryIdOn(draft, ref.categoryId, ref.away);
  const sides = earlier?.sides ?? (home && away ? ([home, away] as [string, string]) : undefined);
  draft.results[ref.id] = {
    state: "finished",
    games: given.reason === "walkover" ? walkoverGames(draft, ref, given.winner) : (earlier?.games ?? []),
    startedAt: earlier?.startedAt ?? null,
    finishedAt: now,
    ...(sides ? { sides } : {}),
    award: given,
  };
}

/**
 * Gives a match to a side. A walkover (the other side didn't play) is scored
 * by the tournament's walkover rule. A retirement (the other side stopped
 * during play) keeps the scores entered; `open` says it stopped mid-game.
 * False if the match is already finished or isn't one of the schedule's.
 */
export function awardMatch(
  draft: PlanDraft,
  change: { matchId: string; winner: 0 | 1; reason: "walkover" | "retired"; open?: boolean; note?: string; now: string },
): boolean {
  const ref = matchRef(draft, change.matchId);
  if (!ref || draft.results[ref.id]?.state === "finished") return false;
  const winner = sideText(draft, ref, change.winner);
  const loser = sideText(draft, ref, change.winner === 0 ? 1 : 0);
  const walkover = change.reason === "walkover";
  logged(
    draft,
    {
      kind: walkover ? "walkover" : "retirement",
      text: walkover ? `${ref.label}: walkover to ${winner} (${loser} didn't play)` : `${ref.label}: ${loser} retired, so ${winner} win`,
      note: change.note,
      now: change.now,
    },
    [resultKey(ref.id)],
    () => award(draft, ref, { winner: change.winner, reason: change.reason, ...(change.open && !walkover ? { open: true } : {}) }, change.now),
  );
  return true;
}

export interface WithdrawalPlan {
  ok: true;
  stage: "group" | "knockout";
  /** The matches that become walkovers to the other side. */
  walkovers: string[];
  /** Group stage with results voided: the finished matches that stop counting. */
  voided: string[];
}

/**
 * What withdrawing an entry would do, without doing it. With group games
 * still to play it's a group-stage withdrawal: its remaining games are
 * walkovers (played results stand), or all its results are voided. After its
 * group has finished (or knockout only), its next knockout game is a walkover.
 * Refused while it has a game on court.
 */
export function planWithdrawal(
  draft: PlanDraft,
  entryId: string,
  results: "stand" | "void",
): WithdrawalPlan | { ok: false; reason: string } {
  const entry = draft.entries.find((e) => e.id === entryId);
  const category = entry ? draft.categories.find((c) => c.id === entry.categoryId) : undefined;
  if (!entry || !category) return { ok: false, reason: "That entry isn't in the tournament." };
  if (draft.withdrawn[entryId]) return { ok: false, reason: "It has already withdrawn." };
  const own = categoryMatchIds(draft, category)
    .map((id) => matchRef(draft, id))
    .filter((ref): ref is MatchRef => ref !== null)
    .filter((ref) => entryIdOn(draft, ref.categoryId, ref.home) === entryId || entryIdOn(draft, ref.categoryId, ref.away) === entryId);
  if (own.some((ref) => draft.results[ref.id]?.state === "onCourt")) {
    return { ok: false, reason: "It has a game on court. Finish or award that game first." };
  }
  const open = own.filter((ref) => draft.results[ref.id]?.state !== "finished");
  const group = draft.draw[category.id]?.groups.findIndex((ids) => ids.includes(entryId)) ?? -1;
  const table = draft.format === "knockout" || group === -1 ? null : groupTable(draft, category, group);
  if (table && !table.complete) {
    const inGroup = (ref: MatchRef) => ref.stage === "group";
    return results === "void"
      ? { ok: true, stage: "group", walkovers: [], voided: own.filter((ref) => inGroup(ref) && draft.results[ref.id]?.state === "finished").map((r) => r.id) }
      : { ok: true, stage: "group", walkovers: open.filter(inGroup).map((r) => r.id), voided: [] };
  }
  return { ok: true, stage: "knockout", walkovers: open.filter((ref) => ref.stage !== "group").map((r) => r.id), voided: [] };
}

/**
 * Withdraws an entry (a team or pair withdraws as a whole) and logs it. A
 * walkover can put it into another game (a semi-final's loser plays for
 * bronze): that one is given away too.
 */
export function withdrawEntry(
  draft: PlanDraft,
  change: { entryId: string; results: "stand" | "void"; note?: string; now: string },
): { ok: true } | { ok: false; reason: string } {
  const first = planWithdrawal(draft, change.entryId, change.results);
  if (!first.ok) return first;
  const entry = draft.entries.find((e) => e.id === change.entryId)!;
  const category = draft.categories.find((c) => c.id === entry.categoryId)!;
  const name = entryName(entry) ?? "Unnamed entry";
  // Everything it might touch: any of the category's matches not yet finished.
  const keys = [
    `withdrawn/${entry.id}`,
    ...categoryMatchIds(draft, category)
      .filter((id) => draft.results[id]?.state !== "finished")
      .map(resultKey),
  ];
  let given = 0;
  const made = logged(draft, { kind: "withdrawal", text: "", note: change.note, now: change.now }, keys, () => {
    draft.withdrawn[entry.id] = { at: change.now, stage: first.stage, results: first.stage === "group" ? change.results : "stand" };
    // A knockout walkover can put it in another game: until nothing more falls to it.
    let ids = first.walkovers;
    for (let round = 0; round < 8 && ids.length > 0; round++) {
      for (const id of ids) {
        const ref = matchRef(draft, id)!;
        const winner: 0 | 1 = entryIdOn(draft, ref.categoryId, ref.home) === entry.id ? 1 : 0;
        award(draft, ref, { winner, reason: "walkover" }, change.now);
        given += 1;
      }
      ids = first.stage === "knockout" ? openKnockoutGames(draft, entry.id) : [];
    }
  });
  // Only what it changed is kept for reversing.
  for (const key of Object.keys(made.before)) {
    if (key.startsWith("results/") && JSON.stringify(read(draft, key)) === JSON.stringify(made.before[key])) delete made.before[key];
  }
  const games = (n: number) => `${n} ${n === 1 ? "game" : "games"}`;
  made.text =
    `${name} withdrew from ${categoryLabel(draft, category.id)}: ` +
    (first.stage === "group" && change.results === "void"
      ? first.voided.length > 0
        ? `its ${games(first.voided.length)} already played no longer count`
        : "it had played no games"
      : given > 0
        ? `${games(given)} given as ${given === 1 ? "a walkover" : "walkovers"}`
        : "it had no games left to play");
  return { ok: true };
}

/** The knockout matches a withdrawn entry is now in and hasn't finished. */
function openKnockoutGames(draft: PlanDraft, entryId: string): string[] {
  const entry = draft.entries.find((e) => e.id === entryId)!;
  const category = draft.categories.find((c) => c.id === entry.categoryId)!;
  return categoryMatchIds(draft, category)
    .map((id) => matchRef(draft, id))
    .filter((ref): ref is MatchRef => ref !== null && ref.stage !== "group")
    .filter((ref) => draft.results[ref.id]?.state !== "finished")
    .filter((ref) => entryIdOn(draft, ref.categoryId, ref.home) === entryId || entryIdOn(draft, ref.categoryId, ref.away) === entryId)
    .map((ref) => ref.id);
}

/** Who a result gives the match to: 0 home, 1 away, null when the scores don't say. */
function winnerOf(result: Pick<MatchResultDraft, "games" | "award">): 0 | 1 | null {
  if (result.award) return result.award.winner;
  let home = 0;
  let away = 0;
  for (const [h, a] of result.games) {
    if ((h ?? 0) > (a ?? 0)) home += 1;
    else if ((a ?? 0) > (h ?? 0)) away += 1;
  }
  return home > away ? 0 : away > home ? 1 : null;
}

/**
 * Finishes a match. One that had been reopened to correct its score is
 * logged with both scores, whether the winner changed, and any later game
 * whose sides no longer match who played it. A first-time score isn't a
 * controlled change and isn't logged.
 */
export function finishMatch(draft: PlanDraft, matchId: string, now: string, note?: string): void {
  const result = draft.results[matchId];
  if (!result) return;
  const was = result.was;
  delete result.was;
  finishGame(draft, matchId, now);
  if (!was) return;
  const ref = matchRef(draft, matchId);
  const before = resultText(was);
  const after = resultText(result);
  if (!ref || before === after) return;
  const from = winnerOf(was);
  const to = winnerOf(result);
  const category = draft.categories.find((c) => c.id === ref.categoryId)!;
  // Later games already started whose sides the results no longer agree with.
  const flagged = [
    ...new Set(
      categoryMatchIds(draft, category)
        .map((id) => matchRef(draft, id))
        .filter((r): r is MatchRef => r !== null && r.id !== matchId && sidesChanged(draft, r.categoryId, r.id, r.home, r.away))
        .map((r) => r.label),
    ),
  ];
  logged(
    draft,
    {
      kind: "correction",
      text:
        `${ref.label}, ${sideText(draft, ref, 0)} v ${sideText(draft, ref, 1)}: corrected from ${before} to ${after}` +
        (from !== to && to !== null ? `; ${sideText(draft, ref, to)} now win it` : "") +
        (flagged.length > 0 ? `. Sides changed since they were played: ${flagged.join(", ")}` : ""),
      note,
      now,
    },
    [resultKey(matchId)],
    () => {},
    { [resultKey(matchId)]: { ...copy(result), games: was.games, finishedAt: was.finishedAt, award: was.award } },
  );
}

/** A court's number across the venue; null if it isn't there. */
function courtNo(draft: PlanDraft, courtId: string): number | null {
  for (const [h, hall] of draft.frame.halls.entries()) {
    const c = hall.courts.findIndex((court) => court.id === courtId);
    if (c !== -1) return courtNumber(draft.frame.halls, h, c);
  }
  return null;
}

/** Moves a game to a court, before another game there (or last), and logs it. A finished game or one on court stays put. */
export function moveGame(
  draft: PlanDraft,
  change: { matchId: string; fromCourtId: string; target: { courtId: string; before: string | null }; note?: string; now: string },
): boolean {
  const ref = matchRef(draft, change.matchId);
  if (!ref || draft.results[change.matchId]) return false;
  const from = courtNo(draft, change.fromCourtId);
  const to = courtNo(draft, change.target.courtId);
  const what = `${ref.label}, ${sideText(draft, ref, 0)} v ${sideText(draft, ref, 1)}`;
  const next = change.target.before ? matchRef(draft, change.target.before) : null;
  logged(
    draft,
    {
      kind: "move",
      text:
        change.fromCourtId === change.target.courtId
          ? `${what}: moved in Court ${to}'s order, ${next ? `to before ${next.label}` : "to last"}`
          : `${what}: moved from Court ${from} to Court ${to}`,
      note: change.note,
      now: change.now,
    },
    [MOVES],
    () => {
      draft.matchMoves[change.matchId] = change.target;
    },
  );
  return true;
}

/** Puts a group's entries that are level on every tiebreak in an order decided by hand, and logs it. */
export function decideTie(
  draft: PlanDraft,
  change: { categoryId: string; group: number; order: string[]; note?: string; now: string },
): void {
  const key = `${change.categoryId}:${change.group}`;
  const names = change.order.map((id, i) => {
    const entry = draft.entries.find((e) => e.id === id);
    return `${i + 1}. ${(entry && entryName(entry)) ?? "Unnamed entry"}`;
  });
  const of = draft.categories.length > 1 ? `${categoryLabel(draft, change.categoryId)}, ` : "";
  logged(
    draft,
    { kind: "decision", text: `${of}Group ${groupLetter(change.group)}: level entries placed by hand: ${names.join("; ")}`, note: change.note, now: change.now },
    [`decided/${key}`],
    () => {
      draft.decided[key] = change.order;
    },
  );
}
