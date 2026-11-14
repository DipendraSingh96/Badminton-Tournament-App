"use client";

import { CopyIcon, CopySimpleIcon } from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  EVENT_TYPES,
  STAGES,
  categoryFormat,
  matchesPlayed,
  playersPerEntry,
  type FormatResult,
  type FormatType,
  type GroupMode,
  type PlayedStep,
  type Stage,
  type Unit,
} from "@/engine";
import {
  categoryRules,
  effectiveCategory,
  ownRules,
  stagesInPlay,
  usesBestOfThree,
  type CategoryDraft,
  type PlanDraft,
  type StageRulesDraft,
} from "@/lib/tournament/draft";
import { ReadOnly, Section, SegmentedField, StepperField, SwitchField } from "./fields";
import { STAGE_LABELS, categoryName, entryNoun, formatErrorMessage, formatGroupSizes } from "./labels";
import type { Update } from "./plan-editor";

const GROUP_MODES = [
  { value: "fixed", label: "Number of groups" },
  { value: "auto", label: "Preferred group size" },
] as const;

const GROUP_COURTS = [
  { value: "own", label: "Own courts per group" },
  { value: "shared", label: "Shared across the hall" },
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
export function ScheduleTab({
  draft,
  update,
  locked,
  onReopen,
}: {
  draft: PlanDraft;
  update: Update;
  locked: boolean;
  /** Go back to the expected numbers, once the plan uses the real entries. */
  onReopen: () => void;
}) {
  const ready = draft.unit !== null && draft.categories.length > 0;
  return (
    <>
      <ReadOnly when={locked}>
        <Section
          title="Entries"
          description="How many you expect in each category, and how many of them are external."
          action={
            draft.stage !== "plan" ? (
              <Button variant="outline" size="sm" onClick={onReopen}>
                Use expected numbers
              </Button>
            ) : null
          }
        >
          {ready ? (
            draft.categories.map((category, i) => (
              <EntriesCard key={category.id} draft={draft} index={i} update={update} />
            ))
          ) : (
            <p className="text-sm text-muted-foreground">Add categories on the Setup tab first.</p>
          )}
        </Section>

        <StagesSection draft={draft} update={update} />
      </ReadOnly>

      <PlayedSection draft={draft} />

      <Section
        title="Buffer"
        description="Time for miscellaneous activity like prize distribution. Shown on the timeline straight after the last match; play must end by the last hall's closing time less the buffer. Drag it on the timeline to pin it at a time."
      >
        <div className="w-[calc(50%-0.25rem)]">
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
      <h3 className="text-sm font-semibold">{categoryName(draft, category.id)}</h3>
      {draft.unit ? <Badge variant="outline">{entryTag(draft.unit, category)}</Badge> : null}
    </div>
  );
}

function EntriesCard({ draft, index, update }: { draft: PlanDraft; index: number; update: Update }) {
  const category = draft.categories[index]!;
  const unit = draft.unit!;
  const nouns = entryNoun(unit, category.event, true);
  const entered = draft.entries.filter((e) => e.categoryId === category.id);
  const set = (key: "expectedEntries" | "expectedExternal") => (value: number | null) =>
    update((d) => void (d.categories[index]![key] = value));
  return (
    <div className="flex flex-col gap-3">
      <CategoryHeading draft={draft} category={category} />
      <div className="grid grid-cols-2 gap-x-2 gap-y-3">
        <StepperField
          label={unit === "team" ? "Expected teams" : "Expected entries"}
          hint={unit === "team" ? teamCountHint(category) : `Number of ${nouns}.`}
          path={["categories", index, "expectedEntries"]}
          value={category.expectedEntries}
          onChange={set("expectedEntries")}
        />
        <StepperField
          label="External entries"
          hint={`External ${nouns}. Optional.`}
          path={["categories", index, "expectedExternal"]}
          value={category.expectedExternal}
          onChange={set("expectedExternal")}
        />
      </div>
      {draft.stage !== "plan" ? (
        <p className="text-sm text-muted-foreground tabular-nums">
          Using real entries: the plan uses the {entered.length} entered ({entered.filter((e) => e.external).length}{" "}
          external). The expected numbers are kept for comparison.
        </p>
      ) : null}
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

/** The structure a category's numbers produce; null while the numbers it needs aren't filled in. */
function formatOf(category: CategoryDraft, format: FormatType): FormatResult | null {
  if (category.expectedEntries === null) return null;
  const groups: GroupMode | undefined =
    category.groupMode === "fixed" && category.groupCount
      ? { type: "fixed", groupCount: category.groupCount }
      : category.groupMode === "auto" && category.preferredGroupSize
        ? { type: "auto", preferredSize: category.preferredGroupSize }
        : undefined;
  if (format !== "knockout" && !groups) return null;
  if (format === "groupsKnockout" && category.qualifiersPerGroup === null) return null;
  return categoryFormat(
    {
      expectedEntries: category.expectedEntries,
      groups,
      qualifiersPerGroup: category.qualifiersPerGroup ?? undefined,
      bronze: category.bronze,
    },
    format,
  );
}

/** Live summary of the structure the current entries produce. */
function FormatPreview({ category, unit, format }: { category: CategoryDraft; unit: Unit; format: FormatType }) {
  const result = formatOf(category, format);
  if (!result) return null;
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

/** A category's groups and qualifiers, inside its group stage card. */
function GroupBlock({ draft, index, update }: { draft: PlanDraft; index: number; update: Update }) {
  const category = draft.categories[index]!;
  const format = draft.format!;
  const unit = draft.unit!;
  const set = <K extends keyof CategoryDraft>(key: K) => (value: CategoryDraft[K]) =>
    update((d) => void (d.categories[index]![key] = value));
  const path = (key: keyof CategoryDraft) => ["categories", index, key];
  const notice = unusedNotice(category, format);
  return (
    <div className="flex flex-col gap-3">
      <SegmentedField
        label="Groups set by"
        path={path("groupMode")}
        value={category.groupMode}
        options={GROUP_MODES}
        onChange={set("groupMode")}
      />
      <div className="grid grid-cols-2 gap-x-2 gap-y-3">
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

/** Knockout only: the category's bracket, inside its knockout card. */
function BracketLine({ draft, index }: { draft: PlanDraft; index: number }) {
  const category = draft.categories[index]!;
  const notice = unusedNotice(category, draft.format!);
  return (
    <div className="flex flex-col gap-1">
      <FormatPreview category={category} unit={draft.unit!} format={draft.format!} />
      {notice ? <p className="text-xs text-muted-foreground">{notice}</p> : null}
    </div>
  );
}

/** A section of the matches-played bar: its short name above it, its full name for the hover and screen readers, and its stage's colour. */
function playedStep(step: PlayedStep): { short: string; full: string; colour: string } {
  const knockout = "bg-tl-knockout text-tl-knockout-foreground";
  const final = "bg-tl-final text-tl-final-foreground";
  if (step.type === "group") return { short: "Group", full: "Group stage", colour: "bg-tl-group text-tl-group-foreground" };
  if (step.type === "semi") return { short: "SF", full: "Semi-finals", colour: knockout };
  if (step.type === "final") return { short: "Final", full: "Final", colour: final };
  if (step.type === "finalBronze") return { short: "Final + bronze", full: "Final and bronze match", colour: final };
  return step.size === 8
    ? { short: "QF", full: "Quarter-finals", colour: knockout }
    : { short: `R${step.size}`, full: `Round of ${step.size}`, colour: knockout };
}

/**
 * How much badminton an entry gets: one bar per competition, everyone
 * entered, split by how far they go. A section's width is the share whose
 * day ends there; the number in it is the matches they have played by then;
 * above it, the stage or round and how many play it.
 */
function PlayedSection({ draft }: { draft: PlanDraft }) {
  const { unit, format } = draft;
  const team = unit === "team";
  const matchNoun = (n: number) => (team ? (n === 1 ? "tie" : "ties") : n === 1 ? "match" : "matches");
  const empty = <p className="text-sm text-muted-foreground">Fill in the entries and groups above to see this.</p>;
  return (
    <Section
      title="Matches played by a player"
      description={`How much badminton each ${team ? "team" : "entry"} gets. The bar is everyone entered, split by how far they get: each section's width is the share whose day ends there, and the number in it is the ${team ? "ties" : "matches"} they will have played by then. Above each section is the stage or round and how many play in it. Use it to balance a good day for players against the size of the tournament.`}
    >
      {unit === null || format === null || draft.categories.length === 0
        ? empty
        : draft.categories.map((raw) => {
            const category = effectiveCategory(draft, raw);
            const result = formatOf(category, format);
            const sections = result?.ok ? matchesPlayed(result.format) : [];
            const total = sections.reduce((sum, s) => sum + s.share, 0);
            const nouns = entryNoun(unit, category.event, true);
            const noun = entryNoun(unit, category.event);
            const rubbers = team ? EVENT_TYPES.reduce((sum, e) => sum + (category.lineUp[e] ?? 0), 0) : 0;
            const range = (m: { min: number; max: number }) => (m.min === m.max ? `${m.min}` : `${m.min}–${m.max}`);
            const said = sections.map((s) => {
              const step = playedStep(s.step);
              const here = `${s.playing} ${s.playing === 1 ? noun : nouns} play`;
              const by = `${range(s.matches)} ${matchNoun(s.matches.max)}`;
              return s.ending > 0
                ? `${step.full}: ${here}; ${s.ending} finish here (${Math.round((s.ending / total) * 100)}%) having played ${by}`
                : `${step.full}: ${here}, ${by} played by then; all go on to the final or the bronze match`;
            });
            return (
              <div key={category.id} data-played={category.id} className="flex flex-col gap-2">
                <CategoryHeading draft={draft} category={raw} />
                {sections.length === 0 ? (
                  empty
                ) : (
                  <>
                    <div
                      role="img"
                      aria-label={`${said.join(". ")}.`}
                      // Each section is as wide as its share of the entries, but never too narrow for its number and its name.
                      className="grid gap-x-0.5 gap-y-1"
                      style={{ gridTemplateColumns: sections.map((s) => `minmax(3.5rem, ${s.share}fr)`).join(" ") }}
                    >
                      {sections.map((s, i) => (
                        <span key={`name-${i}`} aria-hidden="true" className="flex min-w-0 flex-col self-end text-xs leading-4">
                          <span className="font-semibold">{playedStep(s.step).short}</span>
                          <span className="text-muted-foreground tabular-nums">
                            {s.playing} {s.playing === 1 ? noun : nouns}
                          </span>
                        </span>
                      ))}
                      {sections.map((s, i) => (
                        <span
                          key={`bar-${i}`}
                          aria-hidden="true"
                          title={said[i]}
                          className={`grid h-10 min-w-0 place-items-center font-display text-xl leading-none font-bold tabular-nums ${playedStep(s.step).colour} ${
                            i === 0 ? "rounded-l-md" : ""
                          } ${i === sections.length - 1 ? "rounded-r-md" : ""}`}
                        >
                          {range(s.matches)}
                        </span>
                      ))}
                    </div>
                    {team && rubbers > 0 ? (
                      <p className="text-sm text-muted-foreground tabular-nums">
                        {rubbers === 1 ? "A tie is 1 rubber." : `A tie is ${rubbers} rubbers: each player plays 1 rubber a tie.`}
                      </p>
                    ) : null}
                  </>
                )}
              </div>
            );
          })}
    </Section>
  );
}

function notPlayedReason(draft: PlanDraft): string {
  if (!draft.format) return "Choose a format on the Setup tab.";
  return "Not played with this format.";
}

function StagesSection({ draft, update }: { draft: PlanDraft; update: Update }) {
  const inPlay = stagesInPlay(draft);
  const source = inPlay[0];
  const hasKnockout = draft.format === "groupsKnockout" || draft.format === "knockout";
  const hasCategories = draft.unit !== null && draft.categories.length > 0;
  return (
    <Section
      title="Stages"
      description="In play order. Each category sets its own groups, scoring and timing for each stage; they apply to every event and rubber it plays there."
    >
      <div className="grid grid-cols-2 gap-x-2 gap-y-3">
        {usesBestOfThree(draft) ? (
          <StepperField
            label="Best-of-3 allowance (%)"
            hint="Extra time added to every best-of-3 match, because some go to a third game. 33% adds a third."
            path={["bestOfThreeAllowance"]}
            value={draft.bestOfThreeAllowance}
            onChange={(v) => update((d) => void (d.bestOfThreeAllowance = v))}
          />
        ) : null}
        <StepperField
          label="Overspill (%)"
          hint="Extra time added to every match in the worst case, for matches that run over. Optional; the typical plan doesn't change."
          path={["overspill"]}
          value={draft.overspill}
          onChange={(v) => update((d) => void (d.overspill = v))}
        />
      </div>
      {STAGES.map((stage) => {
        // The bronze match is each category's choice, so its stage shows whenever there's a knockout.
        const played = inPlay.includes(stage) || (stage === "bronze" && hasKnockout);
        if (!played) {
          return (
            <div key={stage} className="flex items-baseline justify-between gap-2 rounded-lg border border-dashed px-3 py-2">
              <h3 className="text-sm font-semibold text-muted-foreground">{STAGE_LABELS[stage]}</h3>
              <span className="text-xs text-muted-foreground">{notPlayedReason(draft)}</span>
            </div>
          );
        }
        return (
          <div key={stage} className="flex flex-col gap-3 pt-4 first:pt-0">
            <h3 className="text-sm font-semibold">{STAGE_LABELS[stage]}</h3>
            {!hasCategories ? (
              <p className="text-sm text-muted-foreground">Add categories on the Setup tab first.</p>
            ) : (
              <>
                {stage === "group" ? (
                  <SegmentedField
                    label="Group courts"
                    path={["groupCourts"]}
                    value={draft.groupCourts}
                    options={GROUP_COURTS}
                    hint="Own: each group keeps its courts and plays its waves in order there, borrowing a court of its hall once that court's own groups have finished; give a court to another group on the venue. Shared: each match goes to the first free court in the hall, which mixes groups across courts."
                    onChange={(v) => update((d) => void (d.groupCourts = v))}
                  />
                ) : null}
                {draft.categories.map((c, i) => (
                  <CategoryStageCard
                    key={c.id}
                    draft={draft}
                    index={i}
                    stage={stage}
                    copyFrom={source !== undefined && source !== stage ? source : null}
                    update={update}
                  />
                ))}
              </>
            )}
          </div>
        );
      })}
    </Section>
  );
}

/**
 * One category in one stage: its structure there (groups and qualifiers, its
 * bracket, or whether it plays a bronze match), then its own scoring and
 * timing. Several rows of settings about one thing, so a card.
 */
function CategoryStageCard({
  draft,
  index,
  stage,
  copyFrom,
  update,
}: {
  draft: PlanDraft;
  index: number;
  stage: Stage;
  /** The first stage in play, to copy this category's rules from; null for that stage itself. */
  copyFrom: Stage | null;
  update: Update;
}) {
  const category = draft.categories[index]!;
  const rules = categoryRules(draft, category)[stage];
  const set = <K extends keyof StageRulesDraft>(key: K) => (value: StageRulesDraft[K]) =>
    update((d) => void (ownRules(d, index)[stage][key] = value));
  const path = (key: keyof StageRulesDraft) => ["categories", index, "stageRules", stage, key];
  const noBronze = stage === "bronze" && !category.bronze;
  return (
    <div className="flex flex-col gap-3 rounded-lg bg-card-system p-3">
      <CategoryHeading draft={draft} category={category} />
      {stage === "group" ? <GroupBlock draft={draft} index={index} update={update} /> : null}
      {stage === "knockout" && draft.format === "knockout" ? <BracketLine draft={draft} index={index} /> : null}
      {stage === "bronze" ? (
        <SwitchField
          label="Play a bronze match"
          checked={category.bronze}
          onChange={(on) => update((d) => void (d.categories[index]!.bronze = on))}
        />
      ) : null}
      {noBronze ? null : (
        <>
          <div className="grid grid-cols-2 gap-x-2 gap-y-3">
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
            <div className="w-[calc(50%-0.25rem)]">
              <StepperField
                label={rules.deuce === "cap" ? "Points cap" : "Maximum points"}
                min={1}
                path={path("deuceLimit")}
                value={rules.deuceLimit}
                onChange={set("deuceLimit")}
              />
            </div>
          ) : null}
          <div className="grid grid-cols-2 gap-x-2 gap-y-3">
            <StepperField
              label="Minutes per game"
              hint="Typical playing time."
              min={1}
              path={path("minutesPerGame")}
              value={rules.minutesPerGame}
              onChange={set("minutesPerGame")}
            />
            <StepperField
              label="Organising time (min)"
              hint="Per match: walk-on, warm-up and changeover."
              path={path("changeoverMinutes")}
              value={rules.changeoverMinutes}
              onChange={set("changeoverMinutes")}
            />
          </div>
          {copyFrom || draft.categories.length > 1 ? (
            <div className="flex flex-wrap gap-2">
              {copyFrom ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => update((d) => void (ownRules(d, index)[stage] = { ...ownRules(d, index)[copyFrom] }))}
                >
                  <CopyIcon /> Same as {STAGE_LABELS[copyFrom].toLowerCase()}
                </Button>
              ) : null}
              {draft.categories.length > 1 ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    update((d) => {
                      const from = { ...ownRules(d, index)[stage] };
                      d.categories.forEach((_, i) => void (ownRules(d, i)[stage] = { ...from }));
                    })
                  }
                >
                  <CopySimpleIcon /> Copy to all categories
                </Button>
              ) : null}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
