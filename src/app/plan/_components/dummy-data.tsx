"use client";

import { EraserIcon, MagicWandIcon } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { IconButton } from "./fields";

/**
 * The top bar's dummy-data buttons: fill the page open with dummy data, or
 * remove all of it. Unavailable buttons stay focusable so their tooltip can
 * say why.
 */
export function DummyDataButtons({
  fill,
  remove,
}: {
  /** The open page's fill: what it fills, or why it can't. */
  fill: { label: string; onFill: (() => void) | null };
  /** The dummy data there is ("16 entries, 30 other values"), or null when there's none. */
  remove: { summary: string | null; onRemove: () => void };
}) {
  const off = "opacity-50 cursor-not-allowed hover:bg-transparent";
  return (
    <>
      <span className="mx-1 h-6 w-px bg-border" aria-hidden="true" />
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
        label={remove.summary ? `Remove dummy data: ${remove.summary}` : "No dummy data to remove"}
        side="bottom"
        variant="outline"
        className={cn("rounded-full", !remove.summary && off)}
        aria-disabled={!remove.summary}
        onClick={() => {
          if (remove.summary) remove.onRemove();
        }}
      >
        <EraserIcon />
      </IconButton>
    </>
  );
}
