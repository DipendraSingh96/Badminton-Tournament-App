"use client";

import { PlusIcon, TrashIcon } from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EVENT_TYPES, playersPerEntry, type EventType, type FormatType, type Unit } from "@/engine";
import {
  defaultCategoryName,
  emptyCategory,
  removeCategory,
  type CategoryDraft,
  type PlanDraft,
} from "@/lib/tournament/draft";
import { EVENT_LABELS, FORMAT_LABELS } from "@/lib/tournament/events";
import { InfoTip, OptionCards, Section, SegmentedField, SelectField, StepperField, TextField } from "./fields";
import type { Update } from "./plan-editor";
import { RulesSection } from "./rules-section";

const UNITS: { value: Unit; label: string }[] = [
  { value: "individual", label: "Individual and pair events" },
  { value: "team", label: "Team" },
];

const FORMATS: { value: FormatType; label: string; description: string }[] = [
  {
    value: "groupsKnockout",
    label: FORMAT_LABELS.groupsKnockout,
    description: "Everyone plays their group; the top finishers go through to a knockout.",
  },
  {
    value: "groups",
    label: FORMAT_LABELS.groups,
    description: "Everyone in a group plays each other; the standings decide the places.",
  },
  {
    value: "knockout",
    label: FORMAT_LABELS.knockout,
    description: "Lose once and you're out. Byes fill the bracket.",
  },
];

const CHIP_GROUPS: { label: string; events: EventType[] }[] = [
  { label: "Individual", events: ["MS", "WS"] },
  { label: "Pair", events: ["MD", "WD", "XD", "OPEN"] },
];

/** Tournament type, categories, format and rules: set once for the tournament. */
export function SetupTab({ draft, update }: { draft: PlanDraft; update: Update }) {
  function chooseUnit(next: Unit) {
    if (next === draft.unit) return;
    if (draft.unit !== null && draft.categories.length > 0) {
      const message =
        next === "team"
          ? "Switching to Team replaces your categories with a team competition. Continue?"
          : "Switching to individual and pair events removes your team competitions. Continue?";
      if (!window.confirm(message)) return;
    }
    update((d) => {
      for (const category of [...d.categories]) removeCategory(d, category.id);
      d.unit = next;
      if (next === "team") d.categories.push(emptyCategory());
      else d.rules.tiebreaks = d.rules.tiebreaks.filter((t) => t !== "rubbersWon");
    });
  }

  return (
    <>
      <Section title="Tournament type" description="Set once for the tournament.">
        <SegmentedField
          label="Who enters"
          path={["unit"]}
          value={draft.unit}
          options={UNITS}
          hint={
            draft.unit === "team"
              ? "Teams of several players and pairs enter; the winner is a team."
              : "Players enter singles, and pairs enter doubles; they win individually."
          }
          onChange={chooseUnit}
        />
      </Section>

      {draft.unit ? (
        <Section
          title={draft.unit === "team" ? "Competitions" : "Categories"}
          description={
            draft.unit === "team"
              ? "Each competition has its own line-up. Entries and structure are on the Schedule structure tab."
              : "Choose the events you're running. Add an event more than once for separate categories, such as an under-15s draw."
          }
          action={
            draft.unit === "team" ? (
              <Button variant="outline" size="sm" onClick={() => update((d) => void d.categories.push(emptyCategory()))}>
                <PlusIcon /> Add competition
              </Button>
            ) : null
          }
        >
          {draft.unit === "individual" ? <EventChips draft={draft} update={update} /> : null}
          {draft.categories.length === 0 ? (
            <p className="text-sm text-muted-foreground" data-path="categories">
              {draft.unit === "team" ? "Add a competition to start." : "Choose the events you're running."}
            </p>
          ) : (
            <ul className="flex flex-col gap-2" data-path="categories">
              {draft.categories.map((category, i) =>
                draft.unit === "team" ? (
                  <CompetitionCard key={category.id} draft={draft} index={i} update={update} />
                ) : (
                  <CategoryRow key={category.id} draft={draft} index={i} update={update} />
                ),
              )}
            </ul>
          )}
        </Section>
      ) : null}

      <Section title="Format" description="Applies to every category.">
        <OptionCards
          label="How categories are played"
          path={["format"]}
          value={draft.format}
          options={FORMATS}
          onChange={(v) => update((d) => void (d.format = v))}
        />
      </Section>

      <RulesSection draft={draft} update={update} />
    </>
  );
}

