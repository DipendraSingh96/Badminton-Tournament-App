"use client";

import { EraserIcon, MagicWandIcon } from "@phosphor-icons/react";
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
        variant="outline"
        className={cn("rounded-full", !fill.onFill && off)}
        aria-disabled={!fill.onFill}
        onClick={() => fill.onFill?.()}
      >
        <MagicWandIcon />
      </IconButton>
      <IconButton
        label={remove.label}
        side="bottom"
        variant="outline"
        className={cn("rounded-full", !remove.onRemove && off)}
        aria-disabled={!remove.onRemove}
        onClick={() => remove.onRemove?.()}
      >
        <EraserIcon />
      </IconButton>
    </>
  );
}
