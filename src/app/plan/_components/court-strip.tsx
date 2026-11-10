"use client";

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from "react";

/** How far the pointer moves before a press becomes a drag of the row, in pixels. */
const DRAG_START = 5;
/** The width of the fade at an edge with more courts beyond it, in pixels. */
const FADE = 24;

/**
 * A hall's courts in one row that never wraps. Courts past the column's edge
 * are clipped; the row slides when dragged (or with a trackpad, Shift+wheel,
 * or by tabbing to a court). An edge fades when there are more courts that
 * way. When a court is added, the row slides to its end.
 */
export function CourtStrip({
  count,
  width,
  reversed = false,
  children,
}: {
  /** Drawn right to left: the first court at the right, Add court at the left end. */
  reversed?: boolean;
  count: number;
  /** How wide each court's card is, in pixels. */
  width: number;
  children: ReactNode;
}) {
  const row = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; left: number; moved: boolean } | null>(null);
  const [more, setMore] = useState({ left: false, right: false });
  const [dragging, setDragging] = useState(false);

  // Which edges have courts beyond them.
  useEffect(() => {
    const el = row.current;
    if (!el) return;
    const measure = () => {
      // Drawn right to left, the row starts at its right end and scrolls into negative numbers.
      const from = Math.abs(el.scrollLeft);
      const start = from > 1;
      const end = from + el.clientWidth < el.scrollWidth - 1;
      const left = reversed ? end : start;
      const right = reversed ? start : end;
      setMore((m) => (m.left === left && m.right === right ? m : { left, right }));
    };
    measure();
    el.addEventListener("scroll", measure, { passive: true });
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => {
      el.removeEventListener("scroll", measure);
      observer.disconnect();
    };
  }, [count, reversed]);

  // A court added: bring the end of the row (the new court and Add court) into view.
  const before = useRef(count);
  useLayoutEffect(() => {
    const el = row.current;
    if (el && count > before.current) {
      const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      el.scrollTo({ left: reversed ? -el.scrollWidth : el.scrollWidth, behavior: still ? "auto" : "smooth" });
    }
    before.current = count;
  }, [count, reversed]);

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    // Touch slides the row by itself; typing fields keep their own drags (selecting text).
    if (event.pointerType !== "mouse" || event.button !== 0) return;
    if ((event.target as HTMLElement).closest("input, textarea, select")) return;
    drag.current = { x: event.clientX, left: row.current!.scrollLeft, moved: false };
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d) return;
    const dx = event.clientX - d.x;
    if (!d.moved) {
      if (Math.abs(dx) < DRAG_START) return;
      d.moved = true;
      setDragging(true);
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    row.current!.scrollLeft = d.left - dx;
  }

  function onPointerEnd() {
    const d = drag.current;
    drag.current = null;
    if (!d?.moved) return;
    setDragging(false);
    // The press was a drag, not a click on whatever was under it.
    const swallow = (click: MouseEvent) => {
      click.stopPropagation();
      click.preventDefault();
    };
    window.addEventListener("click", swallow, { capture: true, once: true });
    window.setTimeout(() => window.removeEventListener("click", swallow, { capture: true }), 0);
  }

  const mask =
    more.left || more.right
      ? `linear-gradient(to right, ${more.left ? "transparent" : "black"}, black ${FADE}px, black calc(100% - ${FADE}px), ${
          more.right ? "transparent" : "black"
        })`
      : undefined;

  return (
    <div
      ref={row}
      data-slot="court-strip"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      style={{ maskImage: mask, WebkitMaskImage: mask, "--court-w": `${width}px` } as CSSProperties}
      // The 4px of padding leaves room for focus and selection rings, which the clip would cut.
      className={`-m-1 flex ${reversed ? "flex-row-reverse" : ""} gap-3 overflow-x-auto overflow-y-hidden p-1 [scrollbar-width:none] *:w-(--court-w) *:shrink-0 [&::-webkit-scrollbar]:hidden ${
        dragging ? "cursor-grabbing select-none" : ""
      }`}
    >
      {children}
    </div>
  );
}
