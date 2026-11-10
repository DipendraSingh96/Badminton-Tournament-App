"use client";

import {
  CopyIcon,
  DesktopIcon,
  GearSixIcon,
  MoonIcon,
  PlusIcon,
  SidebarSimpleIcon,
  SunIcon,
  TrashIcon,
  UserIcon,
} from "@phosphor-icons/react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { PRODUCT_NAME } from "@/lib/product";
import type { PlanDraft } from "@/lib/tournament/draft";
import { sortTournaments, type TournamentMeta } from "@/lib/tournament/storage";
import { cn } from "@/lib/utils";
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

const SIDEBAR_ID = "sidebar";

const THEMES = [
  { value: "light", label: "Light", icon: SunIcon },
  { value: "dark", label: "Dark", icon: MoonIcon },
  { value: "system", label: "System", icon: DesktopIcon },
] as const;

/** Settings: for now, the theme. Opens from the sidebar's foot. */
function SettingsMenu({ collapsed }: { collapsed: boolean }) {
  const { theme, setTheme } = useTheme();
  const optionClass =
    "flex items-center gap-2 rounded-md px-2 py-2 text-left text-sm font-medium outline-none hover:bg-inset focus-visible:bg-inset focus-visible:ring-2 focus-visible:ring-ring aria-pressed:bg-accent";
  return (
    <Popover>
      <PopoverTrigger
        render={
          collapsed ? (
            <Button variant="ghost" size="icon" aria-label="Settings" />
          ) : (
            <Button variant="ghost" className="w-full justify-start" />
          )
        }
      >
        <GearSixIcon />
        {collapsed ? null : "Settings"}
      </PopoverTrigger>
      <PopoverContent side={collapsed ? "right" : "top"} align="start" className="w-56 gap-1 p-2">
        <p className="px-2 py-1 text-xs font-semibold text-muted-foreground">Theme</p>
        {THEMES.map(({ value, label, icon: Icon }) => (
          <button
            key={value}
            type="button"
            aria-pressed={(theme ?? "system") === value}
            onClick={() => setTheme(value)}
            className={optionClass}
          >
            <Icon className="size-4" aria-hidden="true" />
            {label}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

/** The account; arrives with sign-in (PRD build slice 4). */
function ProfileButton({ collapsed }: { collapsed: boolean }) {
  return collapsed ? (
    <Button variant="ghost" size="icon" aria-label="Profile (sign-in arrives later)" disabled>
      <UserIcon />
    </Button>
  ) : (
    <Button variant="ghost" className="w-full justify-start" disabled>
      <UserIcon />
      Profile
      <span className="ml-auto text-xs font-normal">Sign-in later</span>
    </Button>
  );
}

/**
 * The app's sidebar, the full height of the window: the product name and
 * collapse at the top; New tournament and the saved tournaments (newest
 * first) in the middle; profile and settings at the foot. The open tournament
 * saves as it changes and can be duplicated or deleted; another opens with a
 * click. Collapses to a rail.
 */
export function Sidebar({
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
      id={SIDEBAR_ID}
      aria-label="Tournaments"
      className={cn(
        "relative flex h-full shrink-0 flex-col overflow-hidden bg-card transition-[width] duration-200 motion-reduce:transition-none",
        collapsed ? "w-10" : "w-(--pane-left)",
      )}
    >
      <div
        className={cn(
          "flex h-14 shrink-0 items-center gap-2",
          collapsed ? "justify-center" : "justify-between px-(--pane-x)",
        )}
      >
        {collapsed ? null : (
          <span className="truncate font-display text-2xl leading-none font-bold text-turf uppercase">{PRODUCT_NAME}</span>
        )}
        <IconButton
          label={collapsed ? "Show sidebar" : "Hide sidebar"}
          side={collapsed ? "right" : "bottom"}
          aria-expanded={!collapsed}
          aria-controls={SIDEBAR_ID}
          onClick={() => onCollapsedChange(!collapsed)}
        >
          <SidebarSimpleIcon />
        </IconButton>
      </div>

      {collapsed ? (
        <div className="flex min-h-0 flex-1 flex-col items-center gap-2 py-3">
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
        </div>
      ) : (
        <div className="scroll-pane flex min-h-0 flex-1 flex-col gap-4 overflow-x-hidden overflow-y-auto px-(--pane-x) py-4">
          <Button onClick={onNew}>
            <PlusIcon /> New tournament
          </Button>
          <section aria-labelledby="tournaments-heading" className="flex flex-col gap-2">
            <h2 id="tournaments-heading" className="heading-card text-xl">
              Tournaments
            </h2>
            <ul className="flex flex-col gap-2">
              {listed.map((t) => {
                const title = t.name.trim() || "Untitled tournament";
                return t.id === currentId ? (
                  <li key={t.id} aria-current="true" className="rounded-lg border border-tile-border bg-tile px-4 py-3">
                    <p className="truncate text-sm font-semibold text-turf" title={title}>
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
                      <span className="block truncate text-sm font-semibold" title={title}>
                        {title}
                      </span>
                      <span className="block text-sm text-muted-foreground tabular-nums">{formatDate(t.date)}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        </div>
      )}

      <div className={cn("flex shrink-0 flex-col gap-1 pt-4 pb-2", collapsed ? "items-center" : "px-(--pane-x)")}>
        <ProfileButton collapsed={collapsed} />
        <SettingsMenu collapsed={collapsed} />
      </div>
    </aside>
  );
}
