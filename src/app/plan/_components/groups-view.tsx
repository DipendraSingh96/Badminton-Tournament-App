"use client";

import { InfoIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { groupLetter } from "@/engine";
import { entryName, type CategoryDraft, type PlanDraft } from "@/lib/tournament/draft";
import { categoryFormatOf } from "@/lib/tournament/entries";
import { TIEBREAK_LABELS } from "@/lib/tournament/events";
import { cn } from "@/lib/utils";
import { CategoryTabs } from "./category-tabs";
import { categoryName } from "./labels";

/**
 * The Draw stage's Groups view: a standings table per group, in the
 * configured tiebreak order, with the qualifying line. Before Live records
 * results every table is at zero, in draw order, and everyone is in contention.
 */
export function GroupsView({ draft }: { draft: PlanDraft }) {
  const [categoryId, setCategoryId] = useState<string | null>(draft.categories[0]?.id ?? null);
  const category = draft.categories.find((c) => c.id === categoryId) ?? draft.categories[0];
  if (!category) return <p className="text-sm text-muted-foreground">Add categories on the Plan stage first.</p>;
  return (
    <div className="flex flex-col gap-4">
      <CategoryTabs
        draft={draft}
        value={category.id}
        onChange={setCategoryId}
        count={(id) => draft.draw[id]?.groups.length ?? 0}
      />
      <CategoryGroups key={category.id} draft={draft} category={category} />
    </div>
  );
}

function CategoryGroups({ draft, category }: { draft: PlanDraft; category: CategoryDraft }) {
  const draw = draft.draw[category.id];
  const format = categoryFormatOf(draft, category);
  const byId = new Map(draft.entries.map((e) => [e.id, e]));
  const qualify = draft.format === "groupsKnockout" ? (category.qualifiersPerGroup ?? 0) : 0;
  const tiebreaks = draft.rules.tiebreaks;

  if (draft.format === "knockout") {
    return <p className="rounded-lg bg-inset p-4 text-sm text-muted-foreground">This category is knockout only: see the Bracket view.</p>;
  }
  if (!draw) {
    return (
      <p className="rounded-lg bg-inset p-4 text-sm text-muted-foreground">
        {format.ok ? "No draw yet: make it on the Draw view." : format.message}
      </p>
    );
  }

  return (
    <section aria-label={`${categoryName(draft, category.id)} groups`} className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="heading-card">{categoryName(draft, category.id)}</h2>
          <p className="text-sm text-muted-foreground">
            {draw.groups.length} groups
            {qualify > 0 ? ` · top ${qualify} of each go through` : ""} · ranked by{" "}
            {tiebreaks.length > 0 ? tiebreaks.map((t) => TIEBREAK_LABELS[t].toLowerCase()).join(", then ") : "no tiebreaks set"}
          </p>
        </div>
        <label
          className="flex items-center gap-2 text-sm text-muted-foreground"
          title="Previews who would go into each knockout place; it shows once results come in with Live mode."
        >
          <Switch disabled checked={false} />
          If it ended now
        </label>
      </div>
      <p className="flex items-start gap-2 rounded-lg bg-inset p-3 text-sm">
        <InfoIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        No results yet: tables are in draw order at zero, and everyone is in contention. They fill in as scores arrive in
        Live mode.
      </p>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(24rem,1fr))] gap-4">
        {draw.groups.map((group, g) => (
          <div key={g} className="flex flex-col gap-2 rounded-lg bg-inset p-3">
            <h3 className="text-sm font-semibold">Group {groupLetter(g)}</h3>
            <table className="w-full text-sm tabular-nums">
              <caption className="sr-only">
                Group {groupLetter(g)} standings{qualify > 0 ? `; the top ${qualify} go through` : ""}
              </caption>
              <thead>
                <tr className="text-xs text-muted-foreground">
                  <th scope="col" className="w-8 pb-1 text-left font-semibold">
                    #
                  </th>
                  <th scope="col" className="pb-1 text-left font-semibold">
                    {draft.unit === "team" ? "Team" : "Entry"}
                  </th>
                  <th scope="col" className="w-10 pb-1 text-right font-semibold" title="Ties played">
                    P
                  </th>
                  <th scope="col" className="w-10 pb-1 text-right font-semibold" title="Won">
                    W
                  </th>
                  <th scope="col" className="w-10 pb-1 text-right font-semibold" title="Lost">
                    L
                  </th>
                  {tiebreaks
                    .filter((t) => t !== "matchesWon" && t !== "drawOfLots" && t !== "headToHead")
                    .map((t) => (
                      <th key={t} scope="col" className="w-12 pb-1 text-right font-semibold" title={TIEBREAK_LABELS[t]}>
                        {TIEBREAK_LABELS[t].replace(/ \(.*\)/, "").split(" ").map((w) => w[0]!.toUpperCase()).join("")}
                      </th>
                    ))}
                  <th scope="col" className="w-28 pb-1 text-right font-semibold">
                    <span className="sr-only">Status</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {group.map((id, p) => {
                  const entry = byId.get(id);
                  // The qualifying line sits under the last place that goes through.
                  const cut = qualify > 0 && p === qualify - 1 && p < group.length - 1;
                  return (
                    <tr key={id} className={cn("border-t border-border/60", cut && "border-b-2 border-b-turf border-dashed")}>
                      <td className="py-2 text-muted-foreground">{p + 1}</td>
                      <td className="max-w-0 truncate py-2 font-medium" title={entry ? (entryName(entry) ?? undefined) : undefined}>
                        {(entry && entryName(entry)) ?? "Unnamed entry"}
                      </td>
                      <td className="py-2 text-right">0</td>
                      <td className="py-2 text-right">0</td>
                      <td className="py-2 text-right">0</td>
                      {tiebreaks
                        .filter((t) => t !== "matchesWon" && t !== "drawOfLots" && t !== "headToHead")
                        .map((t) => (
                          <td key={t} className="py-2 text-right">
                            0
                          </td>
                        ))}
                      <td className="py-2 text-right">
                        <Badge variant="off">In contention</Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {qualify > 0 ? (
              <p className="text-xs text-muted-foreground">Above the dashed line: through to the knockout.</p>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}
