"use client";

import { CopyIcon, PlusIcon, SidebarSimpleIcon, TrashIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { PlanDraft } from "@/lib/tournament/draft";
import { sortTournaments, type TournamentMeta } from "@/lib/tournament/storage";
import { IconButton } from "./fields";

function formatDate(iso: string): string {
  if (!iso) return "No date yet";
  const [y, m, d] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" }).format(
    new Date(y!, m! - 1, d!),
  );
}

/** When a tournament was last saved: the time today, with the date on other days. */
function formatSaved(at: number): string {
  const when = new Date(at);
  const today = new Date().toDateString() === when.toDateString();
  return new Intl.DateTimeFormat("en-GB", {
    ...(today ? {} : { day: "numeric", month: "short" }),
    hour: "2-digit",
    minute: "2-digit",
  }).format(when);
}

const LIST_ID = "tournament-list";

/**
 * Left panel: the saved tournaments, newest first, and New tournament. The
 * open one saves as it changes and can be duplicated or deleted; another
 * opens with a click. Collapses to a rail.
 */
export function TournamentList({
  draft,
  currentId,
  items,
  onNew,
  onDuplicate,
  onDelete,
  onOpen,
  collapsed,
  onCollapsedChange,
}: {
  draft: PlanDraft;
  currentId: string;
  items: TournamentMeta[];
  onNew: () => void;
  onDuplicate: () => void;
  onDelete: (id: string) => void;
  onOpen: (id: string) => void;
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
}) {
  const name = draft.name.trim() || "Untitled tournament";
  // The open tournament shows as it is now, ahead of its next save.
  const listed = sortTournaments(
    items.map((t) => (t.id === currentId ? { ...t, name: draft.name, date: draft.frame.date } : t)),
  );
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
            <ul className="flex flex-col gap-2">
              {listed.map((t) => {
                const title = t.name.trim() || "Untitled tournament";
                return t.id === currentId ? (
                  <li key={t.id} aria-current="true" className="rounded-lg border border-tile-border bg-tile px-4 py-3">
                    <p className="truncate text-[17px] font-semibold text-turf" title={title}>
                      {title}
                    </p>
                    <p className="text-sm text-muted-foreground tabular-nums">{formatDate(t.date)}</p>
                    <div className="mt-2 flex items-center gap-1">
                      <p className="flex-1 truncate text-xs text-muted-foreground tabular-nums">
                        Saved {formatSaved(t.updatedAt)}
                      </p>
                      <IconButton label="Duplicate as a new tournament" onClick={onDuplicate}>
                        <CopyIcon />
                      </IconButton>
                      <IconButton label="Delete tournament" onClick={() => onDelete(t.id)}>
                        <TrashIcon />
                      </IconButton>
                    </div>
                  </li>
                ) : (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => onOpen(t.id)}
                      className="w-full rounded-lg border border-transparent px-4 py-3 text-left outline-none hover:bg-tile/60 focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <span className="block truncate text-[17px] font-semibold" title={title}>
                        {title}
                      </span>
                      <span className="block text-sm text-muted-foreground tabular-nums">{formatDate(t.date)}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        </>
      )}
    </aside>
  );
}
