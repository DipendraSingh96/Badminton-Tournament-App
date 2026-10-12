import { TZDate } from "@date-fns/tz";
import { z } from "zod";
import {
  EVENT_TYPES,
  bandCoverage,
  type Category,
  type Hall,
  type Span,
  type EntryKind,
  type EventType,
  type FormatType,
  type OtherCost,
  type Rules,
  type StageRules,
  type TournamentInputs,
  type Unit,
} from "@/engine";
import {
  defaultCategoryName,
  openDoublesInUse,
  stagesInPlay,
  usesBestOfThree,
  type PlanDraft,
  type StageRulesDraft,
} from "./draft";

// Validates a plan draft and converts it to engine inputs. Messages are
// shown to organisers, so they use UK English and field labels.

function number(label: string) {
  return z.number({
    error: (issue) =>
      issue.input == null ? `${label} is required` : `${label} must be a number`,
  });
}

function whole(label: string, min: number) {
  return number(label)
    .int(`${label} must be a whole number`)
    .min(min, `${label} must be at least ${min}`);
}

function amount(label: string) {
  return number(label).min(0, `${label} can't be negative`);
}

function positive(label: string) {
  return number(label).gt(0, `${label} must be more than 0`);
}

function time(label: string) {
  return z.string().regex(/^\d{2}:\d{2}$/, `${label} is required`);
}

type Ctx = z.RefinementCtx;

/** Validates a field that is only required in some cases. */
function check(ctx: Ctx, schema: z.ZodType, value: unknown, path: PropertyKey[]) {
  const result = schema.safeParse(value);
  if (!result.success) {
    for (const issue of result.error.issues) {
      ctx.addIssue({ code: "custom", message: issue.message, path });
    }
  }
}

const minutesOfDay = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h! * 60 + m!;
};

function clock(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

const isTime = (value: string | null): value is string => value !== null && /^\d{2}:\d{2}$/.test(value);

const hallSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    from: time("Hall opens"),
    to: time("Hall closes"),
    bands: z
      .array(
        z.object({
          id: z.string(),
          name: z.string(),
          from: time("Band from"),
          to: time("Band until"),
          rate: amount("Rate"),
        }),
      )
      .min(1, "Add at least one rate band"),
    courts: z
      .array(
        z.object({
          id: z.string(),
          from: z.string().nullable(),
          to: z.string().nullable(),
          umpires: whole("Umpires", 0),
        }),
      )
      .min(1, "Add at least one court"),
  })
  .superRefine((hall, ctx) => {
    const open = minutesOfDay(hall.from);
    const close = minutesOfDay(hall.to);
    if (close <= open) {
      ctx.addIssue({ code: "custom", message: "Hall must close after it opens", path: ["to"] });
      return;
    }
    const spans: Span[] = [];
    hall.bands.forEach((band, i) => {
      const from = minutesOfDay(band.from);
      const to = minutesOfDay(band.to);
      if (to <= from) {
        ctx.addIssue({ code: "custom", message: "Band must end after it starts", path: ["bands", i, "to"] });
      } else if (from < open || to > close) {
        ctx.addIssue({ code: "custom", message: "Band must be within the hall's hours", path: ["bands", i, "from"] });
      } else {
        spans.push({ from, to });
      }
    });
    const coverage = bandCoverage({ from: open, to: close }, spans);
    for (const gap of coverage.gaps) {
      ctx.addIssue({
        code: "custom",
        message: `Bands leave ${clock(gap.from)} to ${clock(gap.to)} uncovered`,
        path: ["bands"],
      });
    }
    for (const overlap of coverage.overlaps) {
      ctx.addIssue({
        code: "custom",
        message: `Bands overlap from ${clock(overlap.from)} to ${clock(overlap.to)}`,
        path: ["bands"],
      });
    }
    hall.courts.forEach((court, i) => {
      const from = court.from ?? hall.from;
      const to = court.to ?? hall.to;
      if (!isTime(from) || !isTime(to)) {
        ctx.addIssue({ code: "custom", message: "Court hours are required", path: ["courts", i, "from"] });
      } else if (minutesOfDay(to) <= minutesOfDay(from)) {
        ctx.addIssue({ code: "custom", message: "Court must be available until after it opens", path: ["courts", i, "to"] });
      } else if (minutesOfDay(from) < open || minutesOfDay(to) > close) {
        ctx.addIssue({ code: "custom", message: "Court hours must be within the hall's hours", path: ["courts", i, "from"] });
      }
    });
  });

const frameSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date is required"),
  timeZone: z.string().min(1, "Time zone is required"),
  halls: z.array(hallSchema).min(1, "Add at least one hall"),
  bufferMinutes: whole("Buffer", 0),
});

const lineUpCount = whole("Rubbers", 0).nullable();

