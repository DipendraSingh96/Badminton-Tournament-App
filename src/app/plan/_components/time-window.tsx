"use client";

import { XIcon } from "@phosphor-icons/react";
import {
  createContext,
  useContext,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";
import {
  drawWindow,
  moveBoundary,
  moveEnd,
  moveStart,
  moveWindow,
  pinBuffer,
  snapToGrid,
  stepOf,
  type Bounds,
  type Window,
} from "@/lib/tournament/snap";
import { clock } from "@/lib/tournament/time";

// A row of the day on which a time window is drawn and dragged: a hall's
// hours, a court's availability or the buffer. Times are minutes since
// midnight. Every move goes through the snap rules in lib/tournament/snap.

export interface ViewRange {
  start: number;
  end: number;
}

/**
 * The span of the day the strips show, shared by every track so they line
 * up; held still while something is being dragged so the axis doesn't jump.
 */
export const ViewRangeContext = createContext<{ range: ViewRange; setDragging: (dragging: boolean) => void }>({
  range: { start: 0, end: 24 * 60 },
  setDragging: () => {},
});

type Part = "draw" | "start" | "end" | "body";

export interface Boundary {
  id: string;
  value: number;
  /** Where its neighbours leave it room to move. */
  bounds: Bounds;
  label: string;
  onChange: (value: number) => void;
}

export function TimeWindowTrack({
  name,
  window,
  unit,
  origin,
  bounds,
  mode = "window",
  onChange,
  onDraw,
  onDelete,
  onReset,
  onTap,
  boundaries = [],
  invalid = false,
  emptyHint,
  className,
  background,
  overlay,
  windowClassName,
  hoverGuide = false,
  passThrough = false,
}: {
  /** e.g. "Main hall hours", "Court 3", "Buffer"; used in labels. */
  name: string;
  window: Window | null;
  /** The step drags move in: the hall's unit time, or the drawing grid until it's set. */
  unit: number | null;
  /** Boundaries snap to whole units from here (the hall's opening). */
  origin?: number | null;
  bounds?: Bounds;
  /** A buffer moves its start on the drawing grid and keeps whole units. */
  mode?: "window" | "buffer";
  onChange: (window: Window) => void;
  /** Without it, the track can't draw a new window. */
  onDraw?: (window: Window) => void;
  onDelete?: () => void;
  /** Double-click or H: back to the default, e.g. a court to its hall's hours. */
  onReset?: () => void;
  /** A click on the window without dragging, at that time. */
  onTap?: (minute: number) => void;
  boundaries?: Boundary[];
  invalid?: boolean;
  emptyHint?: string;
  className?: string;
  /** Drawn under the window, e.g. rate band shading. */
  background?: ReactNode;
  /** Drawn over the window, ignoring the pointer, e.g. scheduled matches. */
  overlay?: ReactNode;
  windowClassName?: string;
  /** On an empty track, a line follows the pointer showing where drawing would start. */
  hoverGuide?: boolean;
  /** Only the window takes the pointer, so tracks can share a row (e.g. a hall's two stage zones). */
  passThrough?: boolean;
}) {
  const { range, setDragging } = useContext(ViewRangeContext);
  const track = useRef<HTMLDivElement>(null);
  const drag = useRef<{ part: Part | "boundary"; anchor: number; initial: Window | null; moved: boolean; boundary?: Boundary } | null>(
    null,
  );
  const [active, setActive] = useState(false);
  const [hover, setHover] = useState<number | null>(null);
  const span = Math.max(1, range.end - range.start);
  const pct = (m: number) => `${((m - range.start) / span) * 100}%`;
  const step = stepOf(unit);

  function minuteAt(clientX: number): number {
    const box = track.current!.getBoundingClientRect();
    return range.start + ((clientX - box.left) / Math.max(1, box.width)) * span;
  }

  function begin(event: PointerEvent<HTMLElement>, part: Part | "boundary", boundary?: Boundary) {
    if (event.button !== 0) return;
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { part, anchor: minuteAt(event.clientX), initial: window, moved: false, boundary };
    setDragging(true);
    setActive(true);
  }

  function place(part: Part, initial: Window | null, anchor: number, minute: number) {
    if (part === "draw" || !initial) {
      onDraw?.(drawWindow(anchor, minute, unit, bounds));
    } else if (part === "start") {
      onChange(moveStart(initial, minute, unit, bounds));
    } else if (part === "end") {
      onChange(moveEnd(initial, minute, unit, bounds));
    } else if (mode === "buffer") {
      onChange(pinBuffer(initial.from + (minute - anchor), initial.to - initial.from, unit, bounds));
    } else {
      onChange(moveWindow(initial, minute - anchor, unit, bounds));
    }
  }

  function move(event: PointerEvent<HTMLElement>) {
    const current = drag.current;
    if (!current || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const minute = minuteAt(event.clientX);
    if (Math.abs(minute - current.anchor) < 1 && !current.moved) return;
    current.moved = true;
    if (current.part === "boundary") {
      const b = current.boundary!;
      b.onChange(moveBoundary(minute, origin ?? b.value, unit, b.bounds));
    } else {
      place(current.part, current.initial, current.anchor, minute);
    }
  }

  function end() {
    const current = drag.current;
    drag.current = null;
    setDragging(false);
    setActive(false);
    if (!current || current.moved) return;
    // A press without a drag: draw one unit, or report a tap on the window.
    if (current.part === "draw") onDraw?.(drawWindow(current.anchor, current.anchor, unit, bounds));
    if (current.part === "body") onTap?.(current.anchor);
  }

  function keys(event: KeyboardEvent<HTMLElement>, part: Part) {
    if (!window) return;
    const delta = { ArrowLeft: -step, ArrowDown: -step, ArrowRight: step, ArrowUp: step }[event.key];
    if (event.key === "Delete" || event.key === "Backspace") {
      if (onDelete) {
        event.preventDefault();
        onDelete();
      }
      return;
    }
    if ((event.key === "h" || event.key === "H") && onReset) {
      event.preventDefault();
      onReset();
      return;
    }
    if (delta === undefined) return;
    event.preventDefault();
    if (part === "start") onChange(moveStart(window, window.from + delta, unit, bounds));
    else if (part === "end") onChange(moveEnd(window, window.to + delta, unit, bounds));
    else if (mode === "buffer") onChange(pinBuffer(window.from + delta, window.to - window.from, unit, bounds));
    else onChange(moveWindow(window, delta, unit, bounds));
  }

  function boundaryKeys(event: KeyboardEvent<HTMLElement>, b: Boundary) {
    const delta = { ArrowLeft: -step, ArrowDown: -step, ArrowRight: step, ArrowUp: step }[event.key];
    if (delta === undefined) return;
    event.preventDefault();
    b.onChange(moveBoundary(b.value + delta, origin ?? b.value, unit, b.bounds));
  }

  const handlers = { onPointerMove: move, onPointerUp: end, onPointerCancel: end };

  return (
    <div
      ref={track}
      className={cn("group/track relative touch-none select-none", passThrough && "pointer-events-none", className)}
      onPointerDown={!window && onDraw ? (e) => begin(e, "draw") : undefined}
      onPointerMove={(e) => {
        if (hoverGuide && !window && !drag.current) setHover(snapToGrid(minuteAt(e.clientX)));
        move(e);
      }}
      onPointerLeave={() => setHover(null)}
      onPointerUp={end}
      onPointerCancel={end}
    >
      {background}
      {hoverGuide && !window && hover !== null ? (
        <span className="pointer-events-none absolute inset-y-0 z-20 w-px bg-foreground" style={{ left: pct(hover) }}>
          <span className="absolute top-full left-1/2 mt-1 -translate-x-1/2 rounded-sm bg-foreground px-1 text-[10px] leading-4 text-background tabular-nums">
            {clock(hover)}
          </span>
        </span>
      ) : null}
      {!window ? (
        onDraw ? (
          <span className="pointer-events-none absolute inset-0 flex cursor-crosshair items-center justify-center rounded-sm border border-dashed border-foreground/25 text-[11px] text-muted-foreground">
            {emptyHint ?? "Drag to set hours"}
          </span>
        ) : null
      ) : (
        <div
          className={cn(
            "group/window pointer-events-auto absolute inset-y-0 rounded-sm ring-1 transition-shadow focus-within:ring-2",
            invalid ? "ring-destructive" : "ring-foreground/50 focus-within:ring-ring",
            windowClassName,
          )}
          style={{ left: pct(window.from), width: `calc(${pct(window.to)} - ${pct(window.from)})` }}
        >
          {/* The body moves the whole window. */}
          <div
            role="slider"
            tabIndex={0}
            aria-label={`${name}: move`}
            aria-valuemin={0}
            aria-valuemax={24 * 60}
            aria-valuenow={window.from}
            aria-valuetext={`${clock(window.from)} to ${clock(window.to)}`}
            className="absolute inset-0 cursor-grab outline-none active:cursor-grabbing"
            onPointerDown={(e) => begin(e, "body")}
            onDoubleClick={onReset}
            onKeyDown={(e) => keys(e, "body")}
            {...handlers}
          />
          {(["start", "end"] as const).map((edge) => (
            <div
              key={edge}
              role="slider"
              tabIndex={0}
              aria-label={`${name}: ${edge === "start" ? "from" : "until"}`}
              aria-valuemin={0}
              aria-valuemax={24 * 60}
              aria-valuenow={edge === "start" ? window.from : window.to}
              aria-valuetext={clock(edge === "start" ? window.from : window.to)}
              className={cn(
                "absolute inset-y-0 z-10 w-2 cursor-ew-resize outline-none after:absolute after:inset-y-1 after:left-1/2 after:w-0.5 after:-translate-x-1/2 after:rounded-full after:bg-foreground/60 hover:after:bg-foreground focus-visible:after:w-1 focus-visible:after:bg-ring",
                edge === "start" ? "-left-1" : "-right-1",
              )}
              onPointerDown={(e) => begin(e, edge)}
              onKeyDown={(e) => keys(e, edge)}
              {...handlers}
            />
          ))}
          <span
            className={cn(
              "pointer-events-none absolute -top-4 left-0 z-20 rounded-sm bg-foreground px-1 text-[10px] leading-4 whitespace-nowrap text-background tabular-nums",
              active ? "block" : "hidden group-focus-within/window:block",
            )}
          >
            {clock(window.from)}–{clock(window.to)}
          </span>
          {onDelete ? (
            <button
              type="button"
              aria-label={`Remove ${name}`}
              className="absolute top-1/2 right-2 z-20 hidden size-4 -translate-y-1/2 place-items-center rounded-full bg-background text-foreground ring-1 ring-foreground/30 group-focus-within/window:grid group-hover/window:grid hover:bg-destructive hover:text-destructive-foreground"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={onDelete}
            >
              <XIcon className="size-2.5" />
            </button>
          ) : null}
        </div>
      )}
      {boundaries.map((b) => (
        <div
          key={b.id}
          role="slider"
          tabIndex={0}
          aria-label={b.label}
          aria-valuemin={b.bounds.min}
          aria-valuemax={b.bounds.max}
          aria-valuenow={b.value}
          aria-valuetext={clock(b.value)}
          className="absolute inset-y-0 z-20 w-3 -translate-x-1/2 cursor-ew-resize outline-none after:absolute after:inset-y-0 after:left-1/2 after:w-0.5 after:-translate-x-1/2 after:bg-foreground hover:after:w-1 focus-visible:after:w-1 focus-visible:after:bg-ring"
          style={{ left: pct(b.value) }}
          title={`${b.label}: ${clock(b.value)}`}
          onPointerDown={(e) => begin(e, "boundary", b)}
          onKeyDown={(e) => boundaryKeys(e, b)}
          {...handlers}
        />
      ))}
      {overlay ? <div className="pointer-events-none absolute inset-0">{overlay}</div> : null}
    </div>
  );
}

/**
 * The day the strips show: every hall's hours with an hour either side,
 * rounded to whole hours. With no hours set yet, a working day to draw on (a
 * viewing default, not a tournament value).
 */
export function viewRangeOf(spans: Window[]): ViewRange {
  if (spans.length === 0) return { start: 8 * 60, end: 20 * 60 };
  const start = Math.max(0, Math.floor((Math.min(...spans.map((s) => s.from)) - 60) / 60) * 60);
  const end = Math.min(24 * 60, Math.ceil((Math.max(...spans.map((s) => s.to)) + 60) / 60) * 60);
  return { start, end };
}
