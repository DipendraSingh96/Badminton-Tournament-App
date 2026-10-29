"use client";

import { LockSimpleIcon, UsersThreeIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";

/**
 * Above the summary while planning once the tournament has moved on to the
 * draw: the plan uses the real entries, and the way back. With the draw
 * locked, the structure is read-only until the draw is unlocked.
 */
export function StageBar({
  locked,
  entries,
  onReopen,
  onUnlock,
}: {
  locked: boolean;
  /** How many entries the plan now uses. */
  entries: number;
  onReopen: () => void;
  onUnlock: () => void;
}) {
  return (
    <div role="status" className="flex shrink-0 items-center gap-3 border-b bg-inset px-4 py-2">
      {locked ? (
        <LockSimpleIcon weight="bold" className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      ) : (
        <UsersThreeIcon weight="bold" className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      )}
      <p className="min-w-0 flex-1 text-sm">
        {locked ? (
          <>
            <span className="font-semibold">Draw locked.</span> Categories, groups, rules and entries are read-only.
          </>
        ) : (
          <>
            <span className="font-semibold">Using real entries.</span> The plan uses the {entries}{" "}
            {entries === 1 ? "entry" : "entries"} entered.
          </>
        )}
      </p>
      <Button size="sm" variant="outline" onClick={locked ? onUnlock : onReopen}>
        {locked ? "Unlock draw" : "Use expected numbers"}
      </Button>
    </div>
  );
}
