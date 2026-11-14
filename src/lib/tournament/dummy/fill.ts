import { produce } from "immer";
import { EVENT_TYPES, makeDraw, seededRandom } from "@/engine";
import {
  defaultCategoryName,
  emptyCategory,
  emptyCourt,
  emptyPlayer,
  emptyPrize,
  newId,
  openDoublesInUse,
  newCategory,
  ownRules,
  stagesInPlay,
  usesBestOfThree,
  type EntryDraft,
  type PlanDraft,
} from "../draft";
import { drawSizes, playersFor, rubbersOf } from "../entries";
import { markDummy, type SampleStage } from "./marks";
import {
  DUMMY_BEST_OF_THREE_ALLOWANCE,
  DUMMY_OVERSPILL,
  DUMMY_BUFFER_MINUTES,
  DUMMY_CATEGORY,
  DUMMY_CHECK_IN,
  DUMMY_FINANCE,
  DUMMY_FIRST_NAMES,
  DUMMY_HALL,
  DUMMY_HANDICAP,
  DUMMY_INDIVIDUAL_EVENTS,
  DUMMY_RULES,
  DUMMY_STAGE_RULES,
  DUMMY_SURNAMES,
  DUMMY_TEAM_LINE_UP,
  DUMMY_TEAM_NAMES,
  DUMMY_TOURNAMENT_NAME,
} from "./values";

// Each fill fills only what's still empty and never changes what the
// organiser entered. `fillPage` marks what it added as dummy data.

