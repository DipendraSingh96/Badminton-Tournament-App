"use client";

import { ArrowLeftIcon, ArrowRightIcon, CheckIcon, ListIcon, XIcon } from "@phosphor-icons/react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { TOUR, nextPlace, previousPlace, type TourPlace } from "./steps";

/** Where the tour is: on a step, at its list of chapters, or at its last card. */
export type TourAt = TourPlace | "contents" | "end";

/** Room left round the lit part, and between it and the card. */
const PAD = 6;
const GAP = 16;
const EDGE = 16;
const CARD_WIDTH = 344;
/** The last card is wider: its two ways on sit side by side. */
const END_CARD_WIDTH = 464;
/** Frames the lit part must hold still before the light travels to it. */
const SETTLED_FRAMES = 6;

interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

/** The lit part's box on screen, kept inside the window; null while it isn't there. */
function boxOf(selector: string): Box | null {
  const element = document.querySelector<HTMLElement>(selector);
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return null;
  const left = Math.max(4, rect.left - PAD);
  const top = Math.max(4, rect.top - PAD);
  const right = Math.min(window.innerWidth - 4, rect.right + PAD);
  const bottom = Math.min(window.innerHeight - 4, rect.bottom + PAD);
  if (right <= left || bottom <= top) return null;
  return { top: Math.round(top), left: Math.round(left), width: Math.round(right - left), height: Math.round(bottom - top) };
}

/** Where the card goes: beside the lit part where there is room, otherwise inside its lower right corner. */
function cardPlace(box: Box | null, height: number, CARD_WIDTH: number): { top: number; left: number } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  if (!box) return { top: Math.max(EDGE, (vh - height) / 2), left: (vw - CARD_WIDTH) / 2 };
  const clampX = (x: number) => Math.min(Math.max(EDGE, x), vw - CARD_WIDTH - EDGE);
  const clampY = (y: number) => Math.min(Math.max(EDGE, y), vh - height - EDGE);
  const right = box.left + box.width;
  const bottom = box.top + box.height;
  if (right + GAP + CARD_WIDTH + EDGE <= vw) return { left: right + GAP, top: clampY(box.top) };
  if (box.left - GAP - CARD_WIDTH - EDGE >= 0) return { left: box.left - GAP - CARD_WIDTH, top: clampY(box.top) };
  if (bottom + GAP + height + EDGE <= vh) return { top: bottom + GAP, left: clampX(box.left) };
  if (box.top - GAP - height - EDGE >= 0) return { top: box.top - GAP - height, left: clampX(box.left) };
  return { left: clampX(right - CARD_WIDTH - GAP), top: clampY(bottom - height - GAP) };
}

/**
 * The product tour's overlay: the screen dimmed, one part lit, and a card
 * beside it. The screen underneath is for looking at, not for clicking, while
 * it is up.
 */
