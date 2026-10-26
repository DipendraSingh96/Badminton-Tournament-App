# Design system: Court green

The visual language for the badminton tournament planner. Read this before building or changing any UI. Tokens live in `src/app/design-tokens.css`; this file explains how to use them.

Visual reference: the "Variant 1 · Light surface, green accents" screen (saved as `docs/design/plan-venue-light.png`). Where this document and the picture disagree, the picture wins and this file should be corrected.

## 1. Principles

1. **Green is a signal, not a wallpaper.** Page and panel backgrounds stay near-white. Green appears on headings, primary actions, selected items, court tiles, timeline blocks and one deep-green summary card.
2. **Time is the main object.** The timeline, fit gauge and worst-case marker are the most important visuals. Everything else supports them.
3. **Calm at the desk, loud on court.** Plan mode (desktop) is dense and quiet. Live mode (phone, wall board) uses the dark theme, huge numerals and big tap targets.
4. **State is never colour alone.** Every status has a word ("Fits", "Tight", "Over", "Live").
5. **One accent.** Shuttle yellow marks the single most important thing on a screen: live match, profit tile, final. It is always a fill with dark text.
6. **No tournament values in components.** All names, times, fees and counts come from data. Sample values belong in tests and stories only.

## 2. Themes

| Theme | Where | How to apply |
|---|---|---|
| Plan (default) | Desktop planning screens, results page | Nothing. It is the `:root` default |
| Plan dark | Desktop planning screens, when the organiser picks dark (or the device is dark and they haven't chosen) | `.dark` on `<html>` (next-themes toggle in the top bar) |
| Live | Court wall board, umpire phone, control desk | `data-theme="live"` on the layout root |

**Plan dark** (added 26 Oct 2026) is derived from the Live palette so the two dark themes feel related, but keeps the Plan roles: background `#071F15`, card `#0D3022`, inset `#124030`, border `#2A6B4C`, input `#4F9A72` (3:1 on card), text `#F3F7F2`, muted `#A9C9B5`. The primary is mint `#BDF2C9` with dark text `#07241A`, and headings are mint, so shuttle yellow stays the one accent. Court tiles `#124030` with border `#2A6B4C`. Timeline blocks use the Live values (group `#1F8A4C`, knockout `#BDF2C9`, outline `rgba(250,250,242,.5)`, now line `#F3F7F2`); bronze and final are unchanged. The summary card stays `#0A4A31`. Tokens live in the `.dark` block of `src/app/globals.css`.

## 3. Colour

### Surfaces and text (Plan)
| Token | Hex | Use |
|---|---|---|
| `background` | `#F4F7F3` | Page ground |
| `card` | `#FFFFFF` | Cards, side panes, inputs |
| `inset` | `#EDF3EE` | Timeline tracks, segmented wells, nested panels |
| `border` | `#D5DFD7` | Hairlines around cards and panes |
| `input` | `#7F9A89` | Input and secondary button borders |
| `foreground` | `#0A2A1B` | Body text |
| `muted-foreground` | `#4A6556` | Labels, captions |
| `feature` | `#0A4A31` | The summary card only |

### Brand
| Token | Hex | Use |
|---|---|---|
| `primary` / `turf` | `#0F6B45` | Primary buttons, headings, selected tournament, active tab, knockout blocks |
| `turf-2` | `#14804F` | Hover and pressed states |
| `mint` | `#BDF2C9` | Text on deep green, tints |
| `accent` | `#E3F6E8` | Court tiles, soft highlights |
| `shuttle` | `#F4C430` | Accent fill. Text on it is `#1A1400` |

### Status
| State | Fill | Text | Used for |
|---|---|---|---|
| Fits | `#58C27D` | `#07241A` | Schedule fits available court time |
| Tight | `#FFB020` | `#2A1A00` | Little buffer or thin margin |
| Over | `#D8402F` | `#FFFFFF` | Needs more court time, worst-case marker |
| Live | `#F4C430` | `#1A1400` | Match in progress |
| Off | `#E4E7E5` | `#2B343C` | Not booked, finished |

### Timeline blocks
Group `#7FD6A0` · Knockout `#0F6B45` · Bronze `#C97B2E` · Final `#F4C430` · every block has a 1px outline `rgba(10,42,27,.35)` · now line `#0A2A1B` · worst-case line and label `#D8402F`.

**Exception (26 Oct 2026, product owner's decision):** the worst-case line and its flag follow the fit status rather than always being red: neutral (foreground) when the plan fits, Tight when it fits only at typical length, Over when it doesn't fit or matches run past their court's hours. The flag always carries the words "Worst case" and the time.

### Live theme
Background `#071F15` · card `#0D3022` · border `#2A6B4C` · text `#F3F7F2` · muted `#A9C9B5` · primary action shuttle yellow.

### Contrast rules
- Body text on any surface: 4.5:1 minimum. Large text (24px and up): 3:1.
- Yellow is never text on white. Green text on white is only `#0F6B45` or darker.
- Do not use `border` for anything that carries meaning; use `input` (3:1) for controls.
- Status as text (messages, figures, labels) uses the darker text shades, never the fill colours, which are too light (Fits, Tight) or too low-contrast (Over, 4.0:1) for small text on white: Fits text `#1A7343`, Tight text `#8A5200`, Over text `#B42B1C` (Plan dark: `#58C27D`, `#FFB020`, `#FF7A6E`). Tokens `--status-*-text` in `globals.css`; utilities `text-fits-text`, `text-tight-text`, `text-over-text`. (Added 26 Oct 2026.)

## 4. Typography

| Role | Font | Weight | Size | Notes |
|---|---|---|---|---|
| Screen heading | Barlow Condensed | 700 | 30px | Uppercase, `turf` colour |
| Card heading | Barlow Condensed | 700 | 24–28px | Uppercase, `turf` colour |
| Numeral XL | Barlow Condensed | 600 | 46px | Summary hero figure |
| Numeral L | Barlow Condensed | 600–700 | 30px | Stat tiles |
| Live score | Barlow Condensed | 700 | 56–150px | Wall board and phone |
| Body | Barlow | 400–500 | 16px | Line height 1.3 |
| Label | Barlow | 600 | 14px | `muted-foreground` |
| Caption | Barlow | 400–500 | 13px | Legends and hints |
| Chip | Barlow | 700 | 12px | Letter-spacing .04em |

- All numerals use `tabular-nums`.
- Set up with `next/font/google`:

```ts
import { Barlow, Barlow_Condensed } from "next/font/google";
export const barlow = Barlow({ subsets: ["latin"], weight: ["400","500","600","700"], variable: "--font-barlow" });
export const barlowCondensed = Barlow_Condensed({ subsets: ["latin"], weight: ["500","600","700"], variable: "--font-barlow-condensed" });
```

## 5. Space, shape, layout

- Base unit 4px. Card padding 16–18px, gaps 14–20px, page padding 24px.
- Radii: cards 14px, tiles 12px, controls 8px, timeline blocks 3px, chips fully round.
- Borders 1px `border`. Cards get `box-shadow: 0 1px 0 rgba(10,42,27,.04)`, no heavy shadows.
- Controls are 42px high on desktop and 44px or more on touch.
- **Plan layout:** three panes. Left list 280px fixed, centre flexible (`min-width: 0`), right workbench 400–480px. The summary card is sticky at the top of the right pane, with tabs beneath it. Below about 1000px wide the right pane stacks under the centre. (Plan mode is desktop only and keeps a 1024px minimum width, so in practice this applies to the results page.)
- **Live layout:** the wall board is a grid of widgets. The phone is two full-width tap halves with Undo, Fault and End set below.

## 6. Components

Build these once in `src/components/ui` (extend shadcn where it exists) and reuse them.

- **Button.** Primary: `primary` fill, white text. Secondary: white fill, `input` border. Accent: shuttle fill, only for the single key action on a screen. Height 42px.
- **Input.** White, 1px `input` border, 8px radius, 42px high. Label above in 14px muted.
- **Segmented control.** Inset well, selected segment `primary` fill with white text.
- **Stepper.** Minus, numeral, plus. Minus is dimmed (opacity .4) at zero. Buttons 44px square.
- **Tabs.** Text tabs with a 3px `primary` underline on the active tab. Wrap or scroll on narrow widths.
- **Chip.** Pill, status fill and text from the status table.
- **Card.** White, 1px `border`, 14px radius. Heading in Barlow Condensed uppercase `turf`.
- **Court tile.** `accent` fill, `tile-border`, 12px radius. Court icon (green court, white lines) on the left, court name in `turf` condensed, hours muted, current assignment below.
- **Summary card.** The only `feature` block. Shows "SUMMARY", Fits chip, court time needed as numeral XL in shuttle yellow with "of" available time, 40-segment fit gauge, matches tile, profit tile (shuttle fill).
- **Fit gauge.** 40 segments, `gauge-on` filled, one `gauge-warn` segment at the worst-case position, the rest `gauge-off`. The segment count is fixed, the fill is computed.
- **Timeline.** Time axis with hourly ticks, one row per hall band, a stages row, one lane per court. Blocks use the timeline colours and a 1px outline. Now line is solid, worst-case line is dashed red with a labelled flag. A buffer zone is hatched.
- **Stat tile.** Label above, numeral L below. Profit is a shuttle-fill tile.
- **Match row.** Time, court badge, pairs, state chip. Used for "Up next" and umpire lists.
- **Standings table.** Light header bar, qualifying rows carry a mint left edge, a dashed line marks the cut.
- **Live match card.** Dark green card, LIVE chip, two rows of pair name and set boxes, current set in shuttle yellow.
- **Suggested lever.** Bordered in amber, title, projected result, Preview button. Never applied automatically.

## 7. Accessibility

- Real `<button>`, `<a>`, `<input>` with `<label>`. Icon-only buttons need `aria-label`.
- Visible focus ring (`ring`, 2px, 2px offset) on every interactive element.
- Timeline blocks reachable by keyboard. Arrow keys move between matches.
- Respect `prefers-reduced-motion`. No animation is required to understand state.
- Charts need a text summary (`aria-label` or a visually hidden description).

## 8. Do and do not

**Do**
- Use tokens, never raw hex, in components.
- Keep green off large background areas in Plan mode.
- Show a word with every status colour.
- Let numbers come from the calculation engine, formatted with `tabular-nums`.

**Do not**
- Fill a whole page, pane or card with green in the Plan theme.
- Use shuttle yellow as text on a light surface.
- Hard-code tournament values, court counts or times in components.
- Add a new colour without adding a token and updating this file.

## 9. Using this in Claude Code

1. Add `design-tokens.css` to `src/app/` and `@import "./design-tokens.css";` at the top of `globals.css`.
2. Set up the two fonts (section 4) and add the variable classes to `<body>`.
3. Start with the primitives in section 6, then the Plan layout, then the summary card and timeline.
4. Compare each screen against `docs/design/plan-venue-light.png` before calling it done.
