"use client";

import { PlusIcon, TrashIcon } from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { playersPerEntry } from "@/engine";
import {
  costPerShuttle,
  emptyOtherCost,
  emptyOtherIncome,
  PRIZE_PLACES,
  prizeFor,
  prizePlace,
  setPrizeOn,
  type CategoryDraft,
  type OtherCostDraft,
  type OtherIncomeDraft,
  type PlanDraft,
  type PrizeDraft,
} from "@/lib/tournament/draft";
import { NumberField, Section, SegmentedField, StepperField, TextField, pathKey } from "./fields";
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
        <p className="text-sm text-muted-foreground">Add categories on the Setup tab first.</p>
      ) : (
        draft.categories.map((category, i) => {
          const set = <K extends keyof CategoryDraft>(key: K) => (value: CategoryDraft[K]) =>
            update((d) => void (d.categories[i]![key] = value));
          const path = (key: keyof CategoryDraft) => ["categories", i, key];
          const noun = entryNoun(unit, category.event);
          return (
            <div key={category.id} className="flex flex-col gap-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">{categoryName(draft, category.id)}</h3>
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
              <div className="grid grid-cols-2 gap-x-2 gap-y-3">
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
      <div className="w-[calc(50%-0.25rem)]">
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
      <div className="grid grid-cols-2 gap-x-2 gap-y-3">
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

/**
 * Prizes: a box for each category, with 1st, 2nd and 3rd to tick and price.
 * A ticked place is a prize; unticked, it isn't given. A prize entered
 * earlier under another name keeps its own row in its category's box.
 */
function Prizes({ draft, update }: { draft: PlanDraft; update: Update }) {
  const amount = (prize: PrizeDraft | undefined, label: string, disabled: boolean) => {
    const index = prize ? draft.finance.prizes.indexOf(prize) : -1;
    return (
      <Input
        type="number"
        inputMode="decimal"
        min={0}
        step="any"
        aria-label={label}
        placeholder="Amount (£)"
        disabled={disabled}
        data-path={index === -1 ? undefined : pathKey(["finance", "prizes", index, "amount"])}
        className="w-32 text-right tabular-nums"
        value={prize?.amount ?? ""}
        onChange={(e) => {
          const raw = e.target.value;
          const parsed = raw === "" ? null : Number(raw);
          update((d) => {
            const own = d.finance.prizes[index];
            if (own) own.amount = parsed === null || Number.isNaN(parsed) ? null : parsed;
          });
        }}
      />
    );
  };
  return (
    <Section title="Prizes" description="Tick the places that win a cash prize in each category, and say how much.">
      {draft.categories.length === 0 ? <p className="text-sm text-muted-foreground">Add a category first.</p> : null}
      {draft.categories.map((category) => {
        const name = categoryName(draft, category.id);
        const others = draft.finance.prizes.filter((p) => p.categoryId === category.id && prizePlace(p.position) === null);
        return (
          <div key={category.id} role="group" aria-label={`${name} prizes`} className="flex flex-col gap-2 rounded-lg bg-card-system p-3">
            <h4 className="text-sm font-semibold">{name}</h4>
            {PRIZE_PLACES.map((label, place) => {
              const prize = prizeFor(draft, category.id, place as 0 | 1 | 2);
              const on = Boolean(prize) && !prize!.off;
              return (
                <label key={label} className="flex items-center gap-3">
                  <Checkbox checked={on} onCheckedChange={(next) => update((d) => setPrizeOn(d, category.id, place as 0 | 1 | 2, Boolean(next)))} />
                  <span className={cn("flex-1 text-sm", !on && "text-muted-foreground")}>{label}</span>
                  {amount(prize, `${name}, ${label} prize (£)`, !on)}
                </label>
              );
            })}
            {others.map((prize) => {
              const on = !prize.off;
              return (
                <label key={prize.id} className="flex items-center gap-3">
                  <Checkbox
                    checked={on}
                    onCheckedChange={(next) =>
                      update((d) => {
                        const own = d.finance.prizes.find((p) => p.id === prize.id);
                        if (!own) return;
                        if (next) delete own.off;
                        else own.off = true;
                      })
                    }
                  />
                  <span className={cn("min-w-0 flex-1 truncate text-sm", !on && "text-muted-foreground")}>{prize.position || "Prize"}</span>
                  {amount(prize, `${name}, ${prize.position || "prize"} (£)`, !on)}
                </label>
              );
            })}
          </div>
        );
      })}
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
  // Beside the heading while the list is empty; under the last card once there is one, so adding several doesn't mean going back up.
  const add = (
    <Button
      variant="outline"
      size="sm"
      className="self-start"
      onClick={() =>
        update((d) => {
          if (kind === "cost") d.finance.otherCosts.push(emptyOtherCost());
          else d.finance.otherIncome.push(emptyOtherIncome());
        })
      }
    >
      <PlusIcon /> Add {noun}
    </Button>
  );
  return (
    <Section
      title={kind === "cost" ? "Other costs" : "Other money in"}
      description={
        kind === "cost"
          ? "For example trophies, printing or umpire food. Court hire is worked out from the venue."
          : "For example sponsorship, a raffle or spectator tickets."
      }
      action={lines.length === 0 ? add : null}
    >
      {lines.length === 0 ? (
        <p className="text-sm text-muted-foreground">{kind === "cost" ? "No other costs yet." : "No other money in yet."}</p>
      ) : (
        lines.map((line, i) => {
          const path = (field: keyof Line) => ["finance", key, i, field];
          return (
            <div key={line.id} className="flex flex-col gap-3 rounded-lg bg-card-system p-3">
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
              <div className="grid grid-cols-2 gap-x-2 gap-y-3">
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
      {lines.length > 0 ? add : null}
    </Section>
  );
}
