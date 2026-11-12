"use client";

import { EraserIcon, MagicWandIcon, PauseIcon, PlayIcon, StopIcon } from "@phosphor-icons/react";
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
 * Developer mode: a simulated day on the Live stage, where the sample-data
 * buttons are on Plan and Draw. Play starts it (or carries on) and becomes
 * Pause while it plays; Stop ends it and puts the tournament back as it was.
 * Green, yellow and red, as the rest of the product's statuses are.
 */
export function SimulationControls({
  state,
  blocked,
  onPlay,
  onPause,
  onStop,
}: {
  /** No simulation; one playing; or one paused (its cursor can still be moved). */
  state: "none" | "playing" | "paused";
  /** Why a simulation can't be run; null when it can. */
  blocked: string | null;
  onPlay: () => void;
  onPause: () => void;
  onStop: () => void;
}) {
  const off = "opacity-50 cursor-not-allowed hover:bg-transparent";
  const stopped = state === "none";
  return (
    <>
      {state === "playing" ? (
        <IconButton label="Pause the simulation: the timeline can still be moved" side="bottom" className="text-tight-text" onClick={onPause}>
          <PauseIcon weight="fill" />
        </IconButton>
      ) : (
        <IconButton
          label={
            blocked && stopped
              ? `Run simulation: ${blocked}`
              : stopped
                ? "Run simulation: plays the whole day through, to watch. Nothing is saved"
                : "Carry on with the simulation"
          }
          side="bottom"
          className={cn("text-fits-text", blocked && stopped && off)}
          aria-disabled={Boolean(blocked) && stopped}
          onClick={() => (blocked && stopped ? undefined : onPlay())}
        >
          <PlayIcon weight="fill" />
        </IconButton>
      )}
      <IconButton
        label={stopped ? "Stop: no simulation is running" : "Stop the simulation: the tournament goes back to how it was"}
        side="bottom"
        className={cn("text-over-text", stopped && off)}
        aria-disabled={stopped}
        onClick={() => (stopped ? undefined : onStop())}
      >
        <StopIcon weight="fill" />
      </IconButton>
    </>
  );
}
