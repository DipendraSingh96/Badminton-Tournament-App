"use client";

import { Separator } from "@/components/ui/separator";
import type { CategoryDraft, PlanDraft } from "@/lib/tournament/draft";
import { FieldGrid, NumberField, Section, SelectField } from "./fields";
import { categoryName, entryNoun } from "./labels";
import type { Update } from "./plan-editor";

/** Each category's entry fee. Interim: the Finance tab is redesigned in step 5. */
export function FeesSection({ draft, update }: { draft: PlanDraft; update: Update }) {
  const { unit } = draft;
  return (
    <Section title="Entry fees" description="Per category. External players can pay a different fee.">
      {!unit || draft.categories.length === 0 ? (
        <p className="text-sm text-muted-foreground">Add categories on the Tournament setup tab first.</p>
      ) : (
        draft.categories.map((category, i) => {
          const set = <K extends keyof CategoryDraft>(key: K) => (value: CategoryDraft[K]) =>
            update((d) => void (d.categories[i]![key] = value));
          const path = (key: keyof CategoryDraft) => ["categories", i, key];
          const noun = entryNoun(unit, category.event);
          return (
            <div key={category.id} className="flex flex-col gap-3">
              {i > 0 ? <Separator /> : null}
              <h3 className="text-sm font-medium">{categoryName(draft, category.id)}</h3>
              <FieldGrid>
                <SelectField
                  label="Charged"
                  path={path("feeBasis")}
                  value={category.feeBasis}
                  options={[
                    { value: "player", label: "Per player" },
                    { value: "entry", label: noun === "entry" ? "Per entry" : `Per ${noun}` },
                  ]}
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
              </FieldGrid>
            </div>
          );
        })
      )}
    </Section>
  );
}
