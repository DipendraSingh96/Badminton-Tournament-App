"use client";

import {
  CaretDownIcon,
  CheckCircleIcon,
  ClipboardTextIcon,
  FileArrowUpIcon,
  PlusIcon,
  TrashIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import { useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { entriesFromRows, parseDelimited } from "@/lib/tournament/csv";
import {
  emptyEntry,
  emptyPlayer,
  type CategoryDraft,
  type EntryDraft,
  type PlanDraft,
} from "@/lib/tournament/draft";
import { importedEntries, lineUpComplete, playersFor, repeatedSeeds, rubbersOf } from "@/lib/tournament/entries";
import { EVENT_LABELS } from "@/lib/tournament/events";
import { cn } from "@/lib/utils";
import { CategoryTabs } from "./category-tabs";
import { IconButton, ReadOnly } from "./fields";
import { categoryName, entryNoun } from "./labels";
import type { Update } from "./plan-editor";

/** Rows read from pasted text or a CSV file, waiting to be added. */
interface Pending {
  source: "paste" | "file";
  text: string;
}

/**
 * The Draw stage's Entries view: who entered each category. Typed in, pasted
 * from a spreadsheet, or imported from CSV; teams also set their squad and
 * who plays each rubber (fixed for the day).
 */
export function EntriesView({ draft, update, locked }: { draft: PlanDraft; update: Update; locked: boolean }) {
  const [categoryId, setCategoryId] = useState<string | null>(draft.categories[0]?.id ?? null);
  const category = draft.categories.find((c) => c.id === categoryId) ?? draft.categories[0];
  if (!category) {
    return <p className="text-sm text-muted-foreground">Add categories on the Plan stage first.</p>;
  }
  return (
    <div className="flex flex-col gap-4">
      <CategoryTabs
        draft={draft}
        value={category.id}
        onChange={setCategoryId}
        count={(id) => draft.entries.filter((e) => e.categoryId === id).length}
      />
      <ReadOnly when={locked}>
        <CategoryEntries key={category.id} draft={draft} category={category} update={update} />
      </ReadOnly>
    </div>
  );
}

function CategoryEntries({ draft, category, update }: { draft: PlanDraft; category: CategoryDraft; update: Update }) {
  const entries = draft.entries.filter((e) => e.categoryId === category.id);
  const team = draft.unit === "team";
  const nouns = entryNoun(draft.unit, category.event, true);
  const external = entries.filter((e) => e.external).length;
  const repeated = repeatedSeeds(entries);
  const [pending, setPending] = useState<Pending | null>(null);
  const file = useRef<HTMLInputElement>(null);

  return (
    <section aria-label={`${categoryName(draft, category.id)} entries`} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="heading-card">{categoryName(draft, category.id)}</h2>
          <p className="text-sm text-muted-foreground tabular-nums">
            {entries.length} of {category.expectedEntries ?? "?"} expected {nouns} · {external} external
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setPending({ source: "paste", text: "" })}>
            <ClipboardTextIcon /> Paste rows
          </Button>
          <Button variant="outline" onClick={() => file.current?.click()}>
            <FileArrowUpIcon /> Import CSV
          </Button>
          <input
            ref={file}
            type="file"
            accept=".csv,text/csv,text/plain"
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
            onChange={async (e) => {
              const chosen = e.target.files?.[0];
              e.target.value = "";
              if (chosen) setPending({ source: "file", text: await chosen.text() });
            }}
          />
          <Button
            onClick={() => update((d) => void d.entries.push(emptyEntry(category.id, playersFor(d, category))))}
          >
            <PlusIcon /> Add {entryNoun(draft.unit, category.event)}
          </Button>
        </div>
      </div>

      {pending ? (
        <ImportPanel
          draft={draft}
          category={category}
          pending={pending}
          onChange={(text) => setPending({ ...pending, text })}
          onCancel={() => setPending(null)}
          onAdd={(added) => {
            update((d) => void d.entries.push(...added));
            setPending(null);
          }}
        />
      ) : null}

      {entries.length === 0 ? (
        <p className="rounded-lg bg-inset p-4 text-sm text-muted-foreground">
          No {nouns} yet. Add them one by one, paste rows from a spreadsheet, or import a CSV file.
        </p>
      ) : (
        <div role="table" aria-label={`${categoryName(draft, category.id)} entries`} className="flex flex-col">
          <div
            role="row"
            className={cn(
              "grid items-center gap-2 border-b px-2 pb-2 text-xs font-semibold text-muted-foreground",
              team ? "grid-cols-[2rem_minmax(0,1fr)_minmax(0,1fr)_5rem_4.5rem_2rem]" : "grid-cols-[2rem_minmax(0,1fr)_minmax(0,2fr)_5rem_4.5rem_2rem]",
            )}
          >
            <span role="columnheader">#</span>
            <span role="columnheader">{team ? "Team name" : "Name (optional)"}</span>
            <span role="columnheader">{team ? "Squad and line-up" : "Players"}</span>
            <span role="columnheader">External</span>
            <span role="columnheader">Seed</span>
            <span role="columnheader">
              <span className="sr-only">Remove</span>
            </span>
          </div>
          {entries.map((entry, i) => (
            <EntryRow
              key={entry.id}
              draft={draft}
              category={category}
              entry={entry}
              index={i}
              repeatedSeed={entry.seed !== null && repeated.has(entry.seed)}
              update={update}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function ImportPanel({
  draft,
  category,
  pending,
  onChange,
  onCancel,
  onAdd,
}: {
  draft: PlanDraft;
  category: CategoryDraft;
  pending: Pending;
  onChange: (text: string) => void;
  onCancel: () => void;
  onAdd: (entries: EntryDraft[]) => void;
}) {
  // Rows go into the category on screen unless they name another one.
  const categories = [
    { id: category.id, name: categoryName(draft, category.id) },
    ...draft.categories.filter((c) => c.id !== category.id).map((c) => ({ id: c.id, name: categoryName(draft, c.id) })),
  ];
  const rows = parseDelimited(pending.text);
  const { entries, problems } = entriesFromRows(rows, draft.categories.length === 1 ? [categories[0]!] : categories);
  const noun = entryNoun(draft.unit, category.event, entries.length !== 1);
  return (
    <div className="flex flex-col gap-3 rounded-lg bg-inset p-3">
      <p className="text-sm">
        {pending.source === "paste" ? "Paste rows from a spreadsheet" : "Rows from the CSV file"}: a heading row with{" "}
        <span className="font-semibold">Category, Name, Player 1, Player 2…, External, Seed</span> (any order, any
        left out), or just name then players.
      </p>
      <textarea
        aria-label="Rows to add"
        value={pending.text}
        onChange={(e) => onChange(e.target.value)}
        rows={6}
        placeholder={"Name\tPlayer 1\tPlayer 2\nSmashers\tAnn Lee\tRaj Shah"}
        className="w-full rounded-md border border-input bg-card px-3 py-2 font-mono text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring"
      />
      {problems.length > 0 ? (
        <ul className="flex flex-col gap-1 text-sm text-over-text">
          {problems.slice(0, 5).map((p) => (
            <li key={p} className="flex items-start gap-2">
              <WarningCircleIcon weight="fill" className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              {p}
            </li>
          ))}
          {problems.length > 5 ? <li className="pl-6">and {problems.length - 5} more</li> : null}
        </ul>
      ) : null}
      <div className="flex items-center justify-end gap-2">
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button disabled={entries.length === 0} onClick={() => onAdd(importedEntries(draft, entries))}>
          Add {entries.length} {noun}
        </Button>
      </div>
    </div>
  );
}

function EntryRow({
  draft,
  category,
  entry,
  index,
  repeatedSeed,
  update,
}: {
  draft: PlanDraft;
  category: CategoryDraft;
  entry: EntryDraft;
  index: number;
  repeatedSeed: boolean;
  update: Update;
}) {
  const team = draft.unit === "team";
  const [open, setOpen] = useState(false);
  const edit = (recipe: (e: EntryDraft) => void) =>
    update((d) => {
      const target = d.entries.find((e) => e.id === entry.id);
      if (target) recipe(target);
    });
  const label = (what: string) => `${what}, ${team ? "team" : "entry"} ${index + 1}`;
  const complete = lineUpComplete(draft, entry, category);
  const named = entry.players.filter((p) => p.name.trim()).length;

  return (
    <div role="row" className="flex flex-col border-b py-2 last:border-b-0">
      <div
        className={cn(
          "grid items-center gap-2 px-2",
          team ? "grid-cols-[2rem_minmax(0,1fr)_minmax(0,1fr)_5rem_4.5rem_2rem]" : "grid-cols-[2rem_minmax(0,1fr)_minmax(0,2fr)_5rem_4.5rem_2rem]",
        )}
      >
        <span role="cell" className="text-sm text-muted-foreground tabular-nums">
          {index + 1}
        </span>
        <span role="cell">
          <Input
            aria-label={label(team ? "Team name" : "Name")}
            value={entry.name}
            placeholder={team ? "Team name" : "Optional"}
            onChange={(e) => edit((x) => void (x.name = e.target.value))}
          />
        </span>
        <span role="cell" className="min-w-0">
          {team ? (
            <button
              type="button"
              aria-expanded={open}
              onClick={() => setOpen(!open)}
              className="flex h-8 w-full items-center justify-between gap-2 rounded-md px-2 text-left text-sm outline-none hover:bg-inset focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="flex min-w-0 items-center gap-2">
                <span className="truncate tabular-nums">
                  {named} {named === 1 ? "player" : "players"}
                </span>
                {complete ? (
                  <Badge variant="fits">
                    <CheckCircleIcon weight="fill" /> Line-up set
                  </Badge>
                ) : (
                  <Badge variant="tight">Line-up to set</Badge>
                )}
              </span>
              <CaretDownIcon weight="bold" className={cn("size-4 shrink-0 transition-transform", open && "rotate-180")} />
            </button>
          ) : (
            <span className="flex gap-2">
              {entry.players.map((player, p) => (
                <Input
                  key={player.id}
                  aria-label={label(`Player ${p + 1}`)}
                  value={player.name}
                  placeholder={`Player ${p + 1}`}
                  onChange={(e) => edit((x) => void (x.players[p]!.name = e.target.value))}
                />
              ))}
            </span>
          )}
        </span>
        <span role="cell" className="flex justify-center">
          <Checkbox
            aria-label={label("External")}
            checked={entry.external}
            onCheckedChange={(on) => edit((x) => void (x.external = on))}
          />
        </span>
        <span role="cell">
          <Input
            aria-label={label("Seed")}
            aria-invalid={repeatedSeed || undefined}
            title={repeatedSeed ? "Another entry has this seed" : undefined}
            type="number"
            inputMode="numeric"
            min={1}
            value={entry.seed ?? ""}
            placeholder="–"
            onChange={(e) => {
              const n = e.target.value === "" ? null : Math.max(1, Math.round(Number(e.target.value)));
              edit((x) => void (x.seed = n === null || Number.isNaN(n) ? null : n));
            }}
            className="text-center"
          />
        </span>
        <span role="cell">
          <IconButton label={label("Remove")} onClick={() => update((d) => void (d.entries = d.entries.filter((e) => e.id !== entry.id)))}>
            <TrashIcon />
          </IconButton>
        </span>
      </div>
      {team && open ? <TeamDetails draft={draft} category={category} entry={entry} edit={edit} /> : null}
    </div>
  );
}

/** A team's squad, and who plays each rubber (fixed for the day). */
function TeamDetails({
  category,
  entry,
  edit,
}: {
  draft: PlanDraft;
  category: CategoryDraft;
  entry: EntryDraft;
  edit: (recipe: (e: EntryDraft) => void) => void;
}) {
  const rubbers = rubbersOf(category);
  return (
    <div className="mt-2 ml-10 grid grid-cols-1 gap-4 rounded-lg bg-inset p-3 md:grid-cols-2">
      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold text-muted-foreground">Squad</h3>
        {entry.players.map((player, p) => (
          <div key={player.id} className="flex items-center gap-2">
            <Input
              aria-label={`Squad player ${p + 1}`}
              value={player.name}
              placeholder={`Player ${p + 1}`}
              onChange={(e) => edit((x) => void (x.players[p]!.name = e.target.value))}
            />
            <IconButton
              label={`Remove squad player ${p + 1}`}
              disabled={entry.players.length === 1}
              onClick={() =>
                edit((x) => {
                  x.players.splice(p, 1);
                  for (const key of Object.keys(x.lineUp)) x.lineUp[key] = x.lineUp[key]!.filter((id) => id !== player.id);
                })
              }
            >
              <TrashIcon />
            </IconButton>
          </div>
        ))}
        <Button variant="outline" size="sm" className="self-start" onClick={() => edit((x) => void x.players.push(emptyPlayer()))}>
          <PlusIcon /> Add player
        </Button>
      </div>
      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold text-muted-foreground">Line-up, for every tie</h3>
        {rubbers.map((rubber) => {
          const chosen = entry.lineUp[String(rubber.number)] ?? [];
          return (
            <div key={rubber.number} className="flex flex-col gap-1">
              <span className="text-sm">
                Rubber {rubber.number} · {EVENT_LABELS[rubber.event]}
              </span>
              <div className="grid grid-cols-2 gap-2">
                {Array.from({ length: rubber.players }, (_, slot) => (
                  <NativeSelect
                    key={slot}
                    className="w-full"
                    aria-label={`Rubber ${rubber.number}, player ${slot + 1}`}
                    value={chosen[slot] ?? ""}
                    onChange={(e) =>
                      edit((x) => {
                        const list = [...(x.lineUp[String(rubber.number)] ?? [])];
                        list[slot] = e.target.value;
                        x.lineUp[String(rubber.number)] = list.filter((id, k) => id && list.indexOf(id) === k);
                      })
                    }
                  >
                    <NativeSelectOption value="">Choose…</NativeSelectOption>
                    {entry.players
                      .filter((p) => p.name.trim())
                      .map((p) => (
                        <NativeSelectOption key={p.id} value={p.id}>
                          {p.name}
                        </NativeSelectOption>
                      ))}
                  </NativeSelect>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