/** Category rules depend on the tournament's unit of play and format. */
function categorySchema(unit: Unit | null, format: FormatType | null) {
  return z
    .object({
      id: z.string(),
      name: z.string().trim(),
      event: z.enum(EVENT_TYPES).nullable(),
      lineUp: z.object(
        Object.fromEntries(EVENT_TYPES.map((e) => [e, lineUpCount])) as Record<EventType, typeof lineUpCount>,
      ),
      expectedEntries: whole(unit === "team" ? "Expected teams" : "Expected entries", 2),
      groupMode: z.enum(["auto", "fixed"]).nullable(),
      groupCount: z.number().nullable(),
      preferredGroupSize: z.number().nullable(),
      qualifiersPerGroup: z.number().nullable(),
      bronze: z.boolean(),
      feeBasis: z.enum(["player", "entry"], { error: "Choose how the fee is charged" }),
      feeAmount: amount("Entry fee"),
      externalFeeAmount: amount("External fee").nullable(),
      expectedExternal: whole("Of which external", 0).nullable(),
    })
    .superRefine((c, ctx) => {
      if (c.expectedExternal !== null && c.expectedExternal > c.expectedEntries) {
        ctx.addIssue({
          code: "custom",
          message: "Of which external can't be more than expected entries",
          path: ["expectedExternal"],
        });
      }
      if (unit === "individual" && !c.event) {
        ctx.addIssue({ code: "custom", message: "Choose an event", path: ["event"] });
      }
      if (unit === "team") {
        if (!c.name) ctx.addIssue({ code: "custom", message: "Name is required", path: ["name"] });
        const rubbers = EVENT_TYPES.reduce((sum, e) => sum + (c.lineUp[e] ?? 0), 0);
        if (rubbers < 1) {
          ctx.addIssue({ code: "custom", message: "Add at least one rubber to the line-up", path: ["lineUp"] });
        }
      }
      if (format === "groupsKnockout" || format === "groups") {
        if (!c.groupMode) {
          ctx.addIssue({ code: "custom", message: "Choose how groups are set", path: ["groupMode"] });
        }
        if (c.groupMode === "fixed") check(ctx, whole("Number of groups", 1), c.groupCount, ["groupCount"]);
        if (c.groupMode === "auto") check(ctx, whole("Preferred group size", 2), c.preferredGroupSize, ["preferredGroupSize"]);
      }
      if (format === "groupsKnockout") {
        check(ctx, whole("Qualifiers per group", 1), c.qualifiersPerGroup, ["qualifiersPerGroup"]);
      }
    });
}

const stageRulesSchema = z
  .object({
    pointsPerGame: whole("Points per game", 1),
    deuce: z.enum(["none", "cap", "standard"], { error: "Choose a deuce rule" }),
    deuceLimit: z.number().nullable(),
    bestOf: z.union([z.literal(1), z.literal(3)], { error: "Choose best of 1 or 3" }),
    minutesPerGame: positive("Minutes per game"),
    changeoverMinutes: amount("Organising time"),
  })
  .superRefine((s, ctx) => {
    if (s.deuce === "none") return;
    const label = s.deuce === "cap" ? "Points cap" : "Maximum points";
    check(ctx, whole(label, s.pointsPerGame + 1), s.deuceLimit, ["deuceLimit"]);
  });

const financeSchema = z.object({
  shuttlesPerGame: amount("Shuttles per game"),
  costPerShuttle: amount("Cost per shuttle"),
  prizes: z.array(
    z.object({
      id: z.string(),
      categoryId: z.string(),
      position: z.string().trim().min(1, "Prize position is required"),
      amount: amount("Prize amount"),
    }),
  ),
  otherCosts: z.array(
    z
      .object({
        id: z.string(),
        label: z.string().trim().min(1, "Cost name is required"),
        type: z.enum(["fixed", "perPerson"], { error: "Choose fixed or per person" }),
        amount: amount("Cost amount"),
        basis: z.enum(["players", "umpires", "custom"]).nullable(),
        count: z.number().nullable(),
      })
      .superRefine((cost, ctx) => {
        if (cost.type !== "perPerson") return;
        if (!cost.basis) {
          ctx.addIssue({ code: "custom", message: "Choose who the cost is per", path: ["basis"] });
        } else if (cost.basis === "custom") {
          check(ctx, whole("Number of people", 0), cost.count, ["count"]);
        }
      }),
  ),
});

