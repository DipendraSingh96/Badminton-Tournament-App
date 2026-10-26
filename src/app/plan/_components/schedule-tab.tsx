"use client";

import { CopyIcon } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  EVENT_TYPES,
  STAGES,
  categoryFormat,
  playersPerEntry,
  type FormatType,
  type GroupMode,
  type Stage,
  type Unit,
} from "@/engine";
import {
  stagesInPlay,
  usesBestOfThree,
  type CategoryDraft,
  type PlanDraft,
  type StageRulesDraft,
} from "@/lib/tournament/draft";
import { Section, SegmentedField, StepperField, SwitchField } from "./fields";
import { STAGE_LABELS, categoryName, entryNoun, formatErrorMessage, formatGroupSizes } from "./labels";
import type { Update } from "./plan-editor";

const GROUP_MODES = [
  { value: "fixed", label: "Number of groups" },
  { value: "auto", label: "Preferred group size" },
] as const;

const DEUCE_RULES = [
  { value: "none", label: "None" },
  { value: "cap", label: "Hard cap" },
  { value: "standard", label: "Win by two" },
] as const;

const DEUCE_HINTS: Record<NonNullable<StageRulesDraft["deuce"]>, string> = {
  none: "First to the points per game wins.",
  cap: "Win by two, but the first to the cap wins.",
  standard: "Win by two, up to a maximum.",
};

const BEST_OF = [
  { value: 1, label: "Best of 1" },
  { value: 3, label: "Best of 3" },
] as const;

/** Entries, structure, stages and buffer: tuned until demand fits the day. */
export function ScheduleTab({ draft, update }: { draft: PlanDraft; update: Update }) {
  const ready = draft.unit !== null && draft.categories.length > 0;
  return (
    <>
      <Section title="Entries" description="How many you expect in each category, and how many of them are external.">
        {ready ? (
          draft.categories.map((category, i) => (
            <EntriesCard key={category.id} draft={draft} index={i} update={update} />
          ))
        ) : (
          <p className="text-sm text-muted-foreground">Add categories on the Tournament setup tab first.</p>
        )}
      </Section>

      <StagesSection draft={draft} update={update} />

      <Section
        title="Buffer"
        description="Time for miscellaneous activity like prize distribution. Shown on the timeline straight after the last match; play must end by the last hall's closing time less the buffer. Drag it on the timeline to pin it at a time."
      >
        <div className="@md:max-w-64">
          <StepperField
            label="Buffer (minutes)"
            path={["frame", "bufferMinutes"]}
            value={draft.frame.bufferMinutes}
            onChange={(v) => update((d) => void (d.frame.bufferMinutes = v))}
          />
        </div>
        {draft.frame.bufferStart ? (
          <div className="flex items-center justify-between gap-2 text-sm">
            <span>Pinned at {draft.frame.bufferStart} on the timeline. Play must end by then.</span>
            <Button variant="outline" size="sm" onClick={() => update((d) => void (d.frame.bufferStart = null))}>
              Unpin
            </Button>
          </div>
        ) : null}
      </Section>
    </>
  );
}

function entryTag(unit: Unit, category: CategoryDraft): string {
  if (unit === "team") return "Team";
  if (!category.event) return "No event";
  return playersPerEntry(category.event) === 1 ? "Individual" : "Pair";
}

/**
 * What a number of teams means in people, from the line-up: e.g. 24 teams of
 * 2 doubles rubbers = "= 48 pairs, 96 players".
 */
function teamCountHint(category: CategoryDraft): string {
  const teams = category.expectedEntries;
  let singles = 0;
  let pairs = 0;
  for (const event of EVENT_TYPES) {
    const count = category.lineUp[event] ?? 0;
    if (playersPerEntry(event) === 1) singles += count;
    else pairs += count;
  }
  if (teams === null || singles + pairs === 0) return "Number of teams.";
  const parts = [
    singles > 0 ? `${teams * singles} singles players` : null,
    pairs > 0 ? `${teams * pairs} ${teams * pairs === 1 ? "pair" : "pairs"}` : null,
    `${teams * (singles + 2 * pairs)} players`,
  ].filter(Boolean);
  return `= ${parts.join(", ")}`;
}

