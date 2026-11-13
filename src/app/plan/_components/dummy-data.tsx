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
 * Developer mode: a simulated day's controls on the Live stage, while one is
 * running. Play carries it on and becomes Pause while it plays; Stop ends it
 * and puts the tournament back as it was. While a court is waiting for the
 * desk the day can't be played on: dealing with the court does that.
 */
export function SimulationControls({
  state,
  waiting,
  onPlay,
  onPause,
  onStop,
}: {
  state: "playing" | "paused";
  /** Stopped for the desk: what it is waiting for, in words. Null when it isn't. */
  waiting: string | null;
  onPlay: () => void;
  onPause: () => void;
  onStop: () => void;
}) {
  return (
    <>
      {state === "playing" ? (
        <IconButton label="Pause the simulation" side="bottom" className="text-tight-text" onClick={onPause}>
          <PauseIcon weight="fill" />
        </IconButton>
      ) : (
        <IconButton
          label={waiting ?? "Carry on with the simulation"}
          side="bottom"
          className={cn("text-fits-text", waiting && "cursor-not-allowed opacity-50 hover:bg-transparent")}
          aria-disabled={Boolean(waiting)}
          onClick={() => (waiting ? undefined : onPlay())}
        >
          <PlayIcon weight="fill" />
        </IconButton>
      )}
      <IconButton label="Stop the simulation: the tournament goes back to how it was" side="bottom" className="text-over-text" onClick={onStop}>
        <StopIcon weight="fill" />
      </IconButton>
    </>
  );
}
