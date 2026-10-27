"use client";

import { PlusIcon, SidebarSimpleIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { PlanDraft } from "@/lib/tournament/draft";
import { IconButton } from "./fields";

function formatDate(iso: string): string {
  if (!iso) return "No date yet";
  const [y, m, d] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" }).format(
    new Date(y!, m! - 1, d!),
  );
}

const LIST_ID = "tournament-list";

/**
 * Left panel. Holds the tournament being planned; the list of previous
 * tournaments and Duplicate arrive with saved tournaments. Collapses to a rail.
 */
export function TournamentList({
  draft,
  onNew,
  collapsed,
  onCollapsedChange,
}: {
  draft: PlanDraft;
  onNew: () => void;
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
}) {
  const name = draft.name.trim() || "Untitled tournament";
  return (
    <aside
      id={LIST_ID}
      aria-label="Tournaments"
      className={`scroll-pane relative flex shrink-0 flex-col overflow-x-hidden overflow-y-auto border-r bg-card transition-[width] duration-200 motion-reduce:transition-none ${
        collapsed ? "w-14 items-center gap-2 py-3" : "w-(--pane-left) gap-4 px-(--pane-x) py-4"
      }`}
    >
      {collapsed ? (
        <>
          <IconButton
            label="Show tournaments"
            side="right"
            aria-expanded={false}
            aria-controls={LIST_ID}
            onClick={() => onCollapsedChange(false)}
          >
            <SidebarSimpleIcon />
          </IconButton>
          <IconButton label="New tournament" side="right" variant="default" onClick={onNew}>
            <PlusIcon />
          </IconButton>
          <Tooltip>
            <TooltipTrigger
              render={
                <span
                  aria-current="true"
                  aria-label={`Current tournament: ${name}`}
                  tabIndex={0}
                  className="mt-1 grid size-9 place-items-center rounded-md border border-tile-border bg-tile font-display text-lg font-bold text-turf uppercase outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              }
            >
              {name.charAt(0)}
            </TooltipTrigger>
            <TooltipContent side="right">{name}</TooltipContent>
          </Tooltip>
        </>
      ) : (
        <>
          <div className="flex items-center gap-2">
            <Button className="flex-1" onClick={onNew}>
              <PlusIcon /> New tournament
            </Button>
            <IconButton
              label="Hide tournaments"
              side="right"
              aria-expanded
              aria-controls={LIST_ID}
              onClick={() => onCollapsedChange(true)}
            >
              <SidebarSimpleIcon />
            </IconButton>
          </div>
          <section aria-labelledby="tournaments-heading" className="flex flex-col gap-2">
            <h2 id="tournaments-heading" className="heading-card text-xl">
              Tournaments
            </h2>
            <div aria-current="true" className="rounded-lg border border-tile-border bg-tile px-4 py-3">
              <p className="truncate text-[17px] font-semibold text-turf">{name}</p>
              <p className="text-sm text-muted-foreground tabular-nums">{formatDate(draft.frame.date)}</p>
            </div>
          </section>
        </>
      )}
    </aside>
  );
}
