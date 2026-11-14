import type { Analysis } from "./analyse";
import { available } from "./capacity";
import { groupKey, resolveGroupCourts } from "./court-groups";
import { groupMatchCount } from "./format";
import { groupFixtures, groupLetter, knockoutBracket } from "./fixtures";
import type { EventType, Stage, TournamentInputs, WindowKey, Zone } from "./types";

// A first estimate of the day, until the scheduler is built. Two passes:
// 1. Assignment: matches go in play order onto the first court that can
//    start them (groups in their hall, on their own courts when the plan
//    keeps groups to their courts; the knockout in the halls allowed),
//    then any matches moved by hand change court or order, and a tie's
//    rubbers on one court are brought together.
// 2. Timing: every match starts at the earliest time its court, its zone,
//    its feeders and its sides allow. A court keeps its order, except that
//    it never stands empty while another of its matches could be played:
//    that one goes first, and the one that was waiting follows.
// A competition's knockout waits for all of its group matches. A zone
// dragged later holds every hall's matches of that stage back, and never
// changes the court a match is on. Rest between matches isn't modelled.

/** Where a match sits in its stage: a group wave or a knockout round. */
export type Round = { type: "wave"; wave: number } | { type: "knockout"; size: number } | null;

/** Everything needed to run one match: who plays, in what, and where it sits. */
export interface MatchInfo {
  categoryId: string;
  stage: Stage;
  /** Group stage: the group's letter and the wave. */
  group?: string;
  wave?: number;
  /** Knockout: the round's size (8 for quarter-finals) and the match code ("QF1", "Final", "Bronze"). */
  roundSize?: number;
  code?: string;
  /** Draw slots until entries exist: "A1", "Winner A", "Winner QF1". */
  home: string;
  away: string;
  /** Team ties: which rubber of how many, and its event. */
  rubber?: { number: number; of: number; event: EventType };
}

/** Why a match starts later than its court is free. */
export type Wait =
  | { type: "feeder"; code: string }
  | { type: "group"; group: string }
  /** A knockout match waiting for its competition's group stage to finish. */
  | { type: "groups" }
  | { type: "side"; side: string; courtId: string; until: string }
  | { type: "zone"; until: string };

export interface Segment {
  /** UTC ISO. */
  from: string;
  to: string;
  stage: Stage;
  round: Round;
  categoryId: string;
  /** One match a segment. */
  matches: number;
  details: {
    from: string;
    to: string;
    match: MatchInfo;
    id: string;
    moved: boolean;
    /** A group match played on a court that isn't its group's own, once that court had nothing of its own left. */
    borrowed?: boolean;
    wait?: Wait;
    /** Runs past its court's closing time. */
    late: boolean;
  }[];
}

export interface CourtSchedule {
  hallId: string;
  courtId: string;
  segments: Segment[];
}

/** A stage zone as shown in a hall. A stage's zone is the same in every hall that plays it. */
export interface WindowSpan {
  /** UTC ISO: the stage's first match's start and its last match's end, across every hall. */
  from: string;
  to: string;
  /** Categories playing in the zone, in category order. */
  categoryIds: string[];
  /** Moved by hand: in time, or here from another hall. */
  moved: boolean;
  /** Dragged to start before what it depends on has finished: when that is. */
  earliest?: string;
  /** Matches of the zone in this hall that run past their court's closing time. */
  late: number;
}

/** The groups a court plays in the group stage, when groups keep their own courts. */
export interface CourtGroups {
  courtId: string;
  groups: { categoryId: string; groupIndex: number; group: string }[];
  /** Set by hand: given to its group, or to none. */
  pinned: boolean;
}

/** A group left with no court of its own, and the court it shares until one is chosen. */
export interface HomelessGroupInfo {
  categoryId: string;
  groupIndex: number;
  group: string;
  courtId: string;
}