function EventChips({ draft, update }: { draft: PlanDraft; update: Update }) {
  const count = (event: EventType) => draft.categories.filter((c) => c.event === event).length;
  return (
    <div className="flex flex-col gap-3">
      {CHIP_GROUPS.map((group) => (
        <div key={group.label} className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-muted-foreground">{group.label}</span>
          <div className="flex flex-wrap gap-2">
            {group.events.map((event) => {
              const n = count(event);
              return (
                <button
                  key={event}
                  type="button"
                  aria-label={`Add a category: ${EVENT_LABELS[event]}${n > 0 ? ` (${n} added)` : ""}`}
                  onClick={() => update((d) => void d.categories.push({ ...emptyCategory(), event }))}
                  className={`inline-flex min-h-8 items-center gap-1.5 rounded-full border px-3 text-sm transition-colors outline-none hover:bg-inset focus-visible:ring-2 focus-visible:ring-ring ${
                    n > 0 ? "border-foreground font-medium" : "border-input text-muted-foreground"
                  }`}
                >
                  <PlusIcon className="size-3.5" />
                  {EVENT_LABELS[event]}
                  {n > 0 ? (
                    <span className="rounded-full bg-foreground px-1.5 text-xs leading-5 text-background tabular-nums">
                      {n}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

const EVENT_OPTIONS = EVENT_TYPES.map((value) => ({ value, label: EVENT_LABELS[value] }));

function RemoveButton({ draft, index, update }: { draft: PlanDraft; index: number; update: Update }) {
  const category = draft.categories[index]!;
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={`Remove ${category.name.trim() || defaultCategoryName(draft, index)}`}
      onClick={() => update((d) => removeCategory(d, category.id))}
    >
      <TrashIcon />
    </Button>
  );
}

function CategoryRow({ draft, index, update }: { draft: PlanDraft; index: number; update: Update }) {
  const category = draft.categories[index]!;
  const set = <K extends keyof CategoryDraft>(key: K) => (value: CategoryDraft[K]) =>
    update((d) => void (d.categories[index]![key] = value));
  if (!category.event) {
    // Drafts from before the event chips may hold a category with no event yet.
    return (
      <li className="flex items-end gap-2">
        <div className="min-w-0 flex-1">
          <SelectField
            label="Event"
            path={["categories", index, "event"]}
            value={category.event}
            options={EVENT_OPTIONS}
            onChange={set("event")}
          />
        </div>
        <RemoveButton draft={draft} index={index} update={update} />
      </li>
    );
  }
  return (
    <li className="flex items-center gap-2" data-path={`categories.${index}.name`}>
      <Badge variant="outline" className="w-28 justify-start">
        {EVENT_LABELS[category.event]}
      </Badge>
      <Input
        aria-label={`Name of the ${EVENT_LABELS[category.event].toLowerCase()} category`}
        className="min-w-0 flex-1"
        placeholder={defaultCategoryName(draft, index)}
        value={category.name}
        onChange={(e) => set("name")(e.target.value)}
      />
      <RemoveButton draft={draft} index={index} update={update} />
    </li>
  );
}

/** "Squad: 7 players (3 men's singles × 1 + 2 men's doubles × 2)". */
function squadLine(category: CategoryDraft): string | null {
  const used = EVENT_TYPES.filter((e) => (category.lineUp[e] ?? 0) > 0);
  if (used.length === 0) return null;
  const squad = used.reduce((sum, e) => sum + category.lineUp[e]! * playersPerEntry(e), 0);
  const parts = used.map((e) => `${category.lineUp[e]} ${EVENT_LABELS[e].toLowerCase()} × ${playersPerEntry(e)}`);
  return `Squad: ${squad} players (${parts.join(" + ")})`;
}

function CompetitionCard({ draft, index, update }: { draft: PlanDraft; index: number; update: Update }) {
  const category = draft.categories[index]!;
  const squad = squadLine(category);
  return (
    <li className="flex flex-col gap-3 rounded-lg bg-inset p-3.5">
      <div className="flex items-end gap-2">
        <div className="min-w-0 flex-1">
          <TextField
            label="Competition name"
            placeholder="e.g. Club team cup"
            path={["categories", index, "name"]}
            value={category.name}
            onChange={(v) => update((d) => void (d.categories[index]!.name = v))}
          />
        </div>
        <RemoveButton draft={draft} index={index} update={update} />
      </div>
      <fieldset className="flex flex-col gap-2" data-path={`categories.${index}.lineUp`}>
        <legend className="flex items-center gap-1 text-sm font-medium">
          Line-up of a tie
          <InfoTip about="the line-up">
            Rubbers of each event in every tie. All rubbers are played; the team that wins the most rubbers wins the
            tie. Each player plays one rubber, so the line-up sets the squad.
          </InfoTip>
        </legend>
        <div className="grid grid-cols-2 gap-3 @md:grid-cols-3">
          {EVENT_TYPES.map((event) => (
            <StepperField
              key={event}
              label={EVENT_LABELS[event]}
              path={["categories", index, "lineUp", event]}
              value={category.lineUp[event]}
              onChange={(v) => update((d) => void (d.categories[index]!.lineUp[event] = v))}
            />
          ))}
        </div>
        {squad ? <p className="text-sm tabular-nums">{squad}</p> : null}
      </fieldset>
    </li>
  );
}
