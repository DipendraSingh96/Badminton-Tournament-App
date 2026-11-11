"use client";

import { ArrowsLeftRightIcon, LockSimpleIcon, LockSimpleOpenIcon, ShuffleIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { useContext, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { groupLetter, makeDraw } from "@/engine";
import { entryName, type CategoryDraft, type PlanDraft } from "@/lib/tournament/draft";
import { drawSizes, drawStale, lineUpComplete, swapDrawn } from "@/lib/tournament/entries";
import { cn } from "@/lib/utils";
import { CategoryTabs } from "./category-tabs";
import { TeamOpenContext } from "./draw-panel";
import { categoryName, entryNoun } from "./labels";
import type { Update } from "./plan-editor";

/** A new number for the random part of a draw. */
function newRandomSeed(): number {
  return Math.floor(Math.random() * 2 ** 31);
}

/**
 * The Draw stage's Draw view: make each category's draw (seeds spread across
 * the groups, the rest at random), swap any two entries by dragging one onto
 * the other, redraw, and lock it when it's final. A click on an entry opens
 * it in the side panel (where it can also be swapped, without a pointer).
 */
export function DrawView({ draft, update }: { draft: PlanDraft; update: Update }) {
  const [categoryId, setCategoryId] = useState<string | null>(draft.categories[0]?.id ?? null);
  const category = draft.categories.find((c) => c.id === categoryId) ?? draft.categories[0];
  if (!category) return <p className="text-sm text-muted-foreground">Add categories on the Plan stage first.</p>;
  return (
    <div className="flex flex-col gap-4">
      <CategoryTabs
        draft={draft}
        value={category.id}
        onChange={setCategoryId}
        count={(id) => (draft.draw[id]?.locked ? "Locked" : draft.draw[id] ? "Drawn" : "Not drawn")}
      />
      <CategoryDraw key={category.id} draft={draft} category={category} update={update} />
    </div>
  );
}

function CategoryDraw({ draft, category, update }: { draft: PlanDraft; category: CategoryDraft; update: Update }) {
  const draw = draft.draw[category.id];
  const sizes = drawSizes(draft, category);
  const stale = drawStale(draft, category);
  const knockout = draft.format === "knockout";
  const entries = draft.entries.filter((e) => e.categoryId === category.id);
  const byId = new Map(entries.map((e) => [e.id, e]));
  const incomplete = entries.filter((e) => !lineUpComplete(draft, e, category)).length;
  // Dragging an entry onto another swaps the two: the one held, and the one it's over.
  const [held, setHeld] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const openTeam = useContext(TeamOpenContext);

  function makeIt(seed: number) {
    if (!sizes.ok) return;
    const result = makeDraw(
      entries.map((e) => ({ id: e.id, seed: e.seed })),
      sizes.sizes,
      seed,
    );
    if (!result.ok) return;
    update((d) => void (d.draw[category.id] = { groups: result.groups, randomSeed: seed, locked: false }));
  }

  const status = draw?.locked ? (
    <Badge variant="live">
      <LockSimpleIcon weight="bold" /> Locked
    </Badge>
  ) : draw && !stale ? (
    <Badge variant="tight">Not locked</Badge>
  ) : null;

  return (
    <section aria-label={`${categoryName(draft, category.id)} draw`} className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <h2 className="heading-card">{categoryName(draft, category.id)}</h2>
            {status}
          </div>
          <p className="text-sm text-muted-foreground tabular-nums">
            {sizes.ok
              ? knockout
                ? `${entries.length} ${entryNoun(draft.unit, category.event, true)}, knockout in seed order`
                : `${entries.length} ${entryNoun(draft.unit, category.event, true)} in ${sizes.sizes.length} groups (${[...new Set(sizes.sizes)].join(" or ")} each)`
              : sizes.message}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {draw?.locked ? (
            <Button
              variant="outline"
              // Live: the draw stays as it is.
              disabled={draft.stage !== "draw"}
              title={draft.stage !== "draw" ? "The tournament is Live: the draw stays locked." : undefined}
              onClick={() => update((d) => void (d.draw[category.id]!.locked = false))}
            >
              <LockSimpleOpenIcon /> Unlock
            </Button>
          ) : draw && !stale ? (
            <>
              <Button variant="outline" onClick={() => makeIt(newRandomSeed())}>
                <ShuffleIcon /> Redraw
              </Button>
              <Button onClick={() => update((d) => void (d.draw[category.id]!.locked = true))}>
                <LockSimpleIcon /> Lock draw
              </Button>
            </>
          ) : (
            <Button disabled={!sizes.ok} onClick={() => makeIt(newRandomSeed())}>
              <ShuffleIcon /> {draw ? "Make the draw again" : "Make the draw"}
            </Button>
          )}
        </div>
      </div>

      {stale && draw ? (
        <p className="flex items-start gap-2 rounded-lg bg-card-system p-3 text-sm">
          <WarningCircleIcon weight="fill" className="mt-0.5 size-4 shrink-0 text-tight-text" aria-hidden="true" />
          The entries or group sizes changed since this draw was made. Make the draw again before locking it.
        </p>
      ) : null}
      {incomplete > 0 ? (
        <p className="flex items-start gap-2 text-sm text-tight-text">
          <WarningCircleIcon weight="fill" className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {incomplete} {incomplete === 1 ? "team's" : "teams'"} line-up still to set on the Entries page.
        </p>
      ) : null}

      {draw && !stale ? (
        <>
          {!draw.locked ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <ArrowsLeftRightIcon className="size-4 shrink-0" aria-hidden="true" />
              Drag an entry onto another to swap them.
            </p>
          ) : null}
          <div className={cn("grid gap-3", knockout ? "grid-cols-1" : "grid-cols-[repeat(auto-fit,minmax(160px,1fr))]")}>
            {draw.groups.map((group, g) => (
              <div key={g} className="flex flex-col gap-2 rounded-lg bg-card-system p-3">
                <h3 className="text-sm font-semibold">{knockout ? "Seed order" : `Group ${groupLetter(g)}`}</h3>
                <ol className={cn("flex flex-col gap-1", knockout && "sm:grid sm:grid-cols-2 sm:gap-x-3")}>
                  {group.map((id, p) => {
                    const entry = byId.get(id);
                    const slot = knockout ? `Seed ${p + 1}` : `${groupLetter(g)}${p + 1}`;
                    const name = (entry && entryName(entry)) ?? "Unnamed entry";
                    return (
                      <li key={id}>
                        <div
                          role="button"
                          tabIndex={0}
                          draggable={!draw.locked}
                          title={`${slot} · ${name}${entry?.seed ? ` · seed ${entry.seed}` : ""}${entry?.external ? " · external" : ""}`}
                          aria-label={`${slot}: ${name}${entry?.seed ? `, seed ${entry.seed}` : ""}. Open${draw.locked ? "" : "; drag onto another entry to swap"}`}
                          onClick={() => openTeam?.(id)}
                          onKeyDown={(event) => {
                            if (event.key !== "Enter" && event.key !== " ") return;
                            event.preventDefault();
                            openTeam?.(id);
                          }}
                          onDragStart={(event) => {
                            event.dataTransfer.effectAllowed = "move";
                            event.dataTransfer.setData("text/plain", id);
                            setHeld(id);
                          }}
                          onDragEnd={() => {
                            setHeld(null);
                            setOver(null);
                          }}
                          onDragOver={(event) => {
                            if (!held || held === id) return;
                            event.preventDefault();
                            event.dataTransfer.dropEffect = "move";
                            if (over !== id) setOver(id);
                          }}
                          onDragLeave={() => over === id && setOver(null)}
                          onDrop={(event) => {
                            event.preventDefault();
                            const from = held;
                            setHeld(null);
                            setOver(null);
                            if (from && from !== id) update((d) => swapDrawn(d, category.id, from, id));
                          }}
                          className={cn(
                            "flex h-8 w-full items-center gap-2 rounded-md border bg-card px-2 text-left text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
                            draw.locked ? "cursor-pointer" : "cursor-grab active:cursor-grabbing",
                            held === id
                              ? "border-primary ring-1 ring-primary"
                              : over === id
                                ? "border-dashed border-primary bg-card-selected"
                                : "border-transparent hover:border-border",
                          )}
                        >
                          <span className="w-6 shrink-0 text-xs font-semibold text-muted-foreground tabular-nums">{slot}</span>
                          <span className="min-w-0 flex-1 truncate">{name}</span>
                          {/* Seeds as draw sheets show them: the number in brackets after the name. */}
                          {entry?.seed ? (
                            <span className="shrink-0 text-xs font-semibold text-muted-foreground tabular-nums">({entry.seed})</span>
                          ) : null}
                          {entry?.external ? <Badge variant="outline">Ext</Badge> : null}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </div>
            ))}
          </div>
        </>
      ) : !draw && sizes.ok ? (
        <p className="rounded-lg bg-card-system p-4 text-sm text-muted-foreground">
          No draw yet. Seeds go first, one per group (top seeds kept apart); everyone else is drawn at random. You can
          swap any two entries afterwards, then lock the draw.
        </p>
      ) : null}
    </section>
  );
}