export function Tour({
  at,
  seen,
  onGo,
  onClose,
  onStartOwn,
  onExplore,
}: {
  /** The last card's other way on: the sample tournament, to look round freely. */
  onExplore: () => void;
  at: TourAt;
  /** Chapters already been through, for the ticks in the list. */
  seen: string[];
  onGo: (at: TourAt) => void;
  onClose: () => void;
  /** The last card's way on: a new tournament of the organiser's own. */
  onStartOwn: () => void;
}) {
  const place = typeof at === "object" ? at : null;
  const chapter = place ? TOUR[place.chapter]! : null;
  const step = place && chapter ? chapter.steps[place.step]! : null;
  const target = step?.target ?? null;

  // The lit part is followed wherever it is: the screen under the tour changes as its steps do. It
  // keeps its last place until the next part is on screen and has stopped moving, then travels there
  // in one movement, so the tour stays joined up from step to step.
  const [lit, setLit] = useState<Box | null>(null);
  useEffect(() => {
    if (!target) return;
    let frame = 0;
    let shown = false;
    let last: Box | null = null;
    let still = 0;
    const same = (a: Box | null, b: Box | null) =>
      a !== null && b !== null && a.top === b.top && a.left === b.left && a.width === b.width && a.height === b.height;
    const follow = () => {
      const element = document.querySelector<HTMLElement>(target);
      if (element && !shown) {
        shown = true;
        element.scrollIntoView({ block: "nearest", inline: "nearest" });
      }
      const box = boxOf(target);
      still = same(box, last) ? still + 1 : 0;
      last = box;
      // Settled for a few frames: the screen has finished rearranging itself for this step.
      if (box && still >= SETTLED_FRAMES) setLit((before) => (same(before, box) ? before : box));
      frame = requestAnimationFrame(follow);
    };
    frame = requestAnimationFrame(follow);
    return () => cancelAnimationFrame(frame);
  }, [target]);
  // The chapter list and the last card light nothing.
  const box = target ? lit : null;

  // The card, placed once its height is known.
  const width = at === "end" ? END_CARD_WIDTH : CARD_WIDTH;
  const card = useRef<HTMLDivElement>(null);
  const [spot, setSpot] = useState<{ top: number; left: number } | null>(null);
  useLayoutEffect(() => {
    const height = card.current?.offsetHeight ?? 0;
    const next = cardPlace(box, height, width);
    setSpot((before) => (before && before.top === next.top && before.left === next.left ? before : next));
  }, [box, at, width]);
  useEffect(() => {
    const again = () => setSpot(cardPlace(box, card.current?.offsetHeight ?? 0, width));
    window.addEventListener("resize", again);
    return () => window.removeEventListener("resize", again);
  }, [box, width]);

  const next = place ? nextPlace(place) : null;
  const previous = place ? previousPlace(place) : null;
  const forward = () => {
    if (at === "contents") onGo({ chapter: 0, step: 0 });
    else if (place) onGo(next ?? "end");
  };
  const back = () => {
    if (previous) onGo(previous);
  };

  // The keyboard: Right or Enter goes on, Left goes back, Esc leaves.
  const keys = useRef({ forward, back, onClose });
  useEffect(() => {
    keys.current = { forward, back, onClose };
  });
  useEffect(() => {
    const press = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        keys.current.onClose();
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        keys.current.forward();
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        keys.current.back();
      }
    };
    window.addEventListener("keydown", press);
    return () => window.removeEventListener("keydown", press);
  }, []);

  // Each step takes the keyboard to its way on.
  const primary = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    primary.current?.focus({ preventScroll: true });
  }, [at]);

  const title = step ? step.title : at === "contents" ? "Take the tour" : "That’s the whole flow";

  return createPortal(
    <div data-tour-overlay className="fixed inset-0 z-[80] text-sm" role="presentation">
      {/* The dim, with the lit part cut out of it. Nothing under it can be clicked. */}
      <div className="absolute inset-0" aria-hidden="true" />
      {/* One element for the whole tour, so it travels from each place and shape to the next (half a second, ease in-out). */}
      <div
        data-tour-lit
        aria-hidden="true"
        className={`pointer-events-none absolute rounded-lg shadow-[0_0_0_200vmax_rgb(0_0_0/0.55)] outline-offset-0 outline-primary transition-[top,left,width,height] duration-500 ease-in-out motion-reduce:transition-none ${box ? "outline-2" : "outline-0"}`}
        // With nothing to light it closes to a point in the middle: the whole screen is dimmed.
        style={box ?? { top: "50%", left: "50%", width: 0, height: 0 }}
      />

      <div
        ref={card}
        role="dialog"
        aria-modal="true"
        aria-label={`Tour: ${title}`}
        data-tour-card
        className="absolute flex flex-col gap-3 rounded-xl border bg-card p-4 text-card-foreground shadow-lg transition-[top,left] duration-500 ease-in-out motion-reduce:transition-none"
        style={{ width, top: spot?.top ?? 0, left: spot?.left ?? 0, visibility: spot ? "visible" : "hidden" }}
      >
        <div className="flex items-center gap-2">
          <p className="min-w-0 flex-1 truncate text-xs font-semibold text-muted-foreground" aria-live="polite">
            {chapter && place ? `${chapter.title} · ${place.step + 1} of ${chapter.steps.length}` : "Tour"}
          </p>
          {place ? (
            <Button variant="ghost" size="icon" aria-label="Chapters" title="Chapters" onClick={() => onGo("contents")}>
              <ListIcon />
            </Button>
          ) : null}
          <Button variant="ghost" size="icon" aria-label="Leave the tour" title="Leave the tour (Esc)" onClick={onClose}>
            <XIcon />
          </Button>
        </div>

        {step ? (
          <div className="flex flex-col gap-1" aria-live="polite">
            <h2 className="heading-card text-xl">{step.title}</h2>
            <p className="leading-relaxed">{step.body}</p>
          </div>
        ) : at === "contents" ? (
          <div className="flex flex-col gap-2">
            <h2 className="heading-card text-xl">Take the tour</h2>
            <p className="text-muted-foreground">A whole tournament on a sample, from plan to results. About five minutes; start anywhere.</p>
            <ol className="flex flex-col">
              {TOUR.map((c, i) => (
                <li key={c.id}>
                  <button
                    type="button"
                    data-tour-chapter={c.id}
                    onClick={() => onGo({ chapter: i, step: 0 })}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left font-medium outline-none hover:bg-inset focus-visible:bg-inset focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span className="w-4 text-muted-foreground tabular-nums">{i + 1}</span>
                    <span className="min-w-0 flex-1 truncate">{c.title}</span>
                    {seen.includes(c.id) ? <CheckIcon weight="bold" className="size-4 text-muted-foreground" aria-label="Seen" /> : null}
                  </button>
                </li>
              ))}
            </ol>
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            <h2 className="heading-card text-xl">That’s the whole flow</h2>
            <p className="leading-relaxed">
              Plan it, draw it, run it, wrap it up. Start your own, or look round the finished sample first. The tour is in Settings whenever you want a chapter again.
            </p>
          </div>
        )}

        <div className="flex items-center justify-end gap-2">
          {place ? (
            <>
              <Button variant="secondary" size="sm" disabled={!previous} onClick={back}>
                <ArrowLeftIcon weight="bold" /> Back
              </Button>
              <Button ref={primary} size="sm" data-tour-next onClick={forward}>
                {next ? "Next" : "Finish"} <ArrowRightIcon weight="bold" />
              </Button>
            </>
          ) : at === "contents" ? (
            <Button ref={primary} size="sm" data-tour-next onClick={forward}>
              Start from the beginning <ArrowRightIcon weight="bold" />
            </Button>
          ) : (
            <>
              <Button variant="secondary" size="sm" className="flex-1" data-tour-explore onClick={onExplore}>
                Explore sample tournament
              </Button>
              <Button ref={primary} size="sm" className="flex-1" data-tour-start-own onClick={onStartOwn}>
                Start new tournament <ArrowRightIcon weight="bold" />
              </Button>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