function CategoryHeading({ draft, category }: { draft: PlanDraft; category: CategoryDraft }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <h3 className="text-sm font-medium">{categoryName(draft, category.id)}</h3>
      {draft.unit ? <Badge variant="outline">{entryTag(draft.unit, category)}</Badge> : null}
    </div>
  );
}

function EntriesCard({ draft, index, update }: { draft: PlanDraft; index: number; update: Update }) {
  const category = draft.categories[index]!;
  const unit = draft.unit!;
  const nouns = entryNoun(unit, category.event, true);
  const set = (key: "expectedEntries" | "expectedExternal") => (value: number | null) =>
    update((d) => void (d.categories[index]![key] = value));
  return (
    <div className="flex flex-col gap-3 rounded-lg bg-inset p-3.5">
      <CategoryHeading draft={draft} category={category} />
      <div className="grid grid-cols-1 gap-3 @md:grid-cols-2">
        <StepperField
          label={unit === "team" ? "Expected teams" : "Expected entries"}
          hint={unit === "team" ? teamCountHint(category) : `Number of ${nouns}.`}
          path={["categories", index, "expectedEntries"]}
          value={category.expectedEntries}
          onChange={set("expectedEntries")}
        />
        <StepperField
          label="Of which external"
          hint={`External ${nouns}. Optional.`}
          path={["categories", index, "expectedExternal"]}
          value={category.expectedExternal}
          onChange={set("expectedExternal")}
        />
      </div>
    </div>
  );
}

/** Values entered for a category that the chosen format doesn't use; kept in case the format changes back. */
function unusedNotice(category: CategoryDraft, format: FormatType): string | null {
  const groupSettings =
    category.groupMode !== null ||
    category.groupCount !== null ||
    category.preferredGroupSize !== null ||
    category.qualifiersPerGroup !== null;
  if (format === "knockout" && groupSettings) {
    return "Group settings are kept but not used with knockout only.";
  }
  if (format === "groups" && (category.qualifiersPerGroup !== null || category.bronze)) {
    return "Qualifiers and the bronze match are kept but not used with groups only.";
  }
  return null;
}

function nextPowerOfTwo(n: number): number {
  let size = 1;
  while (size < n) size *= 2;
  return size;
}

/** Live summary of the structure the current entries produce. */
function FormatPreview({ category, unit, format }: { category: CategoryDraft; unit: Unit; format: FormatType }) {
  if (category.expectedEntries === null) return null;
  const groups: GroupMode | undefined =
    category.groupMode === "fixed" && category.groupCount
      ? { type: "fixed", groupCount: category.groupCount }
      : category.groupMode === "auto" && category.preferredGroupSize
        ? { type: "auto", preferredSize: category.preferredGroupSize }
        : undefined;
  if (format !== "knockout" && !groups) return null;
  if (format === "groupsKnockout" && category.qualifiersPerGroup === null) return null;

  const result = categoryFormat(
    {
      expectedEntries: category.expectedEntries,
      groups,
      qualifiersPerGroup: category.qualifiersPerGroup ?? undefined,
      bronze: category.bronze,
    },
    format,
  );
  if (!result.ok) {
    return <p className="text-sm text-over-text">{result.errors.map(formatErrorMessage).join(". ")}</p>;
  }
  const { groupSizes, qualifiers } = result.format;
  const nouns = entryNoun(unit, category.event, true);
  const bracket = nextPowerOfTwo(qualifiers);
  return (
    <p className="text-sm text-muted-foreground tabular-nums">
      {groupSizes.length > 0
        ? `Groups: ${formatGroupSizes(groupSizes)} ${nouns}${format === "groupsKnockout" ? ` · ${qualifiers} qualify` : ""}`
        : `Knockout: ${qualifiers} ${nouns}, bracket of ${bracket}${bracket > qualifiers ? ` (${bracket - qualifiers} byes)` : ""}`}
    </p>
  );
}

