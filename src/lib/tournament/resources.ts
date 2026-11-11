import { categoryRules, courtNumber, entryName, type CategoryDraft, type PlanDraft, type StageRulesDraft } from "./draft";
import { categoryFormatOf, categoryLabel, lineUpComplete } from "./entries";
import { TIEBREAK_LABELS } from "./events";

// Getting ready for the day (the Draw stage's Resources page): what to carry,
// what is still to do, and the words of the rulebook and the message to
// players. All of it is read from the tournament; none of it changes results.

/** Where something still open is put right. */
export type FixAt = "plan" | "budget" | "entries" | "draw" | "schedule";

// ----- Kit list

export interface KitRow {
  key: string;
  label: string;
  /** How many to carry; null when the plan doesn't say yet. */
  quantity: number | null;
  /** A second line: tubes, pages, or what is missing. */
  detail: string | null;
  /** Where to set what is missing. */
  fix: FixAt | null;
}

/**
 * What to carry, counted from the plan: quantities only, never money.
 * `sheets` is the games on the schedule (a score sheet each); `shuttles` is
 * the plan's own shuttle count, null until the plan can be worked out.
 */
export function kitList(draft: PlanDraft, counts: { sheets: number; shuttles: number | null }): KitRow[] {
  const courts = draft.frame.halls.reduce((n, h) => n + h.courts.length, 0);
  const umpires = draft.frame.halls.reduce((n, h) => n + h.courts.reduce((m, c) => m + (c.umpires ?? 0), 0), 0);
  const perTube = draft.finance.shuttlesPerTube;
  const shuttles = counts.shuttles === null ? null : Math.ceil(counts.shuttles);
  const tubes = shuttles !== null && perTube ? Math.ceil(shuttles / perTube) : null;
  const pages = Math.ceil(counts.sheets / 2);
  return [
    {
      key: "shuttles",
      label: tubes !== null ? "Shuttle tubes" : "Shuttles",
      quantity: tubes ?? shuttles,
      detail:
        shuttles === null
          ? "Set shuttles per game in Budget to count them"
          : tubes !== null
            ? `${shuttles} shuttles, in tubes of ${perTube}`
            : "Set shuttles per tube in Budget to count tubes",
      fix: shuttles === null || tubes === null ? "budget" : null,
    },
    {
      key: "sheets",
      label: "Score sheets",
      quantity: counts.sheets,
      detail: counts.sheets === 0 ? "No games on the schedule yet" : `One a game: ${pages} A4 ${pages === 1 ? "page" : "pages"}, two sheets to a page`,
      fix: counts.sheets === 0 ? "schedule" : null,
    },
    { key: "pens", label: "Pens", quantity: courts, detail: "One a court", fix: null },
    { key: "clipboards", label: "Clipboards", quantity: courts, detail: "One a court", fix: null },
    { key: "chairs", label: "Umpire chairs", quantity: umpires, detail: `For ${courts} ${courts === 1 ? "court" : "courts"}`, fix: null },
  ];
}

// ----- Checklist

export interface AutoItem {
  key: string;
  text: string;
  done: boolean;
  /** When not done: what is missing, in a few words. */
  open: string | null;
  fix: FixAt;
}

/**
 * The items the app can check for itself. `scheduled` is the games on the
 * schedule; `fits` is the plan's fit (null until it can be worked out).
 */