/** Checks the rules and builds them, or adds issues and returns null. */
function parseRules(draft: PlanDraft, issues: PlanIssue[]): Rules | null {
  const before = issues.length;
  const { rules } = draft;
  const add = (path: PropertyKey[], message: string) => issues.push({ path: ["rules", ...path], message });

  const { tiebreaks } = rules;
  if (tiebreaks.length === 0) add(["tiebreaks"], "Add at least one tiebreak");
  if (new Set(tiebreaks).size !== tiebreaks.length) add(["tiebreaks"], "Each tiebreak can be used once");
  const lots = tiebreaks.indexOf("drawOfLots");
  if (lots !== -1 && lots !== tiebreaks.length - 1) add(["tiebreaks"], "Draw of lots can only be the last tiebreak");
  if (draft.unit !== "team" && tiebreaks.includes("rubbersWon")) {
    add(["tiebreaks"], "Rubbers won applies to team events only");
  }

  const handicapOn = rules.handicap.enabled && openDoublesInUse(draft);
  if (handicapOn) {
    const head = (label: string) => whole(label, 0);
    for (const [key, label] of [
      ["mixedVsMens", "Mixed vs men's head start"],
      ["womensVsMens", "Women's vs men's head start"],
      ["womensVsMixed", "Women's vs mixed head start"],
    ] as const) {
      const result = head(label).safeParse(rules.handicap[key]);
      if (!result.success) add(["handicap", key], result.error.issues[0]!.message);
    }
  }

  const { eligibility } = rules;
  if (eligibility.maxCategoriesPerPerson !== null) {
    const result = whole("Most categories per person", 1).safeParse(eligibility.maxCategoriesPerPerson);
    if (!result.success) add(["eligibility", "maxCategoriesPerPerson"], result.error.issues[0]!.message);
  }
  const ids = new Set(draft.categories.map((c) => c.id));
  const seen = new Set<string>();
  eligibility.exclusivePairs.forEach((pair, i) => {
    const path = ["eligibility", "exclusivePairs", i];
    if (!pair.first || !pair.second || !ids.has(pair.first) || !ids.has(pair.second)) {
      add(path, "Choose two categories");
    } else if (pair.first === pair.second) {
      add(path, "Choose two different categories");
    } else {
      const key = [pair.first, pair.second].sort().join("|");
      if (seen.has(key)) add(path, "This pair is already listed");
      seen.add(key);
    }
  });
  if (eligibility.membersOnly.some((id) => !ids.has(id))) {
    add(["eligibility", "membersOnly"], "Members only lists a category that no longer exists");
  }

  if (!rules.withdrawal) add(["withdrawal"], "Choose what happens when an entry withdraws");
  if (!rules.walkover) add(["walkover"], "Choose how a walkover is scored");

  if (issues.length > before || !rules.withdrawal || !rules.walkover) return null;
  return {
    tiebreaks: [...tiebreaks],
    handicap: handicapOn
      ? {
          enabled: true,
          mixedVsMens: rules.handicap.mixedVsMens!,
          womensVsMens: rules.handicap.womensVsMens!,
          womensVsMixed: rules.handicap.womensVsMixed!,
        }
      : { enabled: false },
    eligibility: {
      maxCategoriesPerPerson: eligibility.maxCategoriesPerPerson ?? undefined,
      exclusivePairs: eligibility.exclusivePairs.map((p) => [p.first!, p.second!]),
      membersOnly: [...eligibility.membersOnly],
      allowMixedMemberExternalPairs: eligibility.allowMixedMemberExternalPairs,
    },
    withdrawal: rules.withdrawal,
    walkover: rules.walkover,
  };
}

export interface PlanIssue {
  path: PropertyKey[];
  message: string;
}

export type ParseResult =
  | { ok: true; inputs: TournamentInputs }
  | { ok: false; issues: PlanIssue[] };

function isEmptyStage(stage: StageRulesDraft): boolean {
  return Object.values(stage).every((value) => value === null);
}

function toUtc(date: string, hhmm: string, timeZone: string): string {
  const [y, mo, d] = date.split("-").map(Number);
  const [h, mi] = hhmm.split(":").map(Number);
  return new Date(new TZDate(y!, mo! - 1, d!, h!, mi!, timeZone).getTime()).toISOString();
}