export interface EstimatedSchedule {
  /** Each hall's group and KO zones, keyed "hallId:group" or "hallId:knockout". */
  windows: Partial<Record<WindowKey, WindowSpan>>;
  courts: CourtSchedule[];
  /** First start and last end of each stage played. */
  stages: Partial<Record<Stage, { from: string; to: string }>>;
  /** When the last match ends at typical length; null when nothing is placed. */
  finish: string | null;
  /** The same, every match at worst-case length. */
  worstFinish: string | null;
  /** Matches with no court they may use (e.g. a hall with no courts). */
  unplaced: number;
  /** Matches that run past their court's closing time: still placed, flagged. */
  late: number;
  /** Each court's groups when groups keep their own courts; empty when courts are shared. */
  courtGroups: CourtGroups[];
  /** Groups left with no court of their own, each sharing a court meanwhile. */
  homeless: HomelessGroupInfo[];
}

/** The zone a stage is played in: the group stage, or the knockout with its bronze match and final. */
export function zoneOf(stage: Stage): Zone {
  return stage === "group" ? "group" : "knockout";
}

export function zoneKey(hallId: string, zone: Zone): WindowKey {
  return `${hallId}:${zone}`;
}

/** A match as planned: who, what it waits for, and where it may be played. */
interface Planned {
  id: string;
  /** The tie it belongs to: a team's rubbers share one and may run side by side. */
  tie: string;
  info: MatchInfo;
  round: Round;
  /** Matches that must finish first: feeders, or a group whose places decide a side. */
  deps: { ids: string[]; wait: Wait }[];
  /** The sides, which can't be in two ties at once. */
  sides: string[];
  /** Halls it may be played in. */
  halls: Set<string>;
  /** Courts it may be played on, when its group keeps its own courts. */
  courts?: Set<string>;
  /** Assignment-pass release: when its category is ready. */
  release: number;
}

interface Timed {
  planned: Planned;
  court: number;
  from: number;
  to: number;
  moved: boolean;
  borrowed: boolean;
  wait?: Wait;
  late: boolean;
}

const MS_PER_MINUTE = 60_000;

/** A category's rubbers in a tie, in line-up order; one plain match for individual entries. */
function rubbersOf(inputs: TournamentInputs, categoryId: string): MatchInfo["rubber"][] {
  const category = inputs.categories.find((c) => c.id === categoryId);
  if (!category || category.entry.type === "individual") return [undefined];
  const events = category.entry.lineUp.flatMap((item) => Array.from({ length: item.count }, () => item.event));
  return events.map((event, i) => ({ number: i + 1, of: events.length, event }));
}

/**
 * Each group's courts when groups keep their own: per hall, the groups placed
 * there share its courts (see assignGroupCourts). Empty when courts are shared.
 */
function groupCourtsOf(inputs: TournamentInputs, analysis: Analysis, hallOfGroup: Map<string, string>) {
  const courtsOf = new Map<string, Set<string>>();
  const courtGroups: CourtGroups[] = [];
  const homeless: HomelessGroupInfo[] = [];
  if (inputs.groupCourts !== "own") return { courtsOf, courtGroups, homeless };
  const pins = new Map(
    (inputs.courtGroups ?? []).map((p) => [p.courtId, p.group ? groupKey(p.group.categoryId, p.group.groupIndex) : ""]),
  );
  const loads = analysis.categories.flatMap((c) =>
    c.format.groupSizes.flatMap((size, groupIndex) => {
      const hallId = hallOfGroup.get(groupKey(c.categoryId, groupIndex));
      return hallId ? [{ categoryId: c.categoryId, groupIndex, courtMinutes: groupMatchCount(size) * c.rubbersPerFixture, hallId }] : [];
    }),
  );
  const halls = inputs.frame.halls.map((h) => ({ hallId: h.id, courtIds: h.courts.map((c) => c.id) }));
  const resolved = resolveGroupCourts(halls, loads, pins);
  for (const [key, ids] of resolved.courtsOf) courtsOf.set(key, new Set(ids));
  for (const courtId of halls.flatMap((h) => h.courtIds)) {
    courtGroups.push({
      courtId,
      groups: loads
        .filter((g) => resolved.courtsOf.get(groupKey(g.categoryId, g.groupIndex))!.includes(courtId))
        .map((g) => ({ categoryId: g.categoryId, groupIndex: g.groupIndex, group: groupLetter(g.groupIndex) })),
      pinned: pins.has(courtId),
    });
  }
  for (const h of resolved.homeless) {
    const g = loads.find((l) => groupKey(l.categoryId, l.groupIndex) === h.key)!;
    homeless.push({ categoryId: g.categoryId, groupIndex: g.groupIndex, group: groupLetter(g.groupIndex), courtId: h.courtId });
  }
  return { courtsOf, courtGroups, homeless };
}