export function autoChecklist(draft: PlanDraft, state: { scheduled: number; fits: boolean | null }): AutoItem[] {
  const names = (list: CategoryDraft[]) => list.map((c) => categoryLabel(draft, c.id)).join(", ");
  const item = (key: string, text: string, open: string | null, fix: FixAt): AutoItem => ({ key, text, done: open === null, open, fix });
  const hours = draft.frame.halls.every((h) => h.from && h.to) && draft.frame.halls.length > 0;
  const empty = draft.categories.filter((c) => !draft.entries.some((e) => e.categoryId === c.id));
  const unnamed = draft.entries.filter((e) => e.players.some((p) => !p.name.trim())).length;
  const undrawn = draft.categories.filter((c) => !draft.draw[c.id]);
  const unlocked = draft.categories.filter((c) => draft.draw[c.id] && !draft.draw[c.id]!.locked);
  const items = [
    item(
      "date",
      "The date and the venue's hours are set",
      !draft.frame.date ? "The date isn't set" : !hours ? "A hall has no opening hours" : null,
      "plan",
    ),
    item(
      "entries",
      "Every category has its entries",
      draft.categories.length === 0 ? "There are no categories" : empty.length > 0 ? `No entries in ${names(empty)}` : null,
      draft.categories.length === 0 ? "plan" : "entries",
    ),
    item(
      "players",
      "Every entry has its players named",
      unnamed > 0 ? `${unnamed} ${unnamed === 1 ? "entry has" : "entries have"} a player with no name` : null,
      "entries",
    ),
  ];
  if (draft.unit === "team") {
    const unset = draft.entries.filter((e) => {
      const category = draft.categories.find((c) => c.id === e.categoryId);
      return category ? !lineUpComplete(draft, e, category) : false;
    }).length;
    items.push(item("lineUps", "Every team's line-up is set", unset > 0 ? `${unset} ${unset === 1 ? "team has" : "teams have"} no full line-up` : null, "entries"));
  }
  items.push(
    item("drawn", "Every category is drawn", draft.categories.length === 0 ? "There are no categories" : undrawn.length > 0 ? `Not drawn: ${names(undrawn)}` : null, "draw"),
    item(
      "locked",
      "Every draw is locked",
      undrawn.length > 0 || draft.categories.length === 0 ? "Draw every category first" : unlocked.length > 0 ? `Not locked: ${names(unlocked)}` : null,
      "draw",
    ),
    item("scheduled", "Every game has a court and a time", state.scheduled === 0 ? "No games on the schedule yet" : null, "schedule"),
    item("fits", "The plan fits the day", state.fits === null ? "The plan isn't complete" : state.fits ? null : "The games don't fit the hours booked", "plan"),
  );
  return items;
}

/** Whole days from today to the tournament's date ("YYYY-MM-DD" both): 0 is today, negative is past, null with no date. */
export function daysToGo(date: string, today: string): number | null {
  if (!date) return null;
  const day = (text: string) => {
    const [y, m, d] = text.split("-").map(Number);
    return Date.UTC(y!, m! - 1, d!);
  };
  return Math.round((day(date) - day(today)) / 86_400_000);
}

/** "3 days to go", "Tomorrow", "Today", "2 days ago", or that the date isn't set. */
export function daysText(days: number | null): string {
  if (days === null) return "The date isn't set";
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days === -1) return "Yesterday";
  return days > 0 ? `${days} days to go` : `${-days} days ago`;
}

// ----- Rulebook

export interface RuleSection {
  title: string;
  lines: string[];
}

const STAGE_NAMES = { group: "Group stage", knockout: "Knockout rounds", bronze: "Bronze match", final: "Final" } as const;
type StageKey = keyof typeof STAGE_NAMES;

/** One stage's scoring in a sentence or two; null where it isn't set. */
export function scoringText(rules: StageRulesDraft): string | null {
  const { pointsPerGame: points, bestOf, deuce, deuceLimit: limit } = rules;
  if (!points || !bestOf || !deuce) return null;
  const match = bestOf === 1 ? `One game to ${points}.` : `Best of three games to ${points}.`;
  if (deuce === "none" || !limit || limit <= points) return `${match} The first to ${points} wins the game.`;
  return `${match} At ${points - 1}–${points - 1} a game is won by two clear points, up to ${limit}: at ${limit - 1}–${limit - 1} the next point wins.`;
}

const TIEBREAK_MEANING: Record<keyof typeof TIEBREAK_LABELS, string> = {
  matchesWon: "the most matches won",
  gameDifference: "games won less games lost",
  pointDifference: "points won less points lost",
  headToHead: "the result between the entries that are level",
  pointsWon: "the most points won in all",
  rubbersWon: "the most rubbers won",
  drawOfLots: "drawn by lot",
};

/**
 * The tournament's rules in plain words, from what is stored: the same
 * settings the app scores and ranks by. `missing` lists what isn't set yet.
 */
