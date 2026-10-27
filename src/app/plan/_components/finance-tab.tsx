"use client";

import { PlusIcon, TrashIcon } from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { playersPerEntry } from "@/engine";
import {
  costPerShuttle,
  emptyOtherCost,
  emptyOtherIncome,
  emptyPrize,
  type CategoryDraft,
  type OtherCostDraft,
  type OtherIncomeDraft,
  type PlanDraft,
  type PrizeDraft,
} from "@/lib/tournament/draft";
import { NumberField, Section, SegmentedField, SelectField, StepperField, TextField } from "./fields";
import { categoryName, entryNoun, formatMoney } from "./labels";
import type { Update } from "./plan-editor";

const TYPES = [
  { value: "fixed", label: "Fixed" },
  { value: "perPerson", label: "Per person" },
] as const;

const COST_BASES = [
  { value: "players", label: "Per player" },
  { value: "umpires", label: "Per umpire" },
  { value: "custom", label: "Set a number" },
] as const;

const INCOME_BASES = [
  { value: "players", label: "Per player" },
  { value: "custom", label: "Set a number" },
] as const;

const PRICE_BASES = [
  { value: "shuttle", label: "Per shuttle" },
  { value: "tube", label: "Per tube" },
] as const;

/** Entry fees, shuttles, prizes, other costs and other money in. */
export function FinanceTab({ draft, update }: { draft: PlanDraft; update: Update }) {
  return (
    <>
      <EntryFees draft={draft} update={update} />
      <Shuttles draft={draft} update={update} />
      <Prizes draft={draft} update={update} />
      <MoneyList kind="cost" draft={draft} update={update} />
      <MoneyList kind="income" draft={draft} update={update} />
    </>
  );
}

function entryTag(draft: PlanDraft, category: CategoryDraft): string {
  if (draft.unit === "team") return "Team";
  if (!category.event) return "No event";
  return playersPerEntry(category.event) === 1 ? "Individual" : "Pair";
}

function EntryFees({ draft, update }: { draft: PlanDraft; update: Update }) {
  const { unit } = draft;
  return (
    <Section title="Entry fees" description="Per category. External entries can pay a different fee.">
      {!unit || draft.categories.length === 0 ? (
        <p className="text-sm text-muted-foreground">Add categories on the Tournament setup tab first.</p>
      ) : (
        draft.categories.map((category, i) => {
          const set = <K extends keyof CategoryDraft>(key: K) => (value: CategoryDraft[K]) =>
            update((d) => void (d.categories[i]![key] = value));
          const path = (key: keyof CategoryDraft) => ["categories", i, key];
          const noun = entryNoun(unit, category.event);
          return (
            <div key={category.id} className="flex flex-col gap-3 rounded-lg bg-inset p-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-medium">{categoryName(draft, category.id)}</h3>
                <Badge variant="outline">{entryTag(draft, category)}</Badge>
              </div>
              <SegmentedField
                label="Charged"
                path={path("feeBasis")}
                value={category.feeBasis}
                options={[
                  { value: "player", label: "Per player" },
                  { value: "entry", label: noun === "entry" ? "Per entry" : `Per ${noun}` },
                ]}
                onChange={set("feeBasis")}
              />
              <div className="grid grid-cols-1 gap-3 @sm:grid-cols-2">
                <NumberField label="Fee (£)" path={path("feeAmount")} value={category.feeAmount} onChange={set("feeAmount")} />
                <NumberField
                  label="External fee (£)"
                  hint="Optional. Leave empty if everyone pays the same."
                  path={path("externalFeeAmount")}
                  value={category.externalFeeAmount}
                  onChange={set("externalFeeAmount")}
                />
              </div>
            </div>
          );
        })
      )}
    </Section>
  );
}

function Shuttles({ draft, update }: { draft: PlanDraft; update: Update }) {
  const { finance } = draft;
  const perShuttle = costPerShuttle(finance);
  return (
    <Section title="Shuttles" description="Shuttle use follows the games played, at typical length.">
      <div className="@sm:max-w-64">
        <NumberField
          label="Shuttles expected per game"
          path={["finance", "shuttlesPerGame"]}
          value={finance.shuttlesPerGame}
          onChange={(v) => update((d) => void (d.finance.shuttlesPerGame = v))}
        />
      </div>
      <SegmentedField
        label="Price entered"
        path={["finance", "shuttlePriceBasis"]}
        value={finance.shuttlePriceBasis}
        options={PRICE_BASES}
        onChange={(v) => update((d) => void (d.finance.shuttlePriceBasis = v))}
      />
      <div className="grid grid-cols-1 gap-3 @sm:grid-cols-2">
        <NumberField
          label={finance.shuttlePriceBasis === "tube" ? "Price per tube (£)" : "Price per shuttle (£)"}
          path={["finance", "shuttlePrice"]}
          value={finance.shuttlePrice}
          onChange={(v) => update((d) => void (d.finance.shuttlePrice = v))}
        />
        {finance.shuttlePriceBasis === "tube" ? (
          <StepperField
            label="Shuttles per tube"
            min={1}
            path={["finance", "shuttlesPerTube"]}
            value={finance.shuttlesPerTube}
            onChange={(v) => update((d) => void (d.finance.shuttlesPerTube = v))}
          />
        ) : null}
      </div>
      {finance.shuttlePriceBasis === "tube" ? (
        <p className="text-sm text-muted-foreground tabular-nums">
          = {perShuttle === null ? "–" : formatMoney(perShuttle)} per shuttle (calculated)
        </p>
      ) : null}
    </Section>
  );
}

