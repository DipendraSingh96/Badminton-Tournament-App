"use client";

import type { PlanDraft } from "@/lib/tournament/draft";
import { cn } from "@/lib/utils";
import { categoryName } from "./labels";

/** One tab per category, with a count beside each; hidden when there's only one category. */
export function CategoryTabs({
  draft,
  value,
  onChange,
  count,
}: {
  draft: PlanDraft;
  value: string;
  onChange: (categoryId: string) => void;
  /** The figure beside each category's name. */
  count: (categoryId: string) => string | number;
}) {
  if (draft.categories.length < 2) return null;
  return (
    <div role="tablist" aria-label="Categories" className="flex flex-wrap gap-1 self-start rounded-md bg-inset p-1">
      {draft.categories.map((c) => {
        const selected = c.id === value;
        return (
          <button
            key={c.id}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(c.id)}
            className={cn(
              "flex h-6 items-center gap-2 rounded-sm px-3 text-sm font-semibold transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
              selected ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-card hover:text-foreground",
            )}
          >
            {categoryName(draft, c.id)}
            <span className="tabular-nums opacity-80">{count(c.id)}</span>
          </button>
        );
      })}
    </div>
  );
}
