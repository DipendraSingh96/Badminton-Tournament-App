"use client";

import { ArrowDownIcon, ArrowUpIcon, PlusIcon, TrashIcon } from "@phosphor-icons/react";
import { useContext, useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { TIEBREAK_CRITERIA, type TiebreakCriterion, type WalkoverRule, type WithdrawalRule } from "@/engine";
import {
  emptyExclusivePair,
  openDoublesInUse,
  pairsInUse,
  type PlanDraft,
  type RulesDraft,
} from "@/lib/tournament/draft";
import { TIEBREAK_LABELS, WALKOVER_LABELS, WITHDRAWAL_LABELS } from "@/lib/tournament/events";
import { InfoTip, IssuesContext, Section, SegmentedField, SelectField, StepperField, SwitchField, pathKey } from "./fields";
import { categoryName } from "./labels";
import type { Update } from "./plan-editor";

const WITHDRAWALS = (Object.keys(WITHDRAWAL_LABELS) as WithdrawalRule[]).map((value) => ({
  value,
  label: WITHDRAWAL_LABELS[value],
}));

const WALKOVERS = (Object.keys(WALKOVER_LABELS) as WalkoverRule[]).map((value) => ({
  value,
  label: WALKOVER_LABELS[value],
}));

const HANDICAPS: { key: keyof Omit<RulesDraft["handicap"], "enabled">; label: string; hint: string }[] = [
  { key: "mixedVsMens", label: "Mixed pair vs men's pair", hint: "Points the mixed pair starts each game with." },
  { key: "womensVsMens", label: "Women's pair vs men's pair", hint: "Points the women's pair starts each game with." },
  { key: "womensVsMixed", label: "Women's pair vs mixed pair", hint: "Points the women's pair starts each game with." },
];

function Heading({ title, description }: { title: string; description: string }) {
  return (
    <h3 className="flex items-center gap-1 text-sm font-medium">
      {title}
      <InfoTip about={title}>{description}</InfoTip>
    </h3>
  );
}

/** A message for an issue on a whole list or row, rather than one field. */
function IssueMessage({ path }: { path: PropertyKey[] }) {
  const message = useContext(IssuesContext).get(pathKey(path));
  return message ? <p className="text-xs text-over-text">{message}</p> : null;
}

export function RulesSection({ draft, update }: { draft: PlanDraft; update: Update }) {
  const { rules } = draft;
  return (
    <Section
      title="Rules"
      description="Set once for the tournament. They are kept with the plan and applied to the draw, standings and results."
    >

      <Tiebreaks draft={draft} update={update} />

      {openDoublesInUse(draft) ? (
        <>
          <Separator />
          <Heading
            title="Open doubles handicap"
            description="A points head start in every game when different pair types meet, given to the weaker pair type. The same in every stage, and in Open doubles rubbers of team ties. Pairs of the same type get none."
          />
          <SwitchField
            label="Give a head start"
            checked={rules.handicap.enabled}
            onChange={(on) => update((d) => void (d.rules.handicap.enabled = on))}
          />
          {rules.handicap.enabled ? (
            <div className="grid grid-cols-1 gap-3 @md:grid-cols-3">
              {HANDICAPS.map(({ key, label, hint }) => (
                <StepperField
                  key={key}
                  label={label}
                  hint={hint}
                  path={["rules", "handicap", key]}
                  value={rules.handicap[key]}
                  onChange={(v) => update((d) => void (d.rules.handicap[key] = v))}
                />
              ))}
            </div>
          ) : null}
        </>
      ) : null}

      <Separator />
      <Eligibility draft={draft} update={update} />

      <Separator />
      <Heading
        title="Withdrawals and walkovers"
        description="Before the draw, a withdrawn entry's place becomes a bye."
      />
      <SegmentedField
        label="If an entry withdraws after play starts"
        path={["rules", "withdrawal"]}
        value={rules.withdrawal}
        options={WITHDRAWALS}
        hint={
          rules.withdrawal === "byesThenVoid"
            ? "Every match they played is removed from the standings, as if they never entered."
            : rules.withdrawal === "byesThenWalkovers"
              ? "Their remaining opponents win by walkover; matches already played keep their scores."
              : undefined
        }
        onChange={(v) => update((d) => void (d.rules.withdrawal = v))}
      />
      <SegmentedField
        label="A walkover counts as"
        path={["rules", "walkover"]}
        value={rules.walkover}
        options={WALKOVERS}
        hint={
          rules.walkover === "straightGamesAtTarget"
            ? "A win in straight games at the stage's points per game, e.g. 21–0, 21–0."
            : rules.walkover === "winOnly"
              ? "Counts as a match won; no games or points go to either side."
              : undefined
        }
        onChange={(v) => update((d) => void (d.rules.walkover = v))}
      />
    </Section>
  );
}

function Tiebreaks({ draft, update }: { draft: PlanDraft; update: Update }) {
  const [adding, setAdding] = useState(false);
  const { tiebreaks } = draft.rules;
  const available = TIEBREAK_CRITERIA.filter(
    (c) => !tiebreaks.includes(c) && (c !== "rubbersWon" || draft.unit === "team"),
  );
  const lots = tiebreaks.indexOf("drawOfLots");

  function add(criterion: TiebreakCriterion) {
    update((d) => {
      const list = d.rules.tiebreaks;
      const at = list.indexOf("drawOfLots");
      // Draw of lots stays last.
      if (criterion !== "drawOfLots" && at !== -1) list.splice(at, 0, criterion);
      else list.push(criterion);
    });
    setAdding(false);
  }

  function move(from: number, to: number) {
    update((d) => {
      const [item] = d.rules.tiebreaks.splice(from, 1);
      d.rules.tiebreaks.splice(to, 0, item!);
    });
  }

  return (
    <div className="flex flex-col gap-2" data-path="rules.tiebreaks">
      <Heading
        title="Tiebreak order"
        description="How entries level on the first criterion are separated in a group, in this order."
      />
      {tiebreaks.length === 0 ? (
        <p className="text-sm text-muted-foreground">No tiebreaks yet. Add the first one.</p>
      ) : (
        <ol className="flex flex-col gap-1">
          {tiebreaks.map((criterion, i) => {
            const fixedLast = criterion === "drawOfLots";
            const canUp = i > 0 && !fixedLast;
            const canDown = i < tiebreaks.length - 1 && !(lots !== -1 && i === lots - 1);
            return (
              <li key={criterion} className="flex items-center gap-2 rounded-lg bg-inset py-1 pr-1 pl-3">
                <span className="w-5 text-sm text-muted-foreground tabular-nums">{i + 1}.</span>
                <span className="flex-1 text-sm">
                  {TIEBREAK_LABELS[criterion]}
                  {fixedLast ? <span className="text-muted-foreground"> · always last</span> : null}
                </span>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Move ${TIEBREAK_LABELS[criterion].toLowerCase()} up`}
                  disabled={!canUp}
                  onClick={() => move(i, i - 1)}
                >
                  <ArrowUpIcon />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Move ${TIEBREAK_LABELS[criterion].toLowerCase()} down`}
                  disabled={!canDown}
                  onClick={() => move(i, i + 1)}
                >
                  <ArrowDownIcon />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remove ${TIEBREAK_LABELS[criterion].toLowerCase()}`}
                  onClick={() => update((d) => void d.rules.tiebreaks.splice(i, 1))}
                >
                  <TrashIcon />
                </Button>
              </li>
            );
          })}
        </ol>
      )}
      {tiebreaks.length > 0 ? <IssueMessage path={["rules", "tiebreaks"]} /> : null}
      {available.length > 0 ? (
        <Popover open={adding} onOpenChange={setAdding}>
          <PopoverTrigger render={<Button variant="outline" size="sm" className="self-start" />}>
            <PlusIcon /> Add criterion
          </PopoverTrigger>
          <PopoverContent align="start" className="w-56 gap-0 p-1">
            {available.map((criterion) => (
              <button
                key={criterion}
                type="button"
                className="rounded-md px-2 py-1.5 text-left text-sm outline-none hover:bg-inset focus-visible:bg-inset"
                onClick={() => add(criterion)}
              >
                {TIEBREAK_LABELS[criterion]}
              </button>
            ))}
          </PopoverContent>
        </Popover>
      ) : null}
    </div>
  );
}

function Eligibility({ draft, update }: { draft: PlanDraft; update: Update }) {
  const { eligibility } = draft.rules;
  const options = draft.categories.map((c) => ({ value: c.id, label: categoryName(draft, c.id) }));
  return (
    <div className="flex flex-col gap-4">
      <Heading title="Eligibility" description="Who may enter what. Checked when entries are taken." />
      <div className="@md:max-w-64">
        <StepperField
          label="Most categories one person may enter"
          hint="Leave empty for no limit."
          min={1}
          path={["rules", "eligibility", "maxCategoriesPerPerson"]}
          value={eligibility.maxCategoriesPerPerson}
          onChange={(v) => update((d) => void (d.rules.eligibility.maxCategoriesPerPerson = v))}
        />
      </div>

      {draft.categories.length > 0 ? (
        <>
          <div className="flex flex-col gap-2">
            <span className="flex items-center gap-1 text-sm font-medium">
              Can&apos;t be entered together
              <InfoTip about="categories that can't be entered together">
                Pairs of categories one person can&apos;t both enter, e.g. two draws on at the same time.
              </InfoTip>
            </span>
            {eligibility.exclusivePairs.length === 0 ? (
              <p className="text-xs text-muted-foreground">None yet.</p>
            ) : (
              eligibility.exclusivePairs.map((pair, i) => (
                <div
                  key={pair.id}
                  className="flex flex-col gap-1"
                  data-path={pathKey(["rules", "eligibility", "exclusivePairs", i])}
                >
                  <div className="flex items-end gap-2">
                    <div className="grid flex-1 grid-cols-1 gap-2 @md:grid-cols-2">
                      <SelectField
                        label="Category"
                        path={["rules", "eligibility", "exclusivePairs", i, "first"]}
                        value={pair.first}
                        options={options}
                        onChange={(v) => update((d) => void (d.rules.eligibility.exclusivePairs[i]!.first = v))}
                      />
                      <SelectField
                        label="Can't also enter"
                        path={["rules", "eligibility", "exclusivePairs", i, "second"]}
                        value={pair.second}
                        options={options}
                        onChange={(v) => update((d) => void (d.rules.eligibility.exclusivePairs[i]!.second = v))}
                      />
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Remove this pair"
                      onClick={() => update((d) => void d.rules.eligibility.exclusivePairs.splice(i, 1))}
                    >
                      <TrashIcon />
                    </Button>
                  </div>
                  {pair.first || pair.second ? (
                    <IssueMessage path={["rules", "eligibility", "exclusivePairs", i]} />
                  ) : null}
                </div>
              ))
            )}
            <Button
              variant="outline"
              size="sm"
              className="self-start"
              disabled={draft.categories.length < 2}
              onClick={() => update((d) => void d.rules.eligibility.exclusivePairs.push(emptyExclusivePair()))}
            >
              <PlusIcon /> Add pair
            </Button>
          </div>

          <div className="flex flex-col gap-2" data-path="rules.eligibility.membersOnly">
            <span className="flex items-center gap-1 text-sm font-medium">
              Members only
              <InfoTip about="members-only categories">
                Categories only members may enter. The rest are open to external players too.
              </InfoTip>
            </span>
            {draft.categories.map((category) => (
              <SwitchField
                key={category.id}
                label={categoryName(draft, category.id)}
                checked={eligibility.membersOnly.includes(category.id)}
                onChange={(on) =>
                  update((d) => {
                    const list = d.rules.eligibility.membersOnly;
                    d.rules.eligibility.membersOnly = on
                      ? [...list, category.id]
                      : list.filter((id) => id !== category.id);
                  })
                }
              />
            ))}
          </div>
        </>
      ) : null}

      {pairsInUse(draft) ? (
        <SwitchField
          label="Allow a member to pair with an external player"
          checked={eligibility.allowMixedMemberExternalPairs}
          onChange={(on) => update((d) => void (d.rules.eligibility.allowMixedMemberExternalPairs = on))}
        />
      ) : null}
    </div>
  );
}
