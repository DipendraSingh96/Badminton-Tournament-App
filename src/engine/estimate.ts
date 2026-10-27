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
//    then any matches moved by hand change court or order.
// 2. Timing: each court keeps its order, and every match starts at the
//    earliest time its court, its zone, its feeders and its sides allow.
// Rest between matches isn't modelled.

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
    wait?: Wait;
    /** Runs past its court's hours. */
    late: boolean;
  }[];
}

export interface CourtSchedule {
  hallId: string;
  courtId: string;
  segments: Segment[];
}

/** A hall's stage zone in the estimate. */
export interface WindowSpan {
  /** UTC ISO: the first match's start and the last match's end. */
  from: string;
  to: string;
  /** Categories playing in the zone, in category order. */
  categoryIds: string[];
  /** Moved by hand: in time, or here from another hall. */
  moved: boolean;
  /** Dragged to start before what it depends on has finished: when that is. */
  earliest?: string;
  /** Matches in the zone that run past their court's hours. */
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
  /** Matches that run past their court's hours: still placed, flagged. */
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
    const deps = [...sideDeps(categoryId, base.home), ...sideDeps(categoryId, base.away)];
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
  const courts = available(inputs.frame).courts.map((c) => ({
    ...c,
    start: Date.parse(c.from),
    end: Date.parse(c.to),
  }));
  const dayStart = Date.parse(available(inputs.frame).start);
  const slot = new Map(analysis.slots.map((s) => [s.stage, s.minutes[length] * MS_PER_MINUTE]));
  const zoneStarts = new Map(
    (inputs.zoneMoves ?? []).filter((m) => m.start).map((m) => [m.key, Date.parse(m.start!)]),
  );
  const zoneStart = (court: number, stage: Stage) =>
    zoneStarts.get(zoneKey(courts[court]!.hallId, zoneOf(stage))) ?? -Infinity;
  const { steps, courtGroups, homeless } = plan(inputs, analysis, dayStart);
  // Groups on their own courts move on group by group; otherwise a category waits for its whole step.
  const own = inputs.groupCourts === "own";
  const gate = (info: MatchInfo) => (own && info.stage === "group" ? `${info.categoryId}:${info.group}` : info.categoryId);

  // 1. Assignment: play order onto the first court that can start each match.
  // Closing times play no part, so changing a hall's or court's hours never
  // moves matches between courts; a match that runs past closing is flagged.
  const freeAt = courts.map((c) => c.start);
  const queues: Planned[][] = courts.map(() => []);
  const ready = new Map<string, number>();
  let unplaced = 0;
  for (const step of steps) {
    const ends = new Map<string, number>();
    for (const match of step) {
      const minutes = slot.get(match.info.stage);
      if (minutes === undefined) continue;
      const release = Math.max(match.release, ready.get(gate(match.info)) ?? -Infinity);
      let best = -1;
      let bestStart = Infinity;
      courts.forEach((court, i) => {
        if (!match.halls.has(court.hallId)) return;
        if (match.courts && !match.courts.has(court.courtId)) return;
        const start = Math.max(freeAt[i]!, release, court.start, zoneStart(i, match.info.stage));
        if (start < bestStart) {
          best = i;
          bestStart = start;
        }
      });
      if (best === -1) {
        unplaced += 1;
        continue;
      }
      freeAt[best] = bestStart + minutes;
      queues[best]!.push(match);
      const id = gate(match.info);
      ends.set(id, Math.max(ends.get(id) ?? -Infinity, bestStart + minutes));
    }
    // A category's next step waits for this one.
    for (const [id, end] of ends) ready.set(id, Math.max(ready.get(id) ?? -Infinity, end));
  }

  // Moves by hand: onto a court of a hall the match may use, before a match there (or last).
  const moved = new Set<string>();
  const courtIndex = new Map(courts.map((c, i) => [c.courtId, i]));
  for (const move of inputs.matchMoves ?? []) {
    const to = courtIndex.get(move.courtId);
    const from = queues.findIndex((q) => q.some((m) => m.id === move.matchId));
    if (to === undefined || from === -1) continue;
    const match = queues[from]!.find((m) => m.id === move.matchId)!;
    if (!match.halls.has(courts[to]!.hallId)) continue;
    queues[from] = queues[from]!.filter((m) => m.id !== move.matchId);
    const at = move.before ? queues[to]!.findIndex((m) => m.id === move.before) : -1;
    if (at === -1) queues[to]!.push(match);
    else queues[to]!.splice(at, 0, match);
    moved.add(match.id);
  }

