"use client";

import { EraserIcon, MagicWandIcon, PlayCircleIcon, StopCircleIcon } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { IconButton } from "./fields";

/**
 * The stage's sample-data buttons, at the right end of the stage row: fill
 * the stage with sample data, or remove its sample data. Unavailable buttons
 * stay focusable so their tooltip can say why.
 */
export function SampleDataButtons({
  fill,
  remove,
}: {
  /** What filling does on this stage, or why it can't (then `onFill` is null). */
  fill: { label: string; onFill: (() => void) | null };
  /** What removing does on this stage, or that there's nothing to remove (then `onRemove` is null). */
  remove: { label: string; onRemove: (() => void) | null };
}) {
  const off = "opacity-50 cursor-not-allowed hover:bg-transparent";
  return (
    <>
      <IconButton
        label={fill.label}
        side="bottom"
        className={cn(!fill.onFill && off)}
        aria-disabled={!fill.onFill}
        onClick={() => fill.onFill?.()}
      >
        <MagicWandIcon />
      </IconButton>
      <IconButton
        label={remove.label}
        side="bottom"
        className={cn(!remove.onRemove && off)}
        aria-disabled={!remove.onRemove}
        onClick={() => remove.onRemove?.()}
      >
        <EraserIcon />
      </IconButton>
    </>
  );
}

/**
 * Developer tools: runs a simulated day on the Live stage, or ends the one
 * running. It sits where the sample-data buttons are on Plan and Draw.
 */
export function SimulationButton({ running, blocked, onRun, onEnd }: { running: boolean; blocked: string | null; onRun: () => void; onEnd: () => void }) {
  const off = "opacity-50 cursor-not-allowed hover:bg-transparent";
  return running ? (
    <IconButton label="End simulation: the tournament goes back to how it was" side="bottom" onClick={onEnd}>
      <StopCircleIcon />
    </IconButton>
  ) : (
    <IconButton
      label={blocked ? `Run simulation: ${blocked}` : "Run simulation: plays the whole day through, to watch. Nothing is saved"}
      side="bottom"
      className={cn(blocked && off)}
      aria-disabled={blocked !== null}
      onClick={() => (blocked ? undefined : onRun())}
    >
      <PlayCircleIcon />
    </IconButton>
  );
}
