import { TZDate } from "@date-fns/tz";
import { z } from "zod";
import {
  EVENT_TYPES,
  STAGES,
  type Category,
  type CourtWindow,
  type EntryKind,
  type EventType,
  type FormatType,
  type OtherCost,
  type StageRules,
  type TournamentInputs,
  type Unit,
} from "@/engine";
import type { PlanDraft, StageRulesDraft } from "./draft";
import { EVENT_LABELS } from "./events";

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

const frameSchema = z
  .object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date is required"),
    startTime: time("Start time"),
    endTime: time("End time"),
    timeZone: z.string().min(1, "Time zone is required"),
    courtWindows: z
      .array(
        z.object({
          id: z.string(),
          from: time("Courts from"),
          to: time("Courts until"),
          courts: whole("Courts", 1),
        }),
      )
      .min(1, "Add at least one court window"),
    umpires: whole("Umpires", 0),
    bufferMinutes: whole("Buffer", 0),
  })
  .superRefine((frame, ctx) => {
    if (minutesOfDay(frame.endTime) <= minutesOfDay(frame.startTime)) {
      ctx.addIssue({ code: "custom", message: "End time must be after start time", path: ["endTime"] });
    }
    const windows = frame.courtWindows
      .map((w, i) => ({ i, from: minutesOfDay(w.from), to: minutesOfDay(w.to) }))
      .sort((a, b) => a.from - b.from);
    windows.forEach((w, n) => {
      if (w.to <= w.from) {
        ctx.addIssue({ code: "custom", message: "Court window must end after it starts", path: ["courtWindows", w.i, "to"] });
      }
      const next = windows[n + 1];
      if (next && next.from < w.to) {
        ctx.addIssue({ code: "custom", message: "Court windows must not overlap", path: ["courtWindows", next.i, "from"] });
      }
    });
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
      playersPerTeam: z.number().nullable(),
      expectedEntries: whole("Expected entries", 2),
      groupMode: z.enum(["auto", "fixed"]).nullable(),
      groupCount: z.number().nullable(),
      preferredGroupSize: z.number().nullable(),
      qualifiersPerGroup: z.number().nullable(),
      bronze: z.boolean(),
      feeBasis: z.enum(["player", "entry"], { error: "Choose how the fee is charged" }),
      feeAmount: amount("Entry fee"),
      externalFeeAmount: amount("External fee").nullable(),
      expectedExternal: whole("Expected external entrants", 0).nullable(),
    })
    .superRefine((c, ctx) => {
      if (unit === "individual" && !c.event) {
        ctx.addIssue({ code: "custom", message: "Choose an event", path: ["event"] });
      }
      if (unit === "team") {
        if (!c.name) ctx.addIssue({ code: "custom", message: "Name is required", path: ["name"] });
        const rubbers = EVENT_TYPES.reduce((sum, e) => sum + (c.lineUp[e] ?? 0), 0);
        if (rubbers < 1) {
          ctx.addIssue({ code: "custom", message: "Add at least one rubber to the line-up", path: ["lineUp"] });
        }
        check(ctx, whole("Players per team", 1), c.playersPerTeam, ["playersPerTeam"]);
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
  for (const stage of STAGES) {
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
      minutesPerGame: parsed.minutesPerGame,
      changeoverMinutes: parsed.changeoverMinutes,
    };
    stageRules[stage] = rules;
  }

  const finance = collect(financeSchema, draft.finance, ["finance"]);
  const categoryIds = new Set(draft.categories.map((c) => c.id));
  draft.finance.prizes.forEach((prize, i) => {
    if (!categoryIds.has(prize.categoryId)) {
      issues.push({ path: ["finance", "prizes", i, "categoryId"], message: "Choose a category for the prize" });
    }
  });

  const { unit, format } = draft;
  if (issues.length > 0 || !unit || !format || !frame || !finance || categories.some((c) => !c)) {
    return { ok: false, issues };
  }

  const courtWindows: CourtWindow[] = frame.courtWindows.map((w) => ({
    from: toUtc(frame.date, w.from, frame.timeZone),
    to: toUtc(frame.date, w.to, frame.timeZone),
    courts: w.courts,
  }));

  const engineCategories: Category[] = categories.map((c) => {
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
            playersPerTeam: category.playersPerTeam!,
          };
    const hasGroups = format !== "knockout";
    return {
      id: category.id,
      name: category.name || (entry.type === "individual" ? EVENT_LABELS[entry.event] : ""),
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
        start: toUtc(frame.date, frame.startTime, frame.timeZone),
        end: toUtc(frame.date, frame.endTime, frame.timeZone),
        timeZone: frame.timeZone,
        courtWindows,
        umpires: frame.umpires,
        bufferMinutes: frame.bufferMinutes,
      },
      categories: engineCategories,
      stageRules,
      finance: {
        shuttlesPerGame: finance.shuttlesPerGame,
        costPerShuttle: finance.costPerShuttle,
        prizes: finance.prizes.map(({ categoryId, position, amount }) => ({ categoryId, position, amount })),
        otherCosts,
      },
    },
  };
}
