"use client";

import { ArrowsClockwiseIcon, CheckIcon, CopyIcon, ShareNetworkIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { followUrl } from "@/lib/tournament/public-board";
import { cn } from "@/lib/utils";

/** How the players' link is doing: when it was last brought up to date, and whether the last try failed. */
export interface ShareState {
  at: number | null;
  failed: boolean;
}

function formatTime(at: number): string {
  return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" }).format(new Date(at));
}

/**
 * Share with players: a switch for the players' link, the link itself to
 * copy, and a way to replace it. The link shows a public snapshot of the day
 * (courts, scores, tables, the knockout, the results); it never shows phone
 * numbers, check-in or money, and nothing on it changes the tournament.
 */
export function ShareButton({
  link,
  state,
  onShare,
  onStop,
  onRenew,
}: {
  /** The link's secret id while the tournament is shared; null while it isn't. */
  link: string | null;
  state: ShareState;
  onShare: () => void;
  onStop: () => void;
  onRenew: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const address = link && typeof window !== "undefined" ? `${window.location.origin}${followUrl(link)}` : "";

  async function copy() {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // No clipboard here: the address is in the box to select and copy by hand.
    }
  }

  return (
    <Popover>
      <PopoverTrigger
        render={<Button variant="outline" size="sm" data-share title="A link for players: courts, scores and results on their phones" />}
      >
        <ShareNetworkIcon /> {link ? "Shared with players" : "Share with players"}
        {link ? <span aria-hidden="true" className={cn("size-2 rounded-full", state.failed ? "bg-tight" : "bg-fits")} /> : null}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[360px] gap-3 p-3">
        <label className="flex items-center justify-between gap-3 text-sm font-semibold">
          Players&apos; link
          <Switch data-share-switch checked={link !== null} onCheckedChange={(on) => (on ? onShare() : onStop())} />
        </label>
        <p className="text-xs leading-relaxed text-muted-foreground">
          Anyone with the link sees who is on court, the scores, what is next, the tables, the knockout and the results. It never shows phone
          numbers, check-in or money, and nothing on it can change the tournament.
        </p>
        {link ? (
          <>
            <input
              readOnly
              data-share-link
              aria-label="The players' link"
              value={address}
              onFocus={(e) => e.currentTarget.select()}
              className="h-(--control-h) w-full min-w-0 rounded-md border bg-inset px-3 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={() => void copy()}>
                {copied ? <CheckIcon weight="bold" /> : <CopyIcon />} {copied ? "Copied" : "Copy link"}
              </Button>
              <Button variant="outline" size="sm" title="Makes a new link. The old one stops working" onClick={onRenew}>
                <ArrowsClockwiseIcon /> New link
              </Button>
            </div>
            <p data-share-state role="status" className={cn("text-xs", state.failed ? "font-medium text-tight-text" : "text-muted-foreground")}>
              {state.failed
                ? "Couldn’t update the link. It is tried again by itself; check the connection."
                : state.at
                  ? `Up to date at ${formatTime(state.at)}. It follows the tournament from this window while it is open.`
                  : "Sending the first update…"}
            </p>
          </>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
