"use client";

import { CaretDownIcon, MonitorIcon } from "@phosphor-icons/react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { publicName } from "@/lib/tournament/audience";
import { BOARD_THEME_KEY, boardUrl } from "@/lib/tournament/board-channel";
import { PUBLIC_NAMES, type PlanDraft, type PublicNames } from "@/lib/tournament/draft";
import type { Update } from "./plan-editor";

const NAMES_LABEL: Record<PublicNames, string> = {
  full: "Full name",
  firstInitial: "First name and initial",
  initials: "Initials",
};

/**
 * Opens the audience board in its own window, to drag to the hall's screen;
 * and beside it, how people's names appear there.
 */
export function AudienceBoardButton({ id, draft, update }: { id: string; draft: PlanDraft; update: Update }) {
  const { resolvedTheme } = useTheme();
  // A real name from the entries to show each choice with; none until someone is entered.
  const example = draft.entries.flatMap((e) => e.players.map((p) => p.name.trim())).find((n) => n.includes(" ")) ?? null;

  function open() {
    try {
      // The board keeps a theme of its own: the first time, it starts as the desk's.
      if (!window.localStorage.getItem(BOARD_THEME_KEY) && resolvedTheme) window.localStorage.setItem(BOARD_THEME_KEY, resolvedTheme);
    } catch {
      // The board follows the device's theme instead.
    }
    window.open(boardUrl(id), "badminton-audience-board", "popup,width=1280,height=720");
  }

  return (
    <div className="flex items-center">
      <Button
        variant="outline"
        size="sm"
        className="rounded-r-none"
        title="Opens the board in its own window. Drag it to the hall's screen and make it full screen"
        onClick={open}
      >
        <MonitorIcon /> Audience board
      </Button>
      <Popover>
        <PopoverTrigger
          render={
            <Button
              variant="outline"
              size="sm"
              aria-label={`Names on the board: ${NAMES_LABEL[draft.publicNames]}. Change`}
              title="Names on the board"
              className="-ml-px rounded-l-none px-2"
            />
          }
        >
          <CaretDownIcon weight="bold" aria-hidden="true" />
        </PopoverTrigger>
        <PopoverContent align="end" className="w-64 gap-1 p-2">
          <p className="px-2 py-1 text-xs font-semibold text-muted-foreground">Names on the board</p>
          {PUBLIC_NAMES.map((mode) => (
            <button
              key={mode}
              type="button"
              aria-pressed={draft.publicNames === mode}
              onClick={() => update((d) => void (d.publicNames = mode))}
              className="flex items-baseline justify-between gap-2 rounded-md px-2 py-2 text-left text-sm font-medium outline-none hover:bg-inset focus-visible:bg-inset focus-visible:ring-2 focus-visible:ring-ring aria-pressed:bg-accent"
            >
              <span>{NAMES_LABEL[mode]}</span>
              {example ? <span className="shrink-0 text-xs font-normal text-muted-foreground">{publicName(example, mode)}</span> : null}
            </button>
          ))}
          <p className="px-2 py-1 text-xs text-muted-foreground">The desk always sees full names.</p>
        </PopoverContent>
      </Popover>
    </div>
  );
}