/** A category's groups and qualifiers, inside the group stage card. */
function GroupBlock({ draft, index, update }: { draft: PlanDraft; index: number; update: Update }) {
  const category = draft.categories[index]!;
  const format = draft.format!;
  const unit = draft.unit!;
  const set = <K extends keyof CategoryDraft>(key: K) => (value: CategoryDraft[K]) =>
    update((d) => void (d.categories[index]![key] = value));
  const path = (key: keyof CategoryDraft) => ["categories", index, key];
  const notice = unusedNotice(category, format);
  return (
    <div className="flex flex-col gap-3 rounded-md border bg-card p-3">
      <CategoryHeading draft={draft} category={category} />
      <SegmentedField
        label="Groups set by"
        path={path("groupMode")}
        value={category.groupMode}
        options={GROUP_MODES}
        onChange={set("groupMode")}
      />
      <div className="grid grid-cols-1 gap-3 @md:grid-cols-2">
        {category.groupMode === "fixed" ? (
          <StepperField
            label="Groups"
            min={1}
            path={path("groupCount")}
            value={category.groupCount}
            onChange={set("groupCount")}
          />
        ) : category.groupMode === "auto" ? (
          <StepperField
            label="Preferred group size"
            min={2}
            hint={
              format === "groupsKnockout"
                ? "Larger groups lengthen the group stage and shorten the knockout."
                : undefined
            }
            path={path("preferredGroupSize")}
            value={category.preferredGroupSize}
            onChange={set("preferredGroupSize")}
          />
        ) : null}
        {format === "groupsKnockout" ? (
          <StepperField
            label="Qualifiers per group"
            min={1}
            path={path("qualifiersPerGroup")}
            value={category.qualifiersPerGroup}
            onChange={set("qualifiersPerGroup")}
          />
        ) : null}
      </div>
      {notice ? <p className="text-xs text-muted-foreground">{notice}</p> : null}
      <FormatPreview category={category} unit={unit} format={format} />
    </div>
  );
}

/** Knockout only: each category's bracket, inside the knockout card. */
function BracketLine({ draft, index }: { draft: PlanDraft; index: number }) {
  const category = draft.categories[index]!;
  const notice = unusedNotice(category, draft.format!);
  return (
    <div className="flex flex-col gap-1 rounded-md border bg-card px-3 py-2">
      <CategoryHeading draft={draft} category={category} />
      <FormatPreview category={category} unit={draft.unit!} format={draft.format!} />
      {notice ? <p className="text-xs text-muted-foreground">{notice}</p> : null}
    </div>
  );
}

/** A bronze match switch for each category, inside the bronze card. */
function BronzeSwitches({ draft, update }: { draft: PlanDraft; update: Update }) {
  return (
    <div className="flex flex-col gap-2 rounded-md border bg-card p-3">
      {draft.categories.map((category, i) => (
        <SwitchField
          key={category.id}
          label={categoryName(draft, category.id)}
          checked={category.bronze}
          onChange={(on) => update((d) => void (d.categories[i]!.bronze = on))}
        />
      ))}
    </div>
  );
}

function notPlayedReason(draft: PlanDraft): string {
  if (!draft.format) return "Choose a format on the Tournament setup tab.";
  return "Not played with this format.";
}