/** Every match in play order, with its dependencies and the halls (and courts) it may use. */
function plan(inputs: TournamentInputs, analysis: Analysis, dayStart: number) {
  const halls = inputs.frame.halls.map((h) => h.id);
  const moves = new Map((inputs.zoneMoves ?? []).filter((m) => m.hallId).map((m) => [m.key, m.hallId!]));
  const target = (hallId: string, zone: Zone) => {
    const to = moves.get(zoneKey(hallId, zone));
    return to && halls.includes(to) ? to : hallId;
  };
  const hallOfGroup = new Map<string, string>();
  for (const hall of analysis.groupsPerHall) {
    for (const g of hall.groups) hallOfGroup.set(`${g.categoryId}:${g.groupIndex}`, target(hall.hallId, "group"));
  }
  // With one hall, every group plays there.
  if (halls.length === 1) {
    for (const c of analysis.categories) {
      c.format.groupSizes.forEach((_, g) => hallOfGroup.set(`${c.categoryId}:${g}`, target(halls[0]!, "group")));
    }
  }
  const knockoutHalls = new Set(halls.map((h) => target(h, "knockout")));
  const allHalls = new Set(halls.map((h) => target(h, "group")));
  const { courtsOf, courtGroups, homeless } = groupCourtsOf(inputs, analysis, hallOfGroup);
  const hallOfCourt = new Map(inputs.frame.halls.flatMap((h) => h.courts.map((c) => [c.id, h.id] as const)));

  const steps: Planned[][] = [];
  // Every group match of a category: its knockout waits for them all.
  const groupIds = new Map<string, string[]>();
  const byGroup = new Map<string, string[]>();
  const byCode = new Map<string, string[]>();
  const make = (
    base: Omit<MatchInfo, "rubber">,
    round: Round,
    tie: string,
    hallSet: Set<string>,
    deps: Planned["deps"],
    release: number,
  ): Planned[] =>
    rubbersOf(inputs, base.categoryId).map((rubber) => ({
      id: `${tie}:r${rubber?.number ?? 1}`,
      tie,
      info: { ...base, rubber },
      round,
      deps,
      sides: [`${base.categoryId}:${base.home}`, `${base.categoryId}:${base.away}`],
      halls: hallSet,
      release,
    }));

  /** What a knockout side waits for: a group's places, or an earlier match. */
  const sideDeps = (categoryId: string, side: string): Planned["deps"] => {
    const place = /^(?:Winner|Runner-up|\d+(?:st|nd|rd|th)) ([A-Z]|G\d+)$/.exec(side);
    if (place) {
      const ids = byGroup.get(`${categoryId}:${place[1]}`) ?? [];
      return ids.length > 0 ? [{ ids, wait: { type: "group", group: place[1]! } }] : [];
    }
    const match = /^(?:Winner|Loser) (\S+)$/.exec(side);
    if (match) {
      const ids = byCode.get(`${categoryId}:${match[1]}`) ?? [];
      return ids.length > 0 ? [{ ids, wait: { type: "feeder", code: match[1]! } }] : [];
    }
    return [];
  };

  const categories = analysis.categories;
  const draws = new Map(categories.map((c) => [c.categoryId, c.format.groupSizes.map((size) => groupFixtures(size))]));
  const waves = Math.max(0, ...categories.map((c) => c.waves.waves));
  for (let w = 0; w < waves; w++) {
    const step: Planned[] = [];
    // Categories take turns match by match, so they progress side by side.
    const lists = categories.map((c) =>
      draws.get(c.categoryId)!.flatMap((rounds, g) =>
        (rounds[w] ?? []).flatMap(([a, b]) => {
          const letter = groupLetter(g);
          const tie = `${c.categoryId}:group:${letter}:${letter}${a}-${letter}${b}`;
          const hall = hallOfGroup.get(`${c.categoryId}:${g}`);
          const courts = courtsOf.get(groupKey(c.categoryId, g));
          const matches = make(
            { categoryId: c.categoryId, stage: "group", group: letter, wave: w + 1, home: `${letter}${a}`, away: `${letter}${b}` },
            { type: "wave", wave: w + 1 },
            tie,
            // On its own courts, the group plays in their halls (one may be given a court in another).
            courts && courts.size > 0
              ? new Set([...courts].map((id) => hallOfCourt.get(id)!))
              : hall
                ? new Set([hall])
                : allHalls,
            [],
            dayStart,
          ).map((m) => (courts && courts.size > 0 ? { ...m, courts } : m));
          const key = `${c.categoryId}:${letter}`;
          byGroup.set(key, [...(byGroup.get(key) ?? []), ...matches.map((m) => m.id)]);
          groupIds.set(c.categoryId, [...(groupIds.get(c.categoryId) ?? []), ...matches.map((m) => m.id)]);
          return matches;
        }),
      ),
    );
    for (let i = 0; lists.some((l) => i < l.length); i++) for (const list of lists) if (list[i]) step.push(list[i]!);
    steps.push(step);
  }

  const brackets = new Map(
    categories.map((c) => {
      const category = inputs.categories.find((x) => x.id === c.categoryId);
      return [c.categoryId, knockoutBracket(c.format.qualifiers, c.format.groupSizes.length, Boolean(category?.bronze))];
    }),
  );
  const beforeFinal = (id: string) => brackets.get(id)!.rounds.filter((r) => r.size > 2);
  const levels = Math.max(0, ...categories.map((c) => beforeFinal(c.categoryId).length));
  const knockoutMatch = (categoryId: string, code: string, base: Omit<MatchInfo, "rubber" | "categoryId">, round: Round) => {
    const tie = `${categoryId}:ko:${code}`;
    const groups = groupIds.get(categoryId) ?? [];
    const deps: Planned["deps"] = [
      ...(groups.length > 0 ? [{ ids: groups, wait: { type: "groups" } as Wait }] : []),
      ...sideDeps(categoryId, base.home),
      ...sideDeps(categoryId, base.away),
    ];
    const matches = make({ ...base, categoryId }, round, tie, knockoutHalls, deps, dayStart);
    byCode.set(`${categoryId}:${code}`, matches.map((m) => m.id));
    return matches;
  };
  for (let level = levels; level >= 1; level--) {
    const lists = categories.map((c) => {
      const own = beforeFinal(c.categoryId);
      const round = own[own.length - level];
      if (!round || c.matches.knockout === 0) return [];
      return round.matches.flatMap((m) =>
        knockoutMatch(
          c.categoryId,
          m.code,
          { stage: "knockout", roundSize: round.size, code: m.code, home: m.home, away: m.away },
          { type: "knockout", size: round.size },
        ),
      );
    });
    const step: Planned[] = [];
    for (let i = 0; lists.some((l) => i < l.length); i++) for (const list of lists) if (list[i]) step.push(list[i]!);
    steps.push(step);
  }
  const lists = categories.map((c) => {
    const bracket = brackets.get(c.categoryId)!;
    const final = bracket.rounds.find((r) => r.size === 2)?.matches[0];
    return [
      ...(bracket.bronze && c.matches.bronze > 0
        ? knockoutMatch(c.categoryId, "Bronze", { stage: "bronze", code: "Bronze", home: bracket.bronze.home, away: bracket.bronze.away }, null)
        : []),
      ...(final && c.matches.final > 0
        ? knockoutMatch(c.categoryId, "Final", { stage: "final", code: "Final", home: final.home, away: final.away }, null)
        : []),
    ];
  });
  const last: Planned[] = [];
  for (let i = 0; lists.some((l) => i < l.length); i++) for (const list of lists) if (list[i]) last.push(list[i]!);
  steps.push(last);
  return { steps, courtGroups, homeless };
}

