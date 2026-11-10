"use client";

import { LockSimpleIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";

/**
 * At the top of the workbench while the draw is locked: the structure is
 * read-only until the draw is unlocked.
 */
export function StageBar({ onUnlock }: { onUnlock: () => void }) {
  return (
    <div role="status" className="flex shrink-0 items-center gap-3 rounded-lg bg-card-system px-3 py-2">
      <LockSimpleIcon weight="bold" className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <p className="min-w-0 flex-1 text-sm">
        <span className="font-semibold">Draw locked.</span> Categories, groups, rules and entries are read-only.
      </p>
      <Button size="sm" variant="outline" onClick={onUnlock}>
        Unlock draw
      </Button>
    </div>
  );
}