function StagesSection({ draft, update }: { draft: PlanDraft; update: Update }) {
  const inPlay = stagesInPlay(draft);
  const source = inPlay[0];
  const hasKnockout = draft.format === "groupsKnockout" || draft.format === "knockout";
  return (
    <Section
      title="Stages"
      description="In play order. Groups and qualifiers are set per category in the group stage, and the bronze match per category before the final. Scoring and timing apply to every event and rubber in the stage."
    >
      {usesBestOfThree(draft) ? (
        <div className="@md:max-w-64">
          <StepperField
            label="Best-of-3 allowance (%)"
            hint="Extra time added to every best-of-3 match, because some go to a third game. 33% adds a third."
            path={["bestOfThreeAllowance"]}
            value={draft.bestOfThreeAllowance}
            onChange={(v) => update((d) => void (d.bestOfThreeAllowance = v))}
          />
        </div>
      ) : null}
      {STAGES.map((stage) => {
        const copyFrom = source !== undefined && source !== stage ? source : null;
        const hasCategories = draft.unit !== null && draft.categories.length > 0;
        if (stage === "bronze" && hasKnockout) {
          return (
            <StageCard
              key={stage}
              draft={draft}
              stage={stage}
              copyFrom={copyFrom}
              update={update}
              lead={hasCategories ? <BronzeSwitches draft={draft} update={update} /> : null}
              rulesHidden={inPlay.includes("bronze") ? null : "No category has a bronze match."}
            />
          );
        }
        if (!inPlay.includes(stage)) {
          return (
            <div key={stage} className="flex items-baseline justify-between gap-2 rounded-lg border border-dashed px-3 py-2">
              <h3 className="text-sm font-medium text-muted-foreground">{STAGE_LABELS[stage]}</h3>
              <span className="text-xs text-muted-foreground">{notPlayedReason(draft)}</span>
            </div>
          );
        }
        const lead =
          !hasCategories
            ? null
            : stage === "group"
              ? draft.categories.map((c, i) => <GroupBlock key={c.id} draft={draft} index={i} update={update} />)
              : stage === "knockout" && draft.format === "knockout"
                ? draft.categories.map((c, i) => <BracketLine key={c.id} draft={draft} index={i} />)
                : null;
        return (
          <StageCard key={stage} draft={draft} stage={stage} copyFrom={copyFrom} update={update} lead={lead} rulesHidden={null} />
        );
      })}
    </Section>
  );
}

function StageCard({
  draft,
  stage,
  copyFrom,
  update,
  lead,
  rulesHidden,
}: {
  draft: PlanDraft;
  stage: Stage;
  copyFrom: Stage | null;
  update: Update;
  /** Per-category structure shown before the stage's scoring and timing. */
  lead: ReactNode;
  /** When set, the stage isn't played: this note replaces scoring and timing. */
  rulesHidden: string | null;
}) {
  const rules = draft.stageRules[stage];
  const set = <K extends keyof StageRulesDraft>(key: K) => (value: StageRulesDraft[K]) =>
    update((d) => void (d.stageRules[stage][key] = value));
  const path = (key: keyof StageRulesDraft) => ["stageRules", stage, key];
  return (
    <div className="flex flex-col gap-3 rounded-lg bg-inset p-3.5">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium">{STAGE_LABELS[stage]}</h3>
        {copyFrom && !rulesHidden ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => update((d) => void (d.stageRules[stage] = { ...d.stageRules[copyFrom] }))}
          >
            <CopyIcon /> Same as {STAGE_LABELS[copyFrom].toLowerCase()}
          </Button>
        ) : null}
      </div>
      {lead}
      {rulesHidden ? (
        <p className="text-sm text-muted-foreground">{rulesHidden}</p>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 @md:grid-cols-2">
            <StepperField
              label="Points per game"
              min={1}
              path={path("pointsPerGame")}
              value={rules.pointsPerGame}
              onChange={set("pointsPerGame")}
            />
            <SegmentedField
              label="Games per match"
              path={path("bestOf")}
              value={rules.bestOf}
              options={BEST_OF}
              onChange={set("bestOf")}
            />
          </div>
          <SegmentedField
            label="Deuce"
            path={path("deuce")}
            value={rules.deuce}
            options={DEUCE_RULES}
            hint={rules.deuce ? DEUCE_HINTS[rules.deuce] : undefined}
            onChange={set("deuce")}
          />
          {rules.deuce === "cap" || rules.deuce === "standard" ? (
            <div className="@md:max-w-64">
              <StepperField
                label={rules.deuce === "cap" ? "Points cap" : "Maximum points"}
                min={1}
                path={path("deuceLimit")}
                value={rules.deuceLimit}
                onChange={set("deuceLimit")}
              />
            </div>
          ) : null}
          <div className="grid grid-cols-1 gap-3 @md:grid-cols-2">
            <StepperField
              label="Minutes per game"
              hint="Typical playing time."
              min={1}
              path={path("minutesPerGame")}
              value={rules.minutesPerGame}
              onChange={set("minutesPerGame")}
            />
            <StepperField
              label="Organising time per match (minutes)"
              hint="Walk-on, warm-up and changeover."
              path={path("changeoverMinutes")}
              value={rules.changeoverMinutes}
              onChange={set("changeoverMinutes")}
            />
          </div>
        </>
      )}
    </div>
  );
}