function Prizes({ draft, update }: { draft: PlanDraft; update: Update }) {
  const options = draft.categories.map((c) => ({ value: c.id, label: categoryName(draft, c.id) }));
  return (
    <Section
      title="Prizes"
      description="Cash prizes by category and position."
      action={
        <Button
          variant="outline"
          size="sm"
          disabled={draft.categories.length === 0}
          onClick={() => update((d) => void d.finance.prizes.push(emptyPrize(d.categories[0]?.id ?? "")))}
        >
          <PlusIcon /> Add prize
        </Button>
      }
    >
      {draft.finance.prizes.length === 0 ? (
        <p className="text-sm text-muted-foreground">No prizes yet.</p>
      ) : (
        draft.finance.prizes.map((prize, i) => {
          const set = <K extends keyof PrizeDraft>(key: K) => (value: PrizeDraft[K]) =>
            update((d) => void (d.finance.prizes[i]![key] = value));
          const path = (key: keyof PrizeDraft) => ["finance", "prizes", i, key];
          return (
            <div key={prize.id} className="flex items-end gap-2">
              <div className="grid flex-1 grid-cols-1 gap-2 @sm:grid-cols-[1fr_1fr_7rem]">
                <SelectField
                  label="Category"
                  path={path("categoryId")}
                  value={prize.categoryId || null}
                  options={options}
                  onChange={set("categoryId")}
                />
                <TextField
                  label="Position"
                  placeholder="e.g. Winner"
                  path={path("position")}
                  value={prize.position}
                  onChange={set("position")}
                />
                <NumberField label="Amount (£)" path={path("amount")} value={prize.amount} onChange={set("amount")} />
              </div>
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
        })
      )}
    </Section>
  );
}

type Line = OtherCostDraft | OtherIncomeDraft;

/** Other costs or other money in: each a fixed amount or an amount per person. */
function MoneyList({ kind, draft, update }: { kind: "cost" | "income"; draft: PlanDraft; update: Update }) {
  const key = kind === "cost" ? "otherCosts" : "otherIncome";
  const lines: Line[] = draft.finance[key];
  const noun = kind === "cost" ? "cost" : "income";
  const edit = (i: number, recipe: (line: Line) => void) => update((d) => recipe(d.finance[key][i]!));
  return (
    <Section
      title={kind === "cost" ? "Other costs" : "Other money in"}
      description={
        kind === "cost"
          ? "For example trophies, printing or umpire food. Court hire is worked out from the venue."
          : "For example sponsorship, a raffle or spectator tickets."
      }
      action={
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            update((d) => {
              if (kind === "cost") d.finance.otherCosts.push(emptyOtherCost());
              else d.finance.otherIncome.push(emptyOtherIncome());
            })
          }
        >
          <PlusIcon /> Add {noun}
        </Button>
      }
    >
      {lines.length === 0 ? (
        <p className="text-sm text-muted-foreground">{kind === "cost" ? "No other costs yet." : "No other money in yet."}</p>
      ) : (
        lines.map((line, i) => {
          const path = (field: keyof Line) => ["finance", key, i, field];
          return (
            <div key={line.id} className="flex flex-col gap-3 rounded-lg bg-inset p-3">
              <div className="flex items-end gap-2">
                <div className="min-w-0 flex-1">
                  <TextField
                    label="Name"
                    placeholder={kind === "cost" ? "e.g. Trophies" : "e.g. Sponsorship"}
                    path={path("label")}
                    value={line.label}
                    onChange={(v) => edit(i, (l) => void (l.label = v))}
                  />
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove ${line.label || noun}`}
                  onClick={() => update((d) => void d.finance[key].splice(i, 1))}
                >
                  <TrashIcon />
                </Button>
              </div>
              <SegmentedField
                label="Type"
                path={path("type")}
                value={line.type}
                options={TYPES}
                onChange={(v) => edit(i, (l) => void (l.type = v))}
              />
              {line.type === "perPerson" ? (
                <SegmentedField
                  label="Per"
                  path={path("basis")}
                  value={line.basis}
                  options={kind === "cost" ? COST_BASES : INCOME_BASES}
                  onChange={(v) => edit(i, (l) => void ((l as OtherCostDraft).basis = v))}
                />
              ) : null}
              <div className="grid grid-cols-1 gap-3 @sm:grid-cols-2">
                <NumberField
                  label={line.type === "perPerson" ? "Amount per person (£)" : "Amount (£)"}
                  path={path("amount")}
                  value={line.amount}
                  onChange={(v) => edit(i, (l) => void (l.amount = v))}
                />
                {line.type === "perPerson" && line.basis === "custom" ? (
                  <StepperField
                    label="Number of people"
                    path={path("count")}
                    value={line.count}
                    onChange={(v) => edit(i, (l) => void (l.count = v))}
                  />
                ) : null}
              </div>
            </div>
          );
        })
      )}
    </Section>
  );
}