/** Validates the whole draft, collecting every issue, then builds inputs. */
export function parsePlan(draft: PlanDraft): ParseResult {
  const issues: PlanIssue[] = [];
  const collect = <T>(schema: z.ZodType<T>, value: unknown, prefix: PropertyKey[]) => {
    const result = schema.safeParse(value);
    if (result.success) return result.data;
    for (const issue of result.error.issues) {
      issues.push({ path: [...prefix, ...issue.path], message: issue.message });
    }
    return null;
  };

  if (!draft.unit) issues.push({ path: ["unit"], message: "Choose the unit of play" });
  if (!draft.format) issues.push({ path: ["format"], message: "Choose a format" });
  const frame = collect(frameSchema, draft.frame, ["frame"]);
  const schema = categorySchema(draft.unit, draft.format);
  const categories = draft.categories.map((c, i) => collect(schema, c, ["categories", i]));
  if (draft.categories.length === 0) {
    issues.push({ path: ["categories"], message: "Add at least one category" });
  }

  const stageRules: TournamentInputs["stageRules"] = {};
  const stageTiming: TournamentInputs["stageTiming"] = {};
  for (const stage of stagesInPlay(draft)) {
    const raw = draft.stageRules[stage];
    if (isEmptyStage(raw)) continue;
    const parsed = collect(stageRulesSchema, raw, ["stageRules", stage]);
    if (!parsed) continue;
    const rules: StageRules = {
      pointsPerGame: parsed.pointsPerGame,
      deuce:
        parsed.deuce === "none"
          ? { type: "none" }
          : parsed.deuce === "cap"
            ? { type: "cap", cap: parsed.deuceLimit! }
            : { type: "standard", max: parsed.deuceLimit! },
      bestOf: parsed.bestOf,
    };
    stageRules[stage] = rules;
    stageTiming[stage] = { minutesPerGame: parsed.minutesPerGame, changeoverMinutes: parsed.changeoverMinutes };
  }

  let bestOfThreeAllowance = 0;
  if (usesBestOfThree(draft)) {
    const percent = collect(amount("Best-of-3 allowance"), draft.bestOfThreeAllowance, ["bestOfThreeAllowance"]);
    if (percent !== null) bestOfThreeAllowance = percent / 100;
  }

  const finance = collect(financeSchema, draft.finance, ["finance"]);
  const categoryIds = new Set(draft.categories.map((c) => c.id));
  draft.finance.prizes.forEach((prize, i) => {
    if (!categoryIds.has(prize.categoryId)) {
      issues.push({ path: ["finance", "prizes", i, "categoryId"], message: "Choose a category for the prize" });
    }
  });

  const rules = parseRules(draft, issues);

  const { unit, format } = draft;
  if (issues.length > 0 || !unit || !format || !frame || !finance || !rules || categories.some((c) => !c)) {
    return { ok: false, issues };
  }

  const utc = (hhmm: string) => toUtc(frame.date, hhmm, frame.timeZone);
  const halls: Hall[] = frame.halls.map((hall, i) => ({
    id: hall.id,
    name: hall.name.trim() || `Hall ${i + 1}`,
    from: utc(hall.from),
    to: utc(hall.to),
    bands: hall.bands.map((band, j) => ({
      name: band.name.trim() || `Band ${j + 1}`,
      from: utc(band.from),
      to: utc(band.to),
      ratePerCourtHour: band.rate,
    })),
    courts: hall.courts.map((court) => ({
      id: court.id,
      from: utc(court.from ?? hall.from),
      to: utc(court.to ?? hall.to),
      umpires: court.umpires,
    })),
  }));

  const engineCategories: Category[] = categories.map((c, i) => {
    const category = c!;
    const entry: EntryKind =
      unit === "individual"
        ? { type: "individual", event: category.event! }
        : {
            type: "team",
            lineUp: EVENT_TYPES.filter((e) => (category.lineUp[e] ?? 0) > 0).map((e) => ({
              event: e,
              count: category.lineUp[e]!,
            })),
          };
    const hasGroups = format !== "knockout";
    return {
      id: category.id,
      name: category.name || defaultCategoryName(draft, i),
      entry,
      expectedEntries: category.expectedEntries,
      groups: !hasGroups
        ? undefined
        : category.groupMode === "fixed"
          ? { type: "fixed", groupCount: category.groupCount! }
          : { type: "auto", preferredSize: category.preferredGroupSize! },
      qualifiersPerGroup: format === "groupsKnockout" ? category.qualifiersPerGroup! : undefined,
      bronze: format !== "groups" && category.bronze,
      fee: {
        basis: category.feeBasis,
        amount: category.feeAmount,
        externalAmount: category.externalFeeAmount ?? undefined,
        expectedExternal: category.expectedExternal ?? 0,
      },
    };
  });

  const otherCosts: OtherCost[] = finance.otherCosts.map((cost) =>
    cost.type === "fixed"
      ? { id: cost.id, label: cost.label, type: "fixed", amount: cost.amount }
      : {
          id: cost.id,
          label: cost.label,
          type: "perPerson",
          amount: cost.amount,
          basis: cost.basis!,
          count: cost.count ?? undefined,
        },
  );

  return {
    ok: true,
    inputs: {
      unit,
      format,
      frame: {
        timeZone: frame.timeZone,
        halls,
        bufferMinutes: frame.bufferMinutes,
      },
      categories: engineCategories,
      stageRules,
      stageTiming,
      bestOfThreeAllowance,
      finance: {
        shuttlesPerGame: finance.shuttlesPerGame,
        costPerShuttle: finance.costPerShuttle,
        prizes: finance.prizes.map(({ categoryId, position, amount }) => ({ categoryId, position, amount })),
        otherCosts,
      },
      rules,
    },
  };
}
