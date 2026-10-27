"use client";

import { ArrowArcLeftIcon, ArrowArcRightIcon, MoonIcon, SunIcon, UserIcon } from "@phosphor-icons/react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { PRODUCT_NAME } from "@/lib/product";
import { IconButton } from "./fields";

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
}: {
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}) {
  const mod = modifier();
  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b bg-card px-6">
      <span className="font-display text-2xl leading-none font-bold text-turf uppercase">{PRODUCT_NAME}</span>
      <div className="flex items-center gap-2">
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
