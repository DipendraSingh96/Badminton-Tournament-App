"use client";

import { PlusIcon, TrashIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import {
  emptyOtherCost,
  emptyPrize,
  type OtherCostDraft,
  type PlanDraft,
  type PrizeDraft,
} from "@/lib/tournament/draft";
import { FieldGrid, NumberField, Section, SelectField, TextField } from "./fields";
import { categoryName } from "./labels";
import type { Update } from "./plan-editor";

const COST_TYPES = [
  { value: "fixed", label: "Fixed amount" },
  { value: "perPerson", label: "Per person" },
] as const;

const COST_BASES = [
  { value: "players", label: "Per player" },
  { value: "umpires", label: "Per umpire" },
  { value: "custom", label: "Per person (set a number)" },
] as const;

export function FinanceSection({ draft, update }: { draft: PlanDraft; update: Update }) {
  const categoryOptions = draft.categories.map((c) => ({
    value: c.id,
    label: categoryName(draft, c.id),
  }));

  return (
    <Section
      title="Finance"
      description="Recalculates as you change the format or entries. With no fees it shows the cost to the organisers."
    >
      <FieldGrid>
        <NumberField
          label="Shuttles per game"
          path={["finance", "shuttlesPerGame"]}
          value={draft.finance.shuttlesPerGame}
          onChange={(v) => update((d) => void (d.finance.shuttlesPerGame = v))}
        />
        <NumberField
          label="Cost per shuttle (£)"
          path={["finance", "costPerShuttle"]}
          value={draft.finance.costPerShuttle}
          onChange={(v) => update((d) => void (d.finance.costPerShuttle = v))}
        />
      </FieldGrid>

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium">Prizes</h3>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              update((d) => void d.finance.prizes.push(emptyPrize(d.categories[0]?.id ?? "")))
            }
          >
            <PlusIcon /> Add prize
          </Button>
        </div>
        {draft.finance.prizes.map((prize, i) => {
          const set = <K extends keyof PrizeDraft>(key: K) => (value: PrizeDraft[K]) =>
            update((d) => void (d.finance.prizes[i]![key] = value));
          const path = (key: keyof PrizeDraft) => ["finance", "prizes", i, key];
          return (
            <div key={prize.id} className="grid grid-cols-1 items-end gap-2 sm:grid-cols-[1fr_1fr_8rem_auto]">
              <SelectField
                label="Category"
                path={path("categoryId")}
                value={prize.categoryId || null}
                options={categoryOptions}
                onChange={set("categoryId")}
              />
              <TextField
                label="Position"
                placeholder="e.g. Winners"
                path={path("position")}
                value={prize.position}
                onChange={set("position")}
              />
              <NumberField label="Amount (£)" path={path("amount")} value={prize.amount} onChange={set("amount")} />
              <Button
                variant="ghost"
                size="icon"
                aria-label="Remove prize"
                onClick={() => update((d) => void d.finance.prizes.splice(i, 1))}
              >
                <TrashIcon />
              </Button>
            </div>
          );
        })}
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium">Other costs</h3>
          <Button
            variant="outline"
            size="sm"
            onClick={() => update((d) => void d.finance.otherCosts.push(emptyOtherCost()))}
          >
            <PlusIcon /> Add cost
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          For example court hire, trophies, printing or umpire food.
        </p>
        {draft.finance.otherCosts.map((cost, i) => {
          const set = <K extends keyof OtherCostDraft>(key: K) => (value: OtherCostDraft[K]) =>
            update((d) => void (d.finance.otherCosts[i]![key] = value));
          const path = (key: keyof OtherCostDraft) => ["finance", "otherCosts", i, key];
          return (
            <div key={cost.id} className="flex flex-col gap-2 rounded-lg border p-3">
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <TextField label="Cost" path={path("label")} value={cost.label} onChange={set("label")} />
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove ${cost.label || "cost"}`}
                  onClick={() => update((d) => void d.finance.otherCosts.splice(i, 1))}
                >
                  <TrashIcon />
                </Button>
              </div>
              <FieldGrid>
                <SelectField label="Type" path={path("type")} value={cost.type} options={COST_TYPES} onChange={set("type")} />
                <NumberField
                  label={cost.type === "perPerson" ? "Amount per person (£)" : "Amount (£)"}
                  path={path("amount")}
                  value={cost.amount}
                  onChange={set("amount")}
                />
                {cost.type === "perPerson" ? (
                  <SelectField label="Per" path={path("basis")} value={cost.basis} options={COST_BASES} onChange={set("basis")} />
                ) : null}
                {cost.type === "perPerson" && cost.basis === "custom" ? (
                  <NumberField label="Number of people" step="1" path={path("count")} value={cost.count} onChange={set("count")} />
                ) : null}
              </FieldGrid>
            </div>
          );
        })}
      </div>
    </Section>
  );
}