/** Places the day at one slot length: assignment, moves by hand, then timing. */
function place(inputs: TournamentInputs, analysis: Analysis, length: "typical" | "worst") {
  // A court's closing time as hired: the buffer is not a wall, so a match is late only past this.
  const closes = new Map(inputs.frame.halls.flatMap((h) => h.courts.map((c) => [c.id, Date.parse(c.to)] as const)));
  const courts = available(inputs.frame).courts.map((c) => ({
    ...c,
    start: Date.parse(c.from),
    end: closes.get(c.courtId) ?? Date.parse(c.to),
  }));
  const dayStart = Date.parse(available(inputs.frame).start);
  // Each category's own slot length in each stage.
  const slots = new Map(analysis.slots.map((s) => [`${s.categoryId}:${s.stage}`, s.minutes[length] * MS_PER_MINUTE]));
  const slot = { get: (info: MatchInfo) => slots.get(`${info.categoryId}:${info.stage}`) };
  // A zone dragged later starts no earlier than that in every hall: the stage moves as one.
  const zoneStarts = new Map<Zone, number>();
  for (const m of inputs.zoneMoves ?? []) {
    if (!m.start) continue;
    const zone: Zone = m.key.endsWith(":group") ? "group" : "knockout";
    zoneStarts.set(zone, Math.max(zoneStarts.get(zone) ?? -Infinity, Date.parse(m.start)));
  }
  const zoneStart = (stage: Stage) => zoneStarts.get(zoneOf(stage)) ?? -Infinity;
  const { steps, courtGroups, homeless } = plan(inputs, analysis, dayStart);
  // Groups on their own courts move on group by group; otherwise a category waits for its whole step.
  const own = inputs.groupCourts === "own";
  const gate = (info: MatchInfo) => (own && info.stage === "group" ? `${info.categoryId}:${info.group}` : info.categoryId);

  // 1. Assignment: play order onto the first court that can start each match.
  // Closing times and dragged zones play no part, so changing a hall's or
  // court's hours or dragging a zone never moves matches between courts; a
  // match that runs past closing is flagged.
  //
  // Groups on their own courts are placed twice. First on their own courts only, which says
  // when each court's own groups have finished there. Then again, now free to borrow a court
  // of their hall from that time on, so the group stage ends level instead of leaving courts
  // empty while others queue. A court set to no group is never lent.
  const closed = new Set(courtGroups.filter((c) => c.pinned && c.groups.length === 0).map((c) => c.courtId));
  const assign = (lendFrom: number[] | null) => {
    const freeAt = courts.map((c) => c.start);
    // A lent court's borrowed matches run after its own, on a clock of their own.
    const lentFreeAt = lendFrom ? [...lendFrom] : [];
    const placed: { match: Planned; start: number; order: number }[][] = courts.map(() => []);
    const ownEnd = courts.map((c) => c.start);
    const ready = new Map<string, number>();
    const borrowed = new Set<string>();
    let unplaced = 0;
    let order = 0;
    for (const step of steps) {
      const ends = new Map<string, number>();
      for (const match of step) {
        const minutes = slot.get(match.info);
        if (minutes === undefined) continue;
        const release = Math.max(match.release, ready.get(gate(match.info)) ?? -Infinity);
        let best = -1;
        let bestStart = Infinity;
        let bestOwn = false;
        courts.forEach((court, i) => {
          if (!match.halls.has(court.hallId)) return;
          const own = !match.courts || match.courts.has(court.courtId);
          if (!own && (!lendFrom || closed.has(court.courtId))) return;
          // A group match on its own court keeps to the court's own clock; a borrowed one to the lent
          // clock; anything else (the knockout) waits for both.
          const free = !own ? lentFreeAt[i]! : match.courts || !lendFrom ? freeAt[i]! : Math.max(freeAt[i]!, lentFreeAt[i]!);
          const start = Math.max(free, release, court.start);
          // Its own court wins a tie with a borrowed one.
          if (start < bestStart || (start === bestStart && own && !bestOwn)) {
            best = i;
            bestStart = start;
            bestOwn = own;
          }
        });
        if (best === -1) {
          unplaced += 1;
          continue;
        }
        const end = bestStart + minutes;
        if (bestOwn) {
          freeAt[best] = end;
          // When the court's own groups have finished there: only their matches count.
          if (match.courts) ownEnd[best] = Math.max(ownEnd[best]!, end);
          // What it lends starts after its own, however the two were placed.
          if (lendFrom) lentFreeAt[best] = Math.max(lentFreeAt[best]!, end);
        } else {
          lentFreeAt[best] = end;
          borrowed.add(match.id);
        }
        placed[best]!.push({ match, start: bestStart, order: order++ });
        const id = gate(match.info);
        ends.set(id, Math.max(ends.get(id) ?? -Infinity, end));
        // A category's knockout waits for all its groups, whichever way its groups move on.
        if (match.info.stage === "group") ends.set(match.info.categoryId, Math.max(ends.get(match.info.categoryId) ?? -Infinity, end));
      }
      // A category's next step waits for this one.
      for (const [id, end] of ends) ready.set(id, Math.max(ready.get(id) ?? -Infinity, end));
    }
    // Each court in the order its matches start.
    const queues = placed.map((list) => list.sort((a, b) => a.start - b.start || a.order - b.order).map((p) => p.match));
    return { queues, unplaced, borrowed, ownEnd };
  };
  let assigned = assign(null);
  if (own && steps.some((step) => step.some((m) => m.courts))) assigned = assign(assigned.ownEnd);
  const { queues, borrowed } = assigned;
  let unplaced = assigned.unplaced;

  // Moves by hand: onto any court, in any hall, before a match there (or last). The organiser's
  // choice overrides where the match would otherwise be played.
  const moved = new Set<string>();
  const courtIndex = new Map(courts.map((c, i) => [c.courtId, i]));
  for (const move of inputs.matchMoves ?? []) {
    const to = courtIndex.get(move.courtId);
    const from = queues.findIndex((q) => q.some((m) => m.id === move.matchId));
    if (to === undefined || from === -1) continue;
    const match = queues[from]!.find((m) => m.id === move.matchId)!;
    queues[from] = queues[from]!.filter((m) => m.id !== move.matchId);
    const at = move.before ? queues[to]!.findIndex((m) => m.id === move.before) : -1;
    if (at === -1) queues[to]!.push(match);
    else queues[to]!.splice(at, 0, match);
    moved.add(match.id);
  }
  // Wherever matches were moved, a court plays its group-stage matches before its knockout
  // matches. (A move is kept as "before that match"; when that match is no longer on the court,
  // the moved one goes last, which must not mean after the knockout.)
  // And a tie's rubbers on one court are played back to back: they come together at the
  // earliest one's place, and the court's other matches follow.
  queues.forEach((queue, i) => {
    const staged = [...queue.filter((m) => zoneOf(m.info.stage) === "group"), ...queue.filter((m) => zoneOf(m.info.stage) !== "group")];
    const together: Planned[] = [];
    const seen = new Set<string>();
    for (const m of staged) {
      if (seen.has(m.tie)) continue;
      seen.add(m.tie);
      together.push(...staged.filter((x) => x.tie === m.tie));
    }
    queues[i] = together;
  });

  // 2. Timing: each match at the earliest time allowed. A court takes its matches in order,
  // but never stands empty while a later one of its matches could be played.
  const ends = new Map<string, number>();
  const busy = new Map<string, { tie: string; from: number; to: number; court: number }[]>();
  const timed: Timed[] = [];
  const left = queues.map((q) => [...q]);
  // The court is part-way through a tie's rubbers: the next one follows, whatever else could be played.
  const stapled = courts.map(() => false);
  const courtFree = courts.map((c) => c.start);
  const known = new Set(queues.flat().map((m) => m.id));
  /** Feeders of a match not yet timed. */
  const pending = (match: Planned) => match.deps.some((d) => d.ids.some((id) => known.has(id) && !ends.has(id)));
  /** When a match could start on a court, given everything timed so far, and what it waits for. */
  const startOf = (i: number, match: Planned): { start: number; floor: number; wait?: Wait } => {
    const minutes = slot.get(match.info)!;
    let start = Math.max(courtFree[i]!, courts[i]!.start, dayStart);
    let wait: Wait | undefined;
    const zone = zoneStart(match.info.stage);
    if (zone > start) {
      start = zone;
      wait = { type: "zone", until: new Date(zone).toISOString() };
    }
    // The earliest the court itself allows: a match starting then is not waiting for anything.
    const floor = start;
    for (const dep of match.deps) {
      const done = Math.max(-Infinity, ...dep.ids.map((id) => ends.get(id) ?? -Infinity));
      if (done > start) {
        start = done;
        wait = dep.wait;
      }
    }
    // A side can't be in two ties at once: wait until it's free.
    for (let clash = true; clash; ) {
      clash = false;
      for (const side of match.sides) {
        for (const b of busy.get(side) ?? []) {
          if (b.tie !== match.tie && b.from < start + minutes && start < b.to) {
            start = b.to;
            wait = { type: "side", side: side.slice(match.info.categoryId.length + 1), courtId: courts[b.court]!.courtId, until: new Date(b.to).toISOString() };
            clash = true;
          }
        }
      }
    }
    return { start, floor, wait };
  };
  for (;;) {
    let best: { court: number; at: number; start: number; wait?: Wait } | null = null;
    for (let i = 0; i < courts.length; i++) {
      const queue = left[i]!;
      // The court's pick: its first match that can start as soon as the court allows; failing that, the one that can start soonest.
      let pick: { at: number; start: number; wait?: Wait } | null = null;
      for (let k = 0; k < queue.length; k++) {
        const match = queue[k]!;
        // A tie's later rubbers follow its first: they are never picked ahead of it.
        if (k > 0 && queue[k - 1]!.tie === match.tie) continue;
        if (!pending(match)) {
          const { start, floor, wait } = startOf(i, match);
          if (!pick || start < pick.start) pick = { at: k, start, wait };
          if (start <= floor) break;
        }
        if (stapled[i]) break;
      }
      if (pick && (!best || pick.start < best.start)) best = { court: i, ...pick };
    }
    // Nothing left that can be timed: what remains waits on matches that were never placed.
    if (!best) break;
    const i = best.court;
    const queue = left[i]!;
    const [match] = queue.splice(best.at, 1);
    // The rest of its tie's rubbers there come next.
    const rest = queue.filter((m) => m.tie === match!.tie);
    if (rest.length > 0) left[i] = [...rest, ...queue.filter((m) => m.tie !== match!.tie)];
    stapled[i] = rest.length > 0;
    const minutes = slot.get(match!.info)!;
    courtFree[i] = best.start + minutes;
    ends.set(match!.id, best.start + minutes);
    for (const side of match!.sides) {
      busy.set(side, [...(busy.get(side) ?? []), { tie: match!.tie, from: best.start, to: best.start + minutes, court: i }]);
    }
    timed.push({
      planned: match!,
      court: i,
      from: best.start,
      to: best.start + minutes,
      moved: moved.has(match!.id),
      borrowed: borrowed.has(match!.id) && !moved.has(match!.id),
      wait: best.wait,
      // Runs past its court's closing time: still shown, flagged. (The buffer is not a wall.)
      late: best.start + minutes > courts[i]!.end,
    });
  }

  // Anything that still couldn't be timed is reported, never dropped silently.
  unplaced += left.reduce((n, queue) => n + queue.length, 0);
  return { timed, unplaced, courts, courtGroups, homeless };
}