  // 2. Timing: every court in its order; each match at the earliest time allowed.
  const ends = new Map<string, number>();
  const busy = new Map<string, { tie: string; from: number; to: number; court: number }[]>();
  const timed: Timed[] = [];
  const head = courts.map(() => 0);
  const courtFree = courts.map((c) => c.start);
  const known = new Set(queues.flat().map((m) => m.id));
  let guard = queues.flat().length * (courts.length + 2) + 10;
  /** Feeders of a match not yet timed. */
  const pendingOf = (match: Planned) =>
    match.deps.flatMap((d) => d.ids.filter((id) => known.has(id) && !ends.has(id)));
  while (head.some((h, i) => h < queues[i]!.length) && guard-- > 0) {
    let best: { court: number; start: number; wait?: Wait } | null = null;
    const blocked: number[] = [];
    for (let i = 0; i < courts.length; i++) {
      const match = queues[i]![head[i]!];
      if (!match) continue;
      // Feeders not yet timed: this court waits.
      if (pendingOf(match).length > 0) {
        blocked.push(i);
        continue;
      }
      const minutes = slot.get(match.info.stage)!;
      let start = Math.max(courtFree[i]!, courts[i]!.start, dayStart);
      let wait: Wait | undefined;
      const zone = zoneStart(i, match.info.stage);
      if (zone > start) {
        start = zone;
        wait = { type: "zone", until: new Date(zone).toISOString() };
      }
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
      if (!best || start < best.start) best = { court: i, start, wait };
    }
    if (!best) {
      // Every court is waiting on matches queued behind a waiting match (a match moved
      // ahead of what it waits for). Unblock a court holding one of those matches: its
      // waiting match goes just after the last match it waits for there, or to the back.
      if (blocked.length === 0) break;
      const needed = new Set(blocked.flatMap((i) => pendingOf(queues[i]![head[i]!]!)));
      const court = blocked.find((i) => queues[i]!.slice(head[i]! + 1).some((m) => needed.has(m.id))) ?? blocked[0]!;
      const queue = queues[court]!;
      const [stuck] = queue.splice(head[court]!, 1);
      const own = new Set(pendingOf(stuck!));
      const last = queue.findLastIndex((m, k) => k >= head[court]! && own.has(m.id));
      if (last === -1) queue.push(stuck!);
      else queue.splice(last + 1, 0, stuck!);
      continue;
    }
    const i = best.court;
    const match = queues[i]![head[i]!]!;
    head[i]! += 1;
    const minutes = slot.get(match.info.stage)!;
    courtFree[i] = best.start + minutes;
    ends.set(match.id, best.start + minutes);
    for (const side of match.sides) {
      busy.set(side, [...(busy.get(side) ?? []), { tie: match.tie, from: best.start, to: best.start + minutes, court: i }]);
    }
    timed.push({
      planned: match,
      court: i,
      from: best.start,
      to: best.start + minutes,
      moved: moved.has(match.id),
      wait: best.wait,
      // Runs past its court's hours (or the playing time): still shown, flagged.
      late: best.start + minutes > courts[i]!.end,
    });
  }

  // Anything that still couldn't be timed is reported, never dropped silently.
  unplaced += queues.reduce((n, queue, i) => n + queue.length - head[i]!, 0);
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

  // Each hall's zones, from where their matches were played.
  const order = new Map(analysis.categories.map((c, i) => [c.categoryId, i]));
  const zoneMoves = new Map((inputs.zoneMoves ?? []).map((m) => [m.key, m]));
  const movedInto = new Set(
    (inputs.zoneMoves ?? []).filter((m) => m.hallId).map((m) => zoneKey(m.hallId!, m.key.endsWith(":group") ? "group" : "knockout")),
  );
  const spans = new Map<WindowKey, { from: number; to: number; categories: Set<string>; dependsOn: number; late: number }>();
  for (const t of typical.timed) {
    const key = zoneKey(courts[t.court]!.hallId, zoneOf(t.planned.info.stage));
    const span = spans.get(key) ?? { from: Infinity, to: -Infinity, categories: new Set<string>(), dependsOn: -Infinity, late: 0 };
    if (t.late) span.late += 1;
    span.from = Math.min(span.from, t.from);
    span.to = Math.max(span.to, t.to);
    span.categories.add(t.planned.info.categoryId);
    spans.set(key, span);
  }
  // When a zone's first matches could start, had it not been held back.
  const ends = new Map(typical.timed.map((t) => [t.planned.id, t.to]));
  for (const t of typical.timed) {
    const key = zoneKey(courts[t.court]!.hallId, zoneOf(t.planned.info.stage));
    const ready = Math.max(-Infinity, ...t.planned.deps.flatMap((d) => d.ids.map((id) => ends.get(id) ?? -Infinity)));
    const span = spans.get(key)!;
    span.dependsOn = span.from === t.from ? Math.max(span.dependsOn, ready) : span.dependsOn;
  }
  const windows: EstimatedSchedule["windows"] = {};
  for (const [key, span] of spans) {
    const move = zoneMoves.get(key);
    const window: WindowSpan = {
      from: iso(span.from),
      to: iso(span.to),
      categoryIds: [...span.categories].sort((a, b) => order.get(a)! - order.get(b)!),
      moved: Boolean(move?.start) || movedInto.has(key),
      late: span.late,
    };
    if (move?.start && span.dependsOn > Date.parse(move.start)) window.earliest = iso(span.dependsOn);
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
