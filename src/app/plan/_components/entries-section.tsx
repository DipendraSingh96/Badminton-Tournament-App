"use client";

import { Separator } from "@/components/ui/separator";
import { EVENT_TYPES, categoryFormat, playersPerEntry, type FormatType, type GroupMode, type Unit } from "@/engine";
import type { CategoryDraft, PlanDraft } from "@/lib/tournament/draft";
import { EVENT_LABELS } from "@/lib/tournament/events";
import { FieldGrid, NumberField, Section, SelectField, SwitchField } from "./fields";
import { categoryName, entryNoun, formatErrorMessage, formatGroupSizes } from "./labels";
import type { Update } from "./plan-editor";

const GROUP_MODES = [
  { value: "auto", label: "Propose from a preferred group size" },
  { value: "fixed", label: "Set the number of groups" },
] as const;

function nextPowerOfTwo(n: number): number {
  let size = 1;
  while (size < n) size *= 2;
  return size;
}

/** Live summary of the structure the current entries produce. */
function FormatPreview({
  category,
  unit,
  format,
}: {
  category: CategoryDraft;
  unit: Unit;
  format: FormatType;
}) {
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
    return (
      <p className="text-sm text-destructive">{result.errors.map(formatErrorMessage).join(". ")}</p>
    );
  }

  const { groupSizes, qualifiers, fixtures, totalFixtures } = result.format;
  const nouns = entryNoun(unit, category.event, true);
  const knockout = fixtures.knockout + fixtures.final;
  const rubbers =
    unit === "team" ? EVENT_TYPES.reduce((sum, e) => sum + (category.lineUp[e] ?? 0), 0) : 1;
  const squad = EVENT_TYPES.reduce((sum, e) => sum + (category.lineUp[e] ?? 0) * playersPerEntry(e), 0);
  const bracket = nextPowerOfTwo(qualifiers);
  const parts = [
    fixtures.group > 0 ? `${fixtures.group} group` : null,
    knockout > 0 ? `${knockout} knockout (including the final)` : null,
    fixtures.bronze > 0 ? `${fixtures.bronze} bronze` : null,
  ].filter(Boolean);

  return (
    <div className="flex flex-col gap-0.5 rounded-lg bg-background px-3 py-2 text-sm">
      {groupSizes.length > 0 ? (
        <p>
          Groups: {formatGroupSizes(groupSizes)} {nouns}
          {format === "groupsKnockout" ? ` · ${qualifiers} qualify` : ""}
        </p>
      ) : (
        <p>
          Knockout: {qualifiers} {nouns}, bracket of {bracket}
          {bracket > qualifiers ? ` (${bracket - qualifiers} byes)` : ""}
        </p>
      )}
      <p className="tabular-nums">
        {unit === "team" ? "Ties" : "Matches"}: {parts.join(" + ")} = {totalFixtures} total
      </p>
      {unit === "team" && rubbers > 0 ? (
        <>
          <p className="tabular-nums">
            {totalFixtures} ties × {rubbers} rubbers = {totalFixtures * rubbers} matches
          </p>
          <p className="tabular-nums">
            Squad: {squad} players (
            {EVENT_TYPES.filter((e) => (category.lineUp[e] ?? 0) > 0)
              .map((e) => `${category.lineUp[e]} ${EVENT_LABELS[e].toLowerCase()} × ${playersPerEntry(e)}`)
              .join(" + ")}
            )
          </p>
        </>
      ) : null}
    </div>
  );
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

/**
 * Expected entries and each category's structure. Interim: the Schedule
 * structure tab is redesigned in step 4.
 */
export function EntriesSection({ draft, update }: { draft: PlanDraft; update: Update }) {
  const { unit, format } = draft;
  return (
    <Section
      title="Entries and structure"
      description="Expected entries and how each category is split. Tune these until demand fits the day."
    >
      {!unit || draft.categories.length === 0 ? (
        <p className="text-sm text-muted-foreground">Add categories on the Tournament setup tab first.</p>
      ) : (
        draft.categories.map((category, i) => {
          const set = <K extends keyof CategoryDraft>(key: K) => (value: CategoryDraft[K]) =>
            update((d) => void (d.categories[i]![key] = value));
          const path = (key: keyof CategoryDraft) => ["categories", i, key];
          const nouns = entryNoun(unit, category.event, true);
          const notice = format ? unusedNotice(category, format) : null;
          return (
            <div key={category.id} className="flex flex-col gap-3">
              {i > 0 ? <Separator /> : null}
              <h3 className="text-sm font-medium">{categoryName(draft, category.id)}</h3>
              <FieldGrid>
                <NumberField
                  label={unit === "team" ? "Expected teams" : "Expected entries"}
                  step="1"
                  hint={unit === "team" ? teamCountHint(category) : `Number of ${nouns}.`}
                  path={path("expectedEntries")}
                  value={category.expectedEntries}
                  onChange={set("expectedEntries")}
                />
                <NumberField
                  label={`Expected external ${category.feeBasis === "player" ? "players" : nouns}`}
                  step="1"
                  hint="Optional. How many of the entrants are external."
                  path={path("expectedExternal")}
                  value={category.expectedExternal}
                  onChange={set("expectedExternal")}
                />
                {format === "groupsKnockout" || format === "groups" ? (
                  <>
                    <SelectField
                      label="Groups"
                      path={path("groupMode")}
                      value={category.groupMode}
                      options={GROUP_MODES}
                      onChange={set("groupMode")}
                    />
                    {category.groupMode === "fixed" ? (
                      <NumberField
                        label="Number of groups"
                        step="1"
                        path={path("groupCount")}
                        value={category.groupCount}
                        onChange={set("groupCount")}
                      />
                    ) : category.groupMode === "auto" ? (
                      <NumberField
                        label="Preferred group size"
                        step="1"
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
                  </>
                ) : null}
                {format === "groupsKnockout" ? (
                  <NumberField
                    label="Qualifiers per group"
                    step="1"
                    path={path("qualifiersPerGroup")}
                    value={category.qualifiersPerGroup}
                    onChange={set("qualifiersPerGroup")}
                  />
                ) : null}
              </FieldGrid>
              {format === "groupsKnockout" || format === "knockout" ? (
                <SwitchField label="Bronze match" checked={category.bronze} onChange={set("bronze")} />
              ) : null}
              {notice ? <p className="text-xs text-muted-foreground">{notice}</p> : null}
              {format ? (
                <FormatPreview category={category} unit={unit} format={format} />
              ) : (
                <p className="text-xs text-muted-foreground">Choose a format on the Tournament setup tab.</p>
              )}
            </div>
          );
        })
      )}
    </Section>
  );
}
