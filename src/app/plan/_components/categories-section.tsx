"use client";

import { PlusIcon, TrashIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { EVENT_TYPES, categoryFormat, type FormatType, type GroupMode, type Unit } from "@/engine";
import { emptyCategory, type CategoryDraft, type PlanDraft } from "@/lib/tournament/draft";
import { EVENT_LABELS, FORMAT_LABELS, UNIT_LABELS } from "@/lib/tournament/events";
import { FieldGrid, NumberField, Section, SelectField, SwitchField, TextField } from "./fields";
import { entryNoun, formatErrorMessage, formatGroupSizes } from "./labels";
import type { Update } from "./plan-editor";

const UNITS = (Object.keys(UNIT_LABELS) as Unit[]).map((value) => ({ value, label: UNIT_LABELS[value] }));
const FORMATS = (Object.keys(FORMAT_LABELS) as FormatType[]).map((value) => ({
  value,
  label: FORMAT_LABELS[value],
}));
const EVENTS = EVENT_TYPES.map((value) => ({
  value,
  label: value === "OPEN" ? "Open doubles (men's, women's and mixed pairs)" : EVENT_LABELS[value],
}));

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
        <p className="tabular-nums">
          {totalFixtures} ties × {rubbers} rubbers = {totalFixtures * rubbers} matches
        </p>
      ) : null}
    </div>
  );
}

export function CategoriesSection({ draft, update }: { draft: PlanDraft; update: Update }) {
  const { unit, format } = draft;
  return (
    <Section
      title="Categories and format"
      description="Choose how entries play and the format, then add each category. Tune the format until demand fits the frame."
      action={
        unit ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => update((d) => void d.categories.push(emptyCategory()))}
          >
            <PlusIcon /> Add category
          </Button>
        ) : null
      }
    >
      <FieldGrid>
        <SelectField
          label="Unit of play"
          path={["unit"]}
          value={unit}
          options={UNITS}
          hint="Teams are made up of several players and pairs; the winner is a team."
          onChange={(v) => update((d) => void (d.unit = v))}
        />
        <SelectField
          label="Format"
          path={["format"]}
          value={format}
          options={FORMATS}
          hint="Applies to every category."
          onChange={(v) => update((d) => void (d.format = v))}
        />
      </FieldGrid>

      {!unit ? (
        <p className="text-sm text-muted-foreground">Choose the unit of play to set up categories.</p>
      ) : (
        draft.categories.map((category, i) => {
          const set = <K extends keyof CategoryDraft>(key: K) => (value: CategoryDraft[K]) =>
            update((d) => void (d.categories[i]![key] = value));
          const path = (key: keyof CategoryDraft) => ["categories", i, key];
          const noun = entryNoun(unit, category.event);
          const nouns = entryNoun(unit, category.event, true);
          return (
            <div key={category.id} className="flex flex-col gap-3">
              <Separator />
              <div className="flex items-end gap-2">
                <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-2">
                  {unit === "individual" ? (
                    <>
                      <SelectField
                        label="Event"
                        path={path("event")}
                        value={category.event}
                        options={EVENTS}
                        onChange={set("event")}
                      />
                      <TextField
                        label="Name (optional)"
                        placeholder={category.event ? EVENT_LABELS[category.event] : "e.g. Under-15 boys' singles"}
                        path={path("name")}
                        value={category.name}
                        onChange={set("name")}
                      />
                    </>
                  ) : (
                    <>
                      <TextField
                        label="Competition name"
                        placeholder="e.g. Club team cup"
                        path={path("name")}
                        value={category.name}
                        onChange={set("name")}
                      />
                      <NumberField
                        label="Players per team"
                        step="1"
                        path={path("playersPerTeam")}
                        value={category.playersPerTeam}
                        onChange={set("playersPerTeam")}
                      />
                    </>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove ${category.name || "category"}`}
                  disabled={draft.categories.length === 1}
                  onClick={() =>
                    update((d) => {
                      d.categories.splice(i, 1);
                      d.finance.prizes = d.finance.prizes.filter((p) => p.categoryId !== category.id);
                    })
                  }
                >
                  <TrashIcon />
                </Button>
              </div>

              {unit === "team" ? (
                <fieldset className="flex flex-col gap-2">
                  <legend className="text-sm font-medium">Line-up of a tie</legend>
                  <p className="text-xs text-muted-foreground">
                    Rubbers of each event in every tie. All rubbers are played; the team that wins the
                    most rubbers wins the tie.
                  </p>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {EVENT_TYPES.map((event) => (
                      <NumberField
                        key={event}
                        label={EVENT_LABELS[event]}
                        step="1"
                        path={["categories", i, "lineUp", event]}
                        value={category.lineUp[event]}
                        onChange={(v) => update((d) => void (d.categories[i]!.lineUp[event] = v))}
                      />
                    ))}
                  </div>
                </fieldset>
              ) : null}

              <FieldGrid>
                <NumberField
                  label="Expected entries"
                  step="1"
                  hint={`Number of ${nouns}.`}
                  path={path("expectedEntries")}
                  value={category.expectedEntries}
                  onChange={set("expectedEntries")}
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
              {format ? <FormatPreview category={category} unit={unit} format={format} /> : null}

              <h3 className="text-sm font-medium">Entry fee</h3>
              <FieldGrid>
                <SelectField
                  label="Charged"
                  path={path("feeBasis")}
                  value={category.feeBasis}
                  options={[
                    { value: "player", label: "Per player" },
                    { value: "entry", label: noun === "entry" ? "Per entry" : `Per ${noun}` },
                  ]}
                  onChange={set("feeBasis")}
                />
                <NumberField
                  label="Fee (£)"
                  path={path("feeAmount")}
                  value={category.feeAmount}
                  onChange={set("feeAmount")}
                />
                <NumberField
                  label="External fee (£)"
                  hint="Optional. Leave empty if everyone pays the same."
                  path={path("externalFeeAmount")}
                  value={category.externalFeeAmount}
                  onChange={set("externalFeeAmount")}
                />
                <NumberField
                  label={`Expected external ${category.feeBasis === "player" ? "players" : nouns}`}
                  step="1"
                  hint="Optional."
                  path={path("expectedExternal")}
                  value={category.expectedExternal}
                  onChange={set("expectedExternal")}
                />
              </FieldGrid>
            </div>
          );
        })
      )}
    </Section>
  );
}