export function rulebook(draft: PlanDraft, houseRules: string): { sections: RuleSection[]; missing: string[] } {
  const sections: RuleSection[] = [];
  const missing: string[] = [];
  const several = draft.categories.length > 1;
  const stages: StageKey[] = [
    ...(draft.format !== "knockout" ? (["group"] as const) : []),
    ...(draft.format !== "groups" ? (["knockout", "final"] as const) : []),
  ];

  // The format, a category at a time.
  const format: string[] = [];
  for (const category of draft.categories) {
    const name = categoryLabel(draft, category.id);
    const made = categoryFormatOf(draft, category);
    if (!made.ok) {
      missing.push(`${name}: ${made.message}`);
      continue;
    }
    const { groupSizes, qualifiers } = made.format;
    const entries = groupSizes.reduce((n, s) => n + s, 0);
    const sizes = [...new Set(groupSizes)].sort((a, b) => b - a).join(" or ");
    const bronze = category.bronze ? ", with a match for third place" : "";
    const text =
      draft.format === "knockout"
        ? `a knockout of ${qualifiers}, drawn by seed${bronze}`
        : draft.format === "groups"
          ? `${entries} entries in ${groupSizes.length} ${groupSizes.length === 1 ? "group" : "groups"} of ${sizes}; everyone in a group plays each other, and the group's table decides it`
          : `${entries} entries in ${groupSizes.length} ${groupSizes.length === 1 ? "group" : "groups"} of ${sizes}; everyone in a group plays each other, and the top ${category.qualifiersPerGroup ?? "?"} of each group go through to a knockout of ${qualifiers}${bronze}`;
    format.push(several ? `${name}: ${text}.` : `${text.charAt(0).toUpperCase()}${text.slice(1)}.`);
  }
  if (format.length > 0) sections.push({ title: "Format", lines: format });

  // Scoring: stages that score alike are said once.
  const scoring: string[] = [];
  for (const category of draft.categories) {
    const own = categoryRules(draft, category);
    const used: StageKey[] = [...stages, ...(category.bronze && draft.format !== "groups" ? (["bronze"] as const) : [])];
    const byText = new Map<string, StageKey[]>();
    for (const stage of (["group", "knockout", "bronze", "final"] as const).filter((s) => used.includes(s))) {
      const text = scoringText(own[stage]);
      if (!text) {
        missing.push(`${categoryLabel(draft, category.id)}: the ${STAGE_NAMES[stage].toLowerCase()}'s scoring isn't set`);
        continue;
      }
      byText.set(text, [...(byText.get(text) ?? []), stage]);
    }
    for (const [text, list] of byText) {
      const which = list.length === used.length ? "Every match" : list.map((s) => STAGE_NAMES[s]).join(", ");
      scoring.push(`${several ? `${categoryLabel(draft, category.id)}, ` : ""}${several ? which.charAt(0).toLowerCase() + which.slice(1) : which}: ${text}`);
    }
  }
  if (scoring.length > 0) sections.push({ title: "Scoring", lines: scoring });

  if (draft.format !== "knockout") {
    if (draft.rules.tiebreaks.length === 0) missing.push("The order groups are ranked by isn't set");
    else {
      sections.push({
        title: "How groups are ranked",
        lines: [
          "Entries in a group are ranked by these, in this order; each is used only to separate entries still level on the ones before.",
          ...draft.rules.tiebreaks.map((t, i) => `${i + 1}. ${TIEBREAK_LABELS[t].replace(/ \(.*\)/, "")}: ${TIEBREAK_MEANING[t]}.`),
        ],
      });
    }
  }

  const absent: string[] = [];
  if (draft.rules.walkover === "straightGamesAtTarget") {
    absent.push("A side that doesn't play gives its opponent a walkover, scored as a win in straight games at the points per game to nil.");
  } else if (draft.rules.walkover === "winOnly") {
    absent.push("A side that doesn't play gives its opponent a walkover: a win, with no games or points counted for either side.");
  } else missing.push("How a walkover is scored isn't set");
  if (draft.format !== "knockout") {
    if (draft.rules.withdrawal === "byesThenWalkovers") {
      absent.push("An entry that withdraws during the group stage keeps the results it has played; its remaining games are walkovers to its opponents.");
    } else if (draft.rules.withdrawal === "byesThenVoid") {
      absent.push("An entry that withdraws during the group stage has all its results removed: they count for nobody, and its remaining games aren't played.");
    } else missing.push("What happens when an entry withdraws isn't set");
  }
  if (draft.format !== "groups") absent.push("An entry that withdraws from the knockout gives its next opponent a walkover.");
  absent.push("A side that stops during a match (retires) loses it; the points already played stand.");
  sections.push({ title: "Walkovers, withdrawals and retirements", lines: absent });

  const { eligibility, handicap } = draft.rules;
  const who: string[] = [];
  if (eligibility.maxCategoriesPerPerson) {
    who.push(`A player may enter at most ${eligibility.maxCategoriesPerPerson} ${eligibility.maxCategoriesPerPerson === 1 ? "category" : "categories"}.`);
  }
  for (const pair of eligibility.exclusivePairs) {
    if (pair.first && pair.second) who.push(`Nobody may enter both ${categoryLabel(draft, pair.first)} and ${categoryLabel(draft, pair.second)}.`);
  }
  const members = eligibility.membersOnly.filter((id) => draft.categories.some((c) => c.id === id));
  if (members.length > 0) {
    who.push(`Members only: ${members.map((id) => categoryLabel(draft, id)).join(", ")}.`);
    who.push(eligibility.allowMixedMemberExternalPairs ? "A member may pair with a non-member there." : "Both players of a pair must be members there.");
  }
  if (who.length > 0) sections.push({ title: "Who can enter", lines: who });

  if (handicap.enabled) {
    const starts: [string, number | null][] = [
      ["A mixed pair against a men's pair", handicap.mixedVsMens],
      ["A women's pair against a men's pair", handicap.womensVsMens],
      ["A women's pair against a mixed pair", handicap.womensVsMixed],
    ];
    const lines = starts.filter(([, n]) => n).map(([text, n]) => `${text} starts each game ${n} ${n === 1 ? "point" : "points"} up.`);
    if (lines.length > 0) sections.push({ title: "Open doubles handicap", lines });
  }

  const own = houseRules
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (own.length > 0) sections.push({ title: "From the organiser", lines: own });
  return { sections, missing };
}

