"use client"

import { useEffect } from "react"

/** How long a scroll thumb stays after the last scroll, in milliseconds. */
const LINGER = 700
/** The thumb's thickness and its gap from the pane's edge, in pixels. */
const THICK = 4
const INSET = 2
/** The shortest a thumb gets, so it can still be seen in a long pane. */
const SHORTEST = 24

interface Hint {
  vertical: HTMLDivElement
  horizontal: HTMLDivElement
  timer: number
}

/**
 * Scroll thumbs that lie over the layout instead of taking room in it: the
 * browser's own scrollbars are hidden (globals.css), and while a pane is
 * being scrolled a thin thumb shows where it is, then fades. They only show;
 * scrolling stays with the wheel, trackpad, touch, keys and dragging.
 */
export function ScrollHints() {
  useEffect(() => {
    const hints = new Map<HTMLElement, Hint>()

    const thumb = () => {
      const el = document.createElement("div")
      el.className = "scroll-hint"
      el.setAttribute("aria-hidden", "true")
      document.body.appendChild(el)
      return el
    }

    const place = (pane: HTMLElement, hint: Hint) => {
      const box = pane.getBoundingClientRect()
      const { scrollTop, scrollLeft, scrollHeight, scrollWidth, clientHeight, clientWidth } = pane
      const left = box.left + pane.clientLeft
      const top = box.top + pane.clientTop

      const tall = scrollHeight - clientHeight
      if (tall > 1) {
        const length = Math.max(SHORTEST, (clientHeight * clientHeight) / scrollHeight)
        const room = clientHeight - length - INSET * 2
        Object.assign(hint.vertical.style, {
          display: "block",
          width: `${THICK}px`,
          height: `${length}px`,
          left: `${left + clientWidth - THICK - INSET}px`,
          top: `${top + INSET + (scrollTop / tall) * room}px`,
        })
      } else {
        hint.vertical.style.display = "none"
      }

      const wide = scrollWidth - clientWidth
      if (wide > 1) {
        const length = Math.max(SHORTEST, (clientWidth * clientWidth) / scrollWidth)
        const room = clientWidth - length - INSET * 2
        Object.assign(hint.horizontal.style, {
          display: "block",
          height: `${THICK}px`,
          width: `${length}px`,
          top: `${top + clientHeight - THICK - INSET}px`,
          left: `${left + INSET + (scrollLeft / wide) * room}px`,
        })
      } else {
        hint.horizontal.style.display = "none"
      }
    }

    const drop = (pane: HTMLElement) => {
      const hint = hints.get(pane)
      if (!hint) return
      hint.vertical.remove()
      hint.horizontal.remove()
      hints.delete(pane)
    }

    const onScroll = (event: Event) => {
      const pane = event.target
      if (!(pane instanceof HTMLElement)) return
      let hint = hints.get(pane)
      if (!hint) {
        hint = { vertical: thumb(), horizontal: thumb(), timer: 0 }
        hints.set(pane, hint)
      }
      place(pane, hint)
      const shown = hint
      // Next frame, so a new thumb fades in rather than appearing.
      requestAnimationFrame(() => {
        shown.vertical.dataset.shown = "true"
        shown.horizontal.dataset.shown = "true"
      })
      window.clearTimeout(hint.timer)
      hint.timer = window.setTimeout(() => {
        delete shown.vertical.dataset.shown
        delete shown.horizontal.dataset.shown
        shown.timer = window.setTimeout(() => drop(pane), 300)
      }, LINGER)
    }

    // Scroll events don't bubble; capturing on the document hears every pane's.
    document.addEventListener("scroll", onScroll, { capture: true, passive: true })
    return () => {
      document.removeEventListener("scroll", onScroll, { capture: true })
      for (const [pane, hint] of hints) {
        window.clearTimeout(hint.timer)
        drop(pane)
      }
    }
  }, [])

  return null
}
