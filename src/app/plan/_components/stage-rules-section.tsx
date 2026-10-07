"use client";

import { CopyIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { STAGES, type Stage } from "@/engine";
import type { PlanDraft, StageRulesDraft } from "@/lib/tournament/draft";
import { FieldGrid, NumberField, Section, SelectField } from "./fields";
import { STAGE_LABELS } from "./labels";
import type { Update } from "./plan-editor";

const DEUCE_RULES = [
  { value: "none", label: "None: first to the target wins" },
  { value: "cap", label: "Hard cap" },
  { value: "standard", label: "Win by two, up to a maximum" },
] as const;

const BEST_OF = [
  { value: 1, label: "Best of 1" },
  { value: 3, label: "Best of 3" },
] as const;

export function StageRulesSection({ draft, update }: { draft: PlanDraft; update: Update }) {
  return (
    <Section
      title="Match rules and timing"
      description="Set per stage. Leave a stage empty if no category plays it."
    >
      {STAGES.map((stage: Stage, i) => {
        const rules = draft.stageRules[stage];
        const set = <K extends keyof StageRulesDraft>(key: K) => (value: StageRulesDraft[K]) =>
          update((d) => void (d.stageRules[stage][key] = value));
        const path = (key: keyof StageRulesDraft) => ["stageRules", stage, key];
        return (
          <div key={stage} className="flex flex-col gap-3">
            {i > 0 ? <Separator /> : null}
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-medium">{STAGE_LABELS[stage]}</h3>
              {stage !== "group" ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    update((d) => void (d.stageRules[stage] = { ...d.stageRules.group }))
                  }
                >
                  <CopyIcon /> Same as group stage
                </Button>
              ) : null}
            </div>
            <FieldGrid>
              <NumberField
                label="Points per game"
                step="1"
                path={path("pointsPerGame")}
                value={rules.pointsPerGame}
                onChange={set("pointsPerGame")}
              />
              <SelectField
                label="Deuce"
                path={path("deuce")}
                value={rules.deuce}
                options={DEUCE_RULES}
                onChange={set("deuce")}
              />
              {rules.deuce === "cap" || rules.deuce === "standard" ? (
                <NumberField
                  label={rules.deuce === "cap" ? "Points cap" : "Maximum points"}
                  step="1"
                  path={path("deuceLimit")}
                  value={rules.deuceLimit}
                  onChange={set("deuceLimit")}
                />
              ) : null}
              <SelectField
                label="Games per match"
                path={path("bestOf")}
                value={rules.bestOf}
                options={BEST_OF}
                onChange={set("bestOf")}
              />
              <NumberField
                label="Minutes per game"
                hint="Typical playing time."
                path={path("minutesPerGame")}
                value={rules.minutesPerGame}
                onChange={set("minutesPerGame")}
              />
              <NumberField
                label="Organising time per match (minutes)"
                hint="Walk-on, warm-up and changeover."
                path={path("changeoverMinutes")}
                value={rules.changeoverMinutes}
                onChange={set("changeoverMinutes")}
              />
            </FieldGrid>
          </div>
        );
      })}
    </Section>
  );
}