// ----- Programme

/** The venue's hours a hall at a time: "Hall 1: 09:00 to 18:00, courts 1 to 4". */
export function venueLines(draft: PlanDraft): string[] {
  return draft.frame.halls.map((hall, h) => {
    const name = hall.name?.trim() || `Hall ${h + 1}`;
    const first = hall.courts.length > 0 ? courtNumber(draft.frame.halls, h, 0) : null;
    const last = hall.courts.length > 0 ? courtNumber(draft.frame.halls, h, hall.courts.length - 1) : null;
    const courts = first === null ? "no courts" : first === last ? `court ${first}` : `courts ${first} to ${last}`;
    return `${name}: ${hall.from && hall.to ? `${hall.from} to ${hall.to}` : "hours not set"}, ${courts}`;
  });
}

/** "Saturday 14 November 2026" from "2026-11-14"; empty with no date. */
export function longDate(date: string): string {
  if (!date) return "";
  const [y, m, d] = date.split("-").map(Number);
  // Some browsers put a comma after the weekday and some don't: none, either way.
  return new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })
    .format(new Date(Date.UTC(y!, m! - 1, d!)))
    .replace(",", "");
}

// ----- Message to players

/** A message to send to everyone entered, with the programme and rulebook attached. `firstGame` is "HH:mm", or null with no schedule. */
export function playerMessage(draft: PlanDraft, firstGame: string | null): string {
  const name = draft.name.trim() || "The tournament";
  const opens = draft.frame.halls.map((h) => h.from).filter((t): t is string => Boolean(t)).sort()[0] ?? null;
  const entered = draft.entries.length;
  return [
    `${name}${draft.frame.date ? `, ${longDate(draft.frame.date)}` : ""}`,
    "",
    [
      opens ? `The venue opens at ${opens}.` : null,
      firstGame ? `The first games start at ${firstGame}.` : null,
      "Please check in at the desk when you arrive, in good time for your first game.",
    ]
      .filter(Boolean)
      .join(" "),
    "",
    `Attached are the programme (the groups, the draw and the order of play${entered > 0 ? ` for all ${entered} entries` : ""}) and the rulebook. Please read both before the day.`,
    "",
    "If you can no longer play, tell us as soon as you can.",
  ].join("\n");
}

/** An entry's name for a document: its own, or its players'. */
export function documentName(draft: PlanDraft, entryId: string): string {
  const entry = draft.entries.find((e) => e.id === entryId);
  return (entry && entryName(entry)) ?? "Unnamed entry";
}
