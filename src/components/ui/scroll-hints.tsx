"use client"

import { useEffect } from "react"

/** How long a scroll thumb stays after the last scroll or touch of it, in milliseconds. */
const LINGER = 3000
/** How long it takes to fade away, in milliseconds (the transition in globals.css). */
const FADE = 200
/** The room a thumb takes across a pane's edge to be easy to catch, in pixels; the bar drawn in it is thinner. */
const GRAB = 12
/** The shortest a thumb gets, so it can still be seen and caught in a long pane. */
const SHORTEST = 24

type Axis = "y" | "x"

interface Hint {
  bars: Record<Axis, HTMLDivElement>
  timer: number
  /** The pointer is on a thumb, or dragging it: it stays. */
  held: boolean
}

/** A pane's scroll measures along one axis. */
function measures(pane: HTMLElement, axis: Axis) {
  const view = axis === "y" ? pane.clientHeight : pane.clientWidth
  const full = axis === "y" ? pane.scrollHeight : pane.scrollWidth
  const length = Math.max(SHORTEST, (view * view) / full)
  return { view, hidden: full - view, length, room: view - length }
}

/**
 * Scroll thumbs that lie over the layout instead of taking room in it: the
 * browser's own scrollbars are hidden (globals.css). While a pane is being
 * scrolled a thin thumb shows where it is; it can be dragged to scroll, and
 * fades a few seconds after it was last used.
 */
export function ScrollHints() {
  useEffect(() => {
    const hints = new Map<HTMLElement, Hint>()

    const place = (pane: HTMLElement, hint: Hint) => {
      const box = pane.getBoundingClientRect()
      const left = box.left + pane.clientLeft
      const top = box.top + pane.clientTop

      const y = measures(pane, "y")
      const vertical = hint.bars.y.style
      if (y.hidden > 1) {
        vertical.display = "block"
        vertical.width = `${GRAB}px`
        vertical.height = `${y.length}px`
        vertical.left = `${left + pane.clientWidth - GRAB}px`
        vertical.top = `${top + (pane.scrollTop / y.hidden) * y.room}px`
      } else {
        vertical.display = "none"
      }

      const x = measures(pane, "x")
      const horizontal = hint.bars.x.style
      if (x.hidden > 1) {
        horizontal.display = "block"
        horizontal.height = `${GRAB}px`
        horizontal.width = `${x.length}px`
        horizontal.top = `${top + pane.clientHeight - GRAB}px`
        horizontal.left = `${left + (pane.scrollLeft / x.hidden) * x.room}px`
      } else {
        horizontal.display = "none"
      }
    }

    const drop = (pane: HTMLElement) => {
      const hint = hints.get(pane)
      if (!hint) return
      window.clearTimeout(hint.timer)
      hint.bars.y.remove()
      hint.bars.x.remove()
      hints.delete(pane)
    }

    /** Start (again) the wait before a pane's thumbs fade; they stay while one is held. */
    const linger = (pane: HTMLElement, hint: Hint) => {
      window.clearTimeout(hint.timer)
      if (hint.held) return
      hint.timer = window.setTimeout(() => {
        delete hint.bars.y.dataset.shown
        delete hint.bars.x.dataset.shown
        hint.timer = window.setTimeout(() => drop(pane), FADE)
      }, LINGER)
    }

    const show = (hint: Hint) => {
      hint.bars.y.dataset.shown = "true"
      hint.bars.x.dataset.shown = "true"
    }

    const thumb = (pane: HTMLElement, axis: Axis, hold: (held: boolean) => void) => {
      const el = document.createElement("div")
      el.className = "scroll-hint"
      el.dataset.axis = axis
      el.setAttribute("aria-hidden", "true")

      let drag: { at: number; from: number } | null = null
      let over = false
      el.addEventListener("pointerenter", () => {
        over = true
        hold(true)
      })
      el.addEventListener("pointerleave", () => {
        over = false
        if (!drag) hold(false)
      })
      el.addEventListener("pointerdown", (event) => {
        if (event.button !== 0) return
        event.preventDefault()
        el.setPointerCapture(event.pointerId)
        el.dataset.dragging = "true"
        drag = { at: axis === "y" ? event.clientY : event.clientX, from: axis === "y" ? pane.scrollTop : pane.scrollLeft }
        hold(true)
      })
      el.addEventListener("pointermove", (event) => {
        if (!drag) return
        const { hidden, room } = measures(pane, axis)
        if (room <= 0) return
        const moved = (axis === "y" ? event.clientY : event.clientX) - drag.at
        const to = drag.from + (moved / room) * hidden
        if (axis === "y") pane.scrollTop = to
        else pane.scrollLeft = to
      })
      const end = () => {
        if (!drag) return
        drag = null
        delete el.dataset.dragging
        if (!over) hold(false)
      }
      el.addEventListener("pointerup", end)
      el.addEventListener("pointercancel", end)

      document.body.appendChild(el)
      return el
    }

    const onScroll = (event: Event) => {
      const pane = event.target
      if (!(pane instanceof HTMLElement)) return
      let hint = hints.get(pane)
      if (!hint) {
        const made: Hint = { bars: {} as Hint["bars"], timer: 0, held: false }
        const hold = (held: boolean) => {
          made.held = held
          if (held) show(made)
          linger(pane, made)
        }
        made.bars = { y: thumb(pane, "y", hold), x: thumb(pane, "x", hold) }
        hints.set(pane, made)
        hint = made
        // Next frame, so a new thumb fades in rather than appearing.
        requestAnimationFrame(() => show(made))
      } else {
        show(hint)
      }
      place(pane, hint)
      linger(pane, hint)
    }

    // Scroll events don't bubble; capturing on the document hears every pane's.
    document.addEventListener("scroll", onScroll, { capture: true, passive: true })
    return () => {
      document.removeEventListener("scroll", onScroll, { capture: true })
      for (const pane of [...hints.keys()]) drop(pane)
    }
  }, [])

  return null
}
