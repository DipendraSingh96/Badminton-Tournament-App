"use client";

import { ArrowArcLeftIcon, ArrowArcRightIcon, MoonIcon, SunIcon, UserIcon } from "@phosphor-icons/react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { PRODUCT_NAME } from "@/lib/product";
import type { TournamentStage } from "@/lib/tournament/draft";
import { IconButton } from "./fields";
import { StageSwitch } from "./stage-switch";

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const dark = resolvedTheme === "dark";
  return (
    <Button
      variant="outline"
      size="icon-sm"
      className="rounded-full"
      aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
      onClick={() => setTheme(dark ? "light" : "dark")}
    >
      {dark ? <SunIcon /> : <MoonIcon />}
    </Button>
  );
}

/** Ctrl or Cmd, as this computer names it. */
function modifier(): string {
  return typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform) ? "Cmd" : "Ctrl";
}

export function TopBar({
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  stage,
  view,
  onView,
  onAdvance,
}: {
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  stage: TournamentStage;
  view: TournamentStage;
  onView: (stage: TournamentStage) => void;
  onAdvance: (stage: TournamentStage) => void;
}) {
  const mod = modifier();
  return (
    <header className="grid h-14 shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-4 border-b bg-card px-6">
      <span className="font-display text-2xl leading-none font-bold text-turf uppercase">{PRODUCT_NAME}</span>
      <StageSwitch stage={stage} view={view} onView={onView} onAdvance={onAdvance} />
      <div className="flex items-center justify-end gap-2">
        <IconButton label={`Undo (${mod}+Z)`} side="bottom" variant="outline" className="rounded-full" disabled={!canUndo} onClick={onUndo}>
          <ArrowArcLeftIcon />
        </IconButton>
        <IconButton
          label={`Redo (${mod}+Shift+Z)`}
          side="bottom"
          variant="outline"
          className="rounded-full"
          disabled={!canRedo}
          onClick={onRedo}
        >
          <ArrowArcRightIcon />
        </IconButton>
        <ThemeToggle />
        {/* Accounts arrive with sign-in (PRD build slice 4). */}
        <Button variant="outline" size="icon-sm" className="rounded-full" aria-label="Account" disabled>
          <UserIcon />
        </Button>
      </div>
    </header>
  );
}
