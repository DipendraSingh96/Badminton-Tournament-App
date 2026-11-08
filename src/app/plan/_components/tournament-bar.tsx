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
 * The tournament's first row, over everything about it: its name, date and
 * time zone, with undo and redo at the right.
 */
export function NameRow({
  fields,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
}: {
  /** The name, date and time zone fields. */
  fields: ReactNode;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}) {
  const mod = modifier();
  return (
    <header className="@container flex shrink-0 items-center gap-4 pt-4 pb-2">
      <div className="min-w-0 flex-1">{fields}</div>
      <div className="flex shrink-0 items-center gap-2">
        <IconButton label={`Undo (${mod}+Z)`} side="bottom" disabled={!canUndo} onClick={onUndo}>
          <ArrowArcLeftIcon />
        </IconButton>
        <IconButton
          label={`Redo (${mod}+Shift+Z)`}
          side="bottom"
          disabled={!canRedo}
          onClick={onRedo}
        >
          <ArrowArcRightIcon />
        </IconButton>
      </div>
    </header>
  );
}

/**
 * The tournament's stages (Plan · Draw · Live · Results) under its name, with
 * the stage's own tools (sample data) at the right end.
 */
export function StageRow({
  stage,
  view,
  onView,
  onAdvance,
  actions,
}: {
  stage: TournamentStage;
  view: TournamentStage;
  onView: (stage: TournamentStage) => void;
  onAdvance: (stage: TournamentStage) => void;
  /** The stage's tools, at the right end. */
  actions?: ReactNode;
}) {
  return (
    <div className="flex shrink-0 items-center justify-between gap-4">
      <StageSwitch stage={stage} view={view} onView={onView} onAdvance={onAdvance} />
      <div className="flex items-center gap-2">{actions}</div>
    </div>
  );
}
