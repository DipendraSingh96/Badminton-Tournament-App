"use client";

import { MoonIcon, SunIcon, UserIcon } from "@phosphor-icons/react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { PRODUCT_NAME } from "@/lib/product";

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const dark = resolvedTheme === "dark";
  return (
    <Button
      variant="outline"
      size="icon"
      className="rounded-full"
      aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
      onClick={() => setTheme(dark ? "light" : "dark")}
    >
      {dark ? <SunIcon /> : <MoonIcon />}
    </Button>
  );
}

export function TopBar() {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b bg-card px-5">
      <span className="text-base font-semibold tracking-tight">{PRODUCT_NAME}</span>
      <div className="flex items-center gap-2">
        <ThemeToggle />
        {/* Accounts arrive with sign-in (PRD build slice 4). */}
        <Button variant="outline" size="icon" className="rounded-full" aria-label="Account" disabled>
          <UserIcon />
        </Button>
      </div>
    </header>
  );
}
