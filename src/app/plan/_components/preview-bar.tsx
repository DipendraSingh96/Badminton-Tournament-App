"use client";

import { CheckIcon, EyeIcon, XIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import type { LeverChange, TournamentInputs } from "@/engine";
import type { PlanDraft } from "@/lib/tournament/draft";
import { leverLabel } from "./workings";

/**
 * Shown while a suggested lever is previewed: the summary, timeline and venue
 * show the plan with it. Keep makes the change to the input; Discard (or Esc,
 * or editing anything) leaves the plan as it was.
 */
export function PreviewBar({
  change,
  inputs,
  draft,
  onKeep,
  onDiscard,
}: {
  change: LeverChange;
  inputs: TournamentInputs;
  draft: PlanDraft;
  onKeep: () => void;
  onDiscard: () => void;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex shrink-0 flex-col gap-2.5 border-b border-tight bg-[color-mix(in_srgb,var(--status-tight)_14%,var(--card))] px-4 py-3"
    >
      <p className="flex items-start gap-2 text-[15px]">
        <EyeIcon weight="bold" className="mt-0.5 size-[18px] shrink-0 text-tight-text" aria-hidden="true" />
        <span>
          <span className="font-semibold">Previewing:</span> {leverLabel(change, inputs, draft)}
        </span>
      </p>
      <div className="flex gap-2">
        <Button size="sm" onClick={onKeep}>
          <CheckIcon /> Keep
        </Button>
        <Button size="sm" variant="outline" onClick={onDiscard}>
          <XIcon /> Discard
        </Button>
      </div>
    </div>
  );
}