const iso = (ms: number) => new Date(ms).toISOString();

/** An estimated day for a complete plan: per court, what is played when. */
export function estimateSchedule(inputs: TournamentInputs, analysis: Analysis): EstimatedSchedule {
  const typical = place(inputs, analysis, "typical");
  const worst = place(inputs, analysis, "worst");
  const courts = typical.courts;

  const schedules: CourtSchedule[] = courts.map((c) => ({ hallId: c.hallId, courtId: c.courtId, segments: [] }));
  for (const t of [...typical.timed].sort((a, b) => a.court - b.court || a.from - b.from)) {
    schedules[t.court]!.segments.push({
      from: iso(t.from),
      to: iso(t.to),
      stage: t.planned.info.stage,
      round: t.planned.round,
      categoryId: t.planned.info.categoryId,
      matches: 1,
      details: [
        {
          from: iso(t.from),
          to: iso(t.to),
          match: t.planned.info,
          id: t.planned.id,
          moved: t.moved,
          late: t.late,
          ...(t.borrowed ? { borrowed: true } : {}),
          ...(t.wait ? { wait: t.wait } : {}),
        },
      ],
    });
  }

  const stages: EstimatedSchedule["stages"] = {};
  for (const t of typical.timed) {
    const current = stages[t.planned.info.stage];
    stages[t.planned.info.stage] = {
      from: iso(Math.min(t.from, current ? Date.parse(current.from) : Infinity)),
      to: iso(Math.max(t.to, current ? Date.parse(current.to) : -Infinity)),
    };
  }

  // A stage's zone runs from its first match to its last, across every hall, and is shown
  // in each hall that plays it: the stage starts and ends together.
  const order = new Map(analysis.categories.map((c, i) => [c.categoryId, i]));
  const zoneStarts = new Map<Zone, number>();
  for (const m of inputs.zoneMoves ?? []) {
    if (!m.start) continue;
    const zone: Zone = m.key.endsWith(":group") ? "group" : "knockout";
    zoneStarts.set(zone, Math.max(zoneStarts.get(zone) ?? -Infinity, Date.parse(m.start)));
  }
  const movedInto = new Set(
    (inputs.zoneMoves ?? []).filter((m) => m.hallId).map((m) => zoneKey(m.hallId!, m.key.endsWith(":group") ? "group" : "knockout")),
  );
  const whole = new Map<Zone, { from: number; to: number; dependsOn: number }>();
  const halls = new Map<WindowKey, { categories: Set<string>; late: number }>();
  for (const t of typical.timed) {
    const zone = zoneOf(t.planned.info.stage);
    const span = whole.get(zone) ?? { from: Infinity, to: -Infinity, dependsOn: -Infinity };
    span.from = Math.min(span.from, t.from);
    span.to = Math.max(span.to, t.to);
    whole.set(zone, span);
    const key = zoneKey(courts[t.court]!.hallId, zone);
    const hall = halls.get(key) ?? { categories: new Set<string>(), late: 0 };
    if (t.late) hall.late += 1;
    hall.categories.add(t.planned.info.categoryId);
    halls.set(key, hall);
  }
  // When a zone's first matches could start, had it not been held back.
  const ends = new Map(typical.timed.map((t) => [t.planned.id, t.to]));
  for (const t of typical.timed) {
    const span = whole.get(zoneOf(t.planned.info.stage))!;
    if (span.from !== t.from) continue;
    span.dependsOn = Math.max(span.dependsOn, ...t.planned.deps.flatMap((d) => d.ids.map((id) => ends.get(id) ?? -Infinity)));
  }
  const windows: EstimatedSchedule["windows"] = {};
  for (const [key, hall] of halls) {
    const zone: Zone = key.endsWith(":group") ? "group" : "knockout";
    const span = whole.get(zone)!;
    const start = zoneStarts.get(zone);
    const window: WindowSpan = {
      from: iso(span.from),
      to: iso(span.to),
      categoryIds: [...hall.categories].sort((a, b) => order.get(a)! - order.get(b)!),
      moved: start !== undefined || movedInto.has(key),
      late: hall.late,
    };
    if (start !== undefined && span.dependsOn > start) window.earliest = iso(span.dependsOn);
    windows[key] = window;
  }

  const lastEnd = (timed: Timed[]) => (timed.length > 0 ? iso(Math.max(...timed.map((m) => m.to))) : null);
  return {
    windows,
    courts: schedules,
    stages,
    finish: lastEnd(typical.timed),
    worstFinish: lastEnd(worst.timed),
    unplaced: typical.unplaced,
    late: typical.timed.filter((t) => t.late).length,
    courtGroups: typical.courtGroups,
    homeless: typical.homeless,
  };
}
