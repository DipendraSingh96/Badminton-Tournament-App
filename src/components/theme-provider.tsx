"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import { usePathname } from "next/navigation";
import type { ComponentProps } from "react";
import { BOARD_THEME_KEY } from "@/lib/tournament/board-channel";

/**
 * Light and dark themes; follows the device until the person chooses. The
 * audience board keeps a theme of its own, so the hall's screen can be set
 * for the hall without changing the desk's.
 */
export function ThemeProvider(props: ComponentProps<typeof NextThemesProvider>) {
  const board = usePathname().startsWith("/board");
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
      {...(board ? { storageKey: BOARD_THEME_KEY } : {})}
      {...props}
    />
  );
}