/** The next Saturday after `today`, as "YYYY-MM-DD". */
function nextSaturday(today: Date): string {
  const day = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  day.setDate(day.getDate() + (((6 - day.getDay() + 7) % 7) || 7));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}`;
}

/** The venue as a new tournament starts it: one hall with one court, nothing set. */
function venueUntouched(draft: PlanDraft): boolean {
  const halls = draft.frame.halls;
  return halls.length === 1 && halls[0]!.courts.length <= 1 && halls[0]!.from === "" && halls[0]!.to === "";
}

/** The Plan stage, all of it: tournament, venue, categories, scoring and timing, finance and rules. */
export function fillPlan(draft: PlanDraft, today: Date): PlanDraft {
  const untouched = venueUntouched(draft);
  return produce(draft, (d) => {
    if (d.name.trim() === "") d.name = DUMMY_TOURNAMENT_NAME;
    if (d.frame.date === "") d.frame.date = nextSaturday(today);
    d.unit ??= "individual";
    d.format ??= "groupsKnockout";

    for (const hall of d.frame.halls) {
      if (hall.from === "") hall.from = DUMMY_HALL.from;
      if (hall.to === "") hall.to = DUMMY_HALL.to;
      hall.unitMinutes ??= DUMMY_HALL.unitMinutes;
      for (const band of hall.bands) {
        if (band.from === "") band.from = hall.from;
        if (band.to === "") band.to = hall.to;
        band.rate ??= DUMMY_HALL.rate;
      }
      for (const court of hall.courts) court.umpires ??= DUMMY_HALL.umpires;
    }
    if (untouched) {
      const hall = d.frame.halls[0]!;
      while (hall.courts.length < DUMMY_HALL.courts) hall.courts.push({ ...emptyCourt(), umpires: DUMMY_HALL.umpires });
    }
    d.frame.bufferMinutes ??= DUMMY_BUFFER_MINUTES;

    if (d.categories.length === 0) {
      if (d.unit === "team") {
        d.categories.push({ ...newCategory(d), lineUp: { ...emptyCategory().lineUp, ...DUMMY_TEAM_LINE_UP } });
      } else {
        for (const event of DUMMY_INDIVIDUAL_EVENTS) d.categories.push({ ...newCategory(d), event });
      }
    }
    d.categories.forEach((c, i) => {
      if (d.unit === "individual") c.event ??= DUMMY_INDIVIDUAL_EVENTS[0]!;
      if (d.unit === "team") {
        if (c.name.trim() === "") c.name = defaultCategoryName(d, i);
        if (EVENT_TYPES.every((e) => !c.lineUp[e])) Object.assign(c.lineUp, DUMMY_TEAM_LINE_UP);
      }
      c.expectedEntries ??= DUMMY_CATEGORY.expectedEntries;
      if (d.format !== "knockout") {
        c.groupMode ??= "auto";
        if (c.groupMode === "auto") c.preferredGroupSize ??= DUMMY_CATEGORY.preferredGroupSize;
        else c.groupCount ??= DUMMY_CATEGORY.groupCount;
      }
      if (d.format === "groupsKnockout") c.qualifiersPerGroup ??= DUMMY_CATEGORY.qualifiersPerGroup;
      c.feeBasis ??= "player";
      c.feeAmount ??= DUMMY_CATEGORY.feeAmount;
      c.externalFeeAmount ??= DUMMY_CATEGORY.externalFeeAmount;
      c.expectedExternal ??= Math.min(DUMMY_CATEGORY.expectedExternal, c.expectedEntries);
    });

    const stages = stagesInPlay(d);
    d.categories.forEach((_, i) => {
      const own = ownRules(d, i);
      for (const stage of stages) {
        const rules = own[stage];
        rules.pointsPerGame ??= DUMMY_STAGE_RULES.pointsPerGame;
        rules.deuce ??= DUMMY_STAGE_RULES.deuce;
        if (rules.deuce !== "none") rules.deuceLimit ??= DUMMY_STAGE_RULES.deuceLimit;
        // The final is best of 3; everything else best of 1.
        rules.bestOf ??= stage === "final" ? 3 : 1;
        rules.minutesPerGame ??= DUMMY_STAGE_RULES.minutesPerGame;
        rules.changeoverMinutes ??= DUMMY_STAGE_RULES.changeoverMinutes;
      }
    });
    if (usesBestOfThree(d)) d.bestOfThreeAllowance ??= DUMMY_BEST_OF_THREE_ALLOWANCE;
    d.overspill ??= DUMMY_OVERSPILL;

    const finance = d.finance;
    finance.shuttlesPerGame ??= DUMMY_FINANCE.shuttlesPerGame;
    if (finance.shuttlePrice === null) {
      finance.shuttlePriceBasis ??= "tube";
      finance.shuttlePrice = DUMMY_FINANCE.tubePrice;
    }
    if (finance.shuttlePriceBasis === "tube") finance.shuttlesPerTube ??= DUMMY_FINANCE.shuttlesPerTube;
    if (finance.prizes.length === 0) {
      for (const c of d.categories) finance.prizes.push({ ...emptyPrize(c.id), position: "1st", amount: DUMMY_FINANCE.winnersPrize });
    }
    for (const prize of finance.prizes) {
      if (prize.position.trim() === "") prize.position = "1st";
      prize.amount ??= DUMMY_FINANCE.winnersPrize;
    }

    const rules = d.rules;
    if (rules.tiebreaks.length === 0) rules.tiebreaks = [...DUMMY_RULES.tiebreaks];
    rules.withdrawal ??= DUMMY_RULES.withdrawal;
    rules.walkover ??= DUMMY_RULES.walkover;
    if (rules.handicap.enabled && openDoublesInUse(d)) {
      rules.handicap.mixedVsMens ??= DUMMY_HANDICAP.mixedVsMens;
      rules.handicap.womensVsMens ??= DUMMY_HANDICAP.womensVsMens;
      rules.handicap.womensVsMixed ??= DUMMY_HANDICAP.womensVsMixed;
    }
  });
}

/** Names not yet used: from the list, then numbered. */
function namer(list: string[], used: Iterable<string>): () => string {
  const taken = new Set(used);
  let i = 0;
  return () => {
    for (;;) {
      const base = list[i % list.length]!;
      const round = Math.floor(i / list.length);
      const name = round === 0 ? base : `${base} ${round + 1}`;
      i++;
      if (!taken.has(name)) {
        taken.add(name);
        return name;
      }
    }
  };
}

/**
 * The Entries page: every category up to its expected number of entries, with
 * players and line-ups; the gaps in the organiser's own entries filled; and
 * seeds for the dummy entries when a category has none. Categories whose
 * draw is locked are left alone.
 */
export function fillEntries(draft: PlanDraft): PlanDraft {
  const teamName = namer(DUMMY_TEAM_NAMES, draft.entries.map((e) => e.name));
  // Every first name with every surname, mixed so neighbours differ.
  const firsts = DUMMY_FIRST_NAMES.length;
  const people = Array.from(
    { length: firsts * DUMMY_SURNAMES.length },
    (_, k) => `${DUMMY_FIRST_NAMES[k % firsts]} ${DUMMY_SURNAMES[(k + Math.floor(k / firsts)) % DUMMY_SURNAMES.length]}`,
  );
  const personName = namer(people, draft.entries.flatMap((e) => e.players.map((p) => p.name)));

  return produce(draft, (d) => {
    for (const category of d.categories) {
      if (d.draw[category.id]?.locked) continue;
      const own = d.entries.filter((e) => e.categoryId === category.id);
      const target = Math.max(category.expectedEntries ?? DUMMY_CATEGORY.expectedEntries, 2);
      const added: EntryDraft[] = [];
      const externalWanted = Math.max(0, (category.expectedExternal ?? 0) - own.filter((e) => e.external).length);
      for (let i = own.length; i < target; i++) {
        added.push({ id: newId(), categoryId: category.id, name: "", external: false, seed: null, players: [], lineUp: {} });
      }
      // The last ones added are external, up to the expected number.
      added.slice(Math.max(0, added.length - externalWanted)).forEach((e) => (e.external = true));
      d.entries.push(...added);

      const need = playersFor(d, category);
      for (const entry of [...own, ...added]) {
        if (d.unit === "team" && entry.name.trim() === "") entry.name = teamName();
        while (entry.players.length < need) entry.players.push(emptyPlayer());
        for (const player of entry.players) if (player.name.trim() === "") player.name = personName();
        if (d.unit === "team") {
          // Each rubber's players, using those who play least so far.
          const plays = new Map(entry.players.map((p) => [p.id, 0]));
          for (const ids of Object.values(entry.lineUp)) for (const id of ids) if (plays.has(id)) plays.set(id, plays.get(id)! + 1);
          for (const rubber of rubbersOf(category)) {
            const key = String(rubber.number);
            const chosen = (entry.lineUp[key] ?? []).filter((id) => plays.has(id));
            const others = [...plays.entries()].filter(([id]) => !chosen.includes(id)).sort((a, b) => a[1] - b[1]);
            while (chosen.length < rubber.players && others.length > 0) {
              const [id] = others.shift()!;
              chosen.push(id);
              plays.set(id, plays.get(id)! + 1);
            }
            entry.lineUp[key] = chosen;
          }
        }
      }

      // Seeds, when the category has none: one per group, or four for a knockout.
      if (added.length > 0 && !d.entries.some((e) => e.categoryId === category.id && e.seed !== null)) {
        const sizes = drawSizes(d, category);
        const count = !sizes.ok ? 0 : d.format === "knockout" ? Math.min(4, Math.floor(sizes.sizes[0]! / 2)) : sizes.sizes.length;
        added.slice(0, count).forEach((e, i) => (e.seed = i + 1));
      }
    }
  });
}

/** The Draw page: the draw for each category without one, not locked. */
export function fillDraw(draft: PlanDraft, randomSeed: number): PlanDraft {
  return produce(draft, (d) => {
    d.categories.forEach((category, i) => {
      if (d.draw[category.id]) return;
      const sizes = drawSizes(d, category);
      if (!sizes.ok) return;
      const entries = d.entries.filter((e) => e.categoryId === category.id).map((e) => ({ id: e.id, seed: e.seed }));
      const result = makeDraw(entries, sizes.sizes, randomSeed + i);
      if (result.ok) d.draw[category.id] = { groups: result.groups, randomSeed: randomSeed + i, locked: false };
    });
  });
}

/** The Teams page: check-in for the players still at Not yet; most arrive, a few are absent. */
export function fillTeams(draft: PlanDraft, randomSeed: number): PlanDraft {
  const random = seededRandom(randomSeed);
  return produce(draft, (d) => {
    for (const entry of d.entries) {
      for (const player of entry.players) {
        if (player.attendance !== "notYet") continue;
        const roll = random();
        if (roll < DUMMY_CHECK_IN.arrived) player.attendance = "arrived";
        else if (roll < DUMMY_CHECK_IN.arrived + DUMMY_CHECK_IN.absent) player.attendance = "absent";
      }
    }
  });
}

/** What a stage's fill does: the plan, or the Draw stage's entries and then its draws. */
export type FillResult = { ok: true; draft: PlanDraft } | { ok: false; reason: string };

const STAGE_NAMES: Record<SampleStage, string> = { plan: "Plan", draw: "Draw" };

/** Fills a stage with sample data and marks it, or says why there's nothing to fill. */
export function fillStage(stage: SampleStage, draft: PlanDraft, options: { today: Date; randomSeed: number }): FillResult {
  const locked = Object.values(draft.draw).some((d) => d.locked);
  if (stage === "plan" && locked) return { ok: false, reason: "The draw is locked: unlock it to fill the plan." };
  if (stage === "draw" && draft.categories.length === 0) {
    return { ok: false, reason: "Add categories on the Plan stage first, or fill it." };
  }
  const filled = stage === "plan" ? fillPlan(draft, options.today) : fillDraw(fillEntries(draft), options.randomSeed);
  if (JSON.stringify(filled) === JSON.stringify(draft)) {
    return { ok: false, reason: `Nothing left to fill in ${STAGE_NAMES[stage]}.` };
  }
  return { ok: true, draft: markDummy(draft, filled) };
}
