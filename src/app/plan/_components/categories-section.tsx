"use client";

import { PlusIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { categoryFormat, type GroupMode } from "@/engine";
import { emptyCategory, type CategoryDraft, type PlanDraft } from "@/lib/tournament/draft";
import { FieldGrid, NumberField, Section, SelectField, SwitchField, TextField } from "./fields";
import { formatErrorMessage, formatGroupSizes } from "./labels";
import type { Update } from "./plan-editor";

const GROUP_MODES = [
  { value: "auto", label: "Propose from a preferred group size" },
  { value: "fixed", label: "Set the number of groups" },
] as const;

const FEE_BASES = [
  { value: "player", label: "Per player" },
  { value: "pair", label: "Per pair" },
] as const;

/** Live summary of the groups the current entries produce. */
function FormatPreview({ category }: { category: CategoryDraft }) {
  const groups: GroupMode | null =
    category.groupMode === "fixed" && category.groupCount
      ? { type: "fixed", groupCount: category.groupCount }
      : category.groupMode === "auto" && category.preferredGroupSize
        ? { type: "auto", preferredSize: category.preferredGroupSize }
        : null;
  if (!groups || category.expectedPairs === null || category.qualifiersPerGroup === null) {
    return null;
  }

  const result = categoryFormat({
    id: category.id,
    name: category.name,
    expectedPairs: category.expectedPairs,
    groups,
    qualifiersPerGroup: category.qualifiersPerGroup,
    bronze: category.bronze,
    fee: { basis: "pair", amount: 0, expectedExternal: 0 },
  });

  if (!result.ok) {
    return (
      <p className="text-sm text-destructive">
        {result.errors.map(formatErrorMessage).join(". ")}
      </p>
    );
  }
  const { groupSizes, qualifiers, totalMatches } = result.format;
  return (
    <p className="rounded-lg bg-muted px-3 py-2 text-sm">
      Groups: {formatGroupSizes(groupSizes)} pairs · {qualifiers} qualify · {totalMatches} matches
    </p>
  );
}

export function CategoriesSection({ draft, update }: { draft: PlanDraft; update: Update }) {
  return (
    <Section
      title="Categories and format"
      description="Doubles, group stage then knockout. Tune the format until demand fits the frame."
      action={
        <Button
          variant="outline"
          size="sm"
          onClick={() => update((d) => void d.categories.push(emptyCategory()))}
        >
          <PlusIcon /> Add category
        </Button>
      }
    >
      {draft.categories.map((category, i) => {
        const set = <K extends keyof CategoryDraft>(key: K) => (value: CategoryDraft[K]) =>
          update((d) => void (d.categories[i]![key] = value));
        const path = (key: keyof CategoryDraft) => ["categories", i, key];
        return (
          <div key={category.id} className="flex flex-col gap-3">
            {i > 0 ? <Separator /> : null}
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <TextField
                  label="Category name"
                  placeholder="e.g. Mixed doubles"
                  path={path("name")}
                  value={category.name}
                  onChange={set("name")}
                />
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
                <Trash2Icon />
              </Button>
            </div>
            <FieldGrid>
              <NumberField
                label="Expected pairs"
                step="1"
                path={path("expectedPairs")}
                value={category.expectedPairs}
                onChange={set("expectedPairs")}
              />
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
                  hint="Larger groups lengthen the group stage and shorten the knockout."
                  path={path("preferredGroupSize")}
                  value={category.preferredGroupSize}
                  onChange={set("preferredGroupSize")}
                />
              ) : null}
              <NumberField
                label="Qualifiers per group"
                step="1"
                path={path("qualifiersPerGroup")}
                value={category.qualifiersPerGroup}
                onChange={set("qualifiersPerGroup")}
              />
            </FieldGrid>
            <SwitchField label="Bronze match" checked={category.bronze} onChange={set("bronze")} />
            <FormatPreview category={category} />

            <h3 className="text-sm font-medium">Entry fee</h3>
            <FieldGrid>
              <SelectField
                label="Charged"
                path={path("feeBasis")}
                value={category.feeBasis}
                options={FEE_BASES}
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
                label={category.feeBasis === "pair" ? "Expected external pairs" : "Expected external players"}
                step="1"
                hint="Optional."
                path={path("expectedExternal")}
                value={category.expectedExternal}
                onChange={set("expectedExternal")}
              />
            </FieldGrid>
          </div>
        );
      })}
    </Section>
  );
}
