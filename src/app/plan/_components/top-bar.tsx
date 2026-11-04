"use client";

import { ArrowArcLeftIcon, ArrowArcRightIcon } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import type { TournamentStage } from "@/lib/tournament/draft";
import { IconButton } from "./fields";
import { StageSwitch } from "./stage-switch";

/** Ctrl or Cmd, as this computer names it. */
function modifier(): string {
  return typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform) ? "Cmd" : "Ctrl";
}

/**
 * The open tournament's bar, over the main area: its stage switch in the
 * middle; undo, redo and any further tournament actions on the right. The
 * app's own controls (name, profile, settings) live in the sidebar.
 */
export function TopBar({
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  stage,
  view,
  onView,
  onAdvance,
  actions,
}: {
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  stage: TournamentStage;
  view: TournamentStage;
  onView: (stage: TournamentStage) => void;
  onAdvance: (stage: TournamentStage) => void;
  /** More of the tournament's actions, after undo and redo. */
  actions?: ReactNode;
}) {
  const mod = modifier();
  return (
    <header className="grid h-14 shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-4 border-b bg-card px-6">
      <span />
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
        {actions}
      </div>
    </header>
  );
}
