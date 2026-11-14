# Design system

The visual language for the badminton tournament planner. Read this before building or changing any UI. Tokens live in `src/app/design-tokens.css`; this file explains how to use them.

There are two themes, **Light** and **Dark**. Both follow the same rules; only the values change. Where this document and the reference screens disagree, the screens win and this file should be corrected.

## 1. Principles

1. **Neutral ground, specific cards, one accent.** Most of the screen is a near-neutral surface. Cards carry a few specific tints. One accent colour (`primary`) marks the main action and selection.
2. **The surface sets the mood, the text provides contrast.** Light has a warm surface with cool text. Dark has a cool surface with warm text. Secondary text is a neutral between them.
3. **One text family per theme.** Hierarchy comes from size, weight and the primary/secondary step. Never from a different hue: headings are not green.
4. **Accent means selected or primary. Status colour means status.** They are separate tokens and never swap roles.
5. **Time is the main object.** The timeline, the fit status and the worst-case marker are the most important visuals. Everything else supports them.
6. **Calm at the desk, loud on court.** Plan mode (desktop) is dense and quiet. Live mode (phone, wall board) uses the Dark theme, huge numerals and big tap targets.
7. **State is never colour alone.** Every status has a word ("Fits", "Tight", "Over", "Live").
8. **Shuttle yellow is its own token, apart from the accent.** `shuttle` marks a live match, the profit tile, the final and a chosen court. It is always a fill or an outline with dark text, never the selection colour.
9. **No tournament values in components.** All names, times, fees and counts come from data. Sample values belong in tests and stories only.

## 2. Themes

| Theme | Where | How to apply |
|---|---|---|
| Light (default) | Desktop planning screens, results page | Nothing. It is the `:root` default, in `src/app/design-tokens.css` |
| Dark | Planning screens when the organiser picks dark (or the device is dark and they haven't chosen) | `class="dark"` on `<html>` (next-themes, `attribute="class"`). Its values are in the `.dark` block of `src/app/globals.css` |

The theme menu (Settings, in the sidebar) offers Light, Dark and System. There is no separate Live theme: every stage, Live included, is built in Light and Dark and follows the menu, with the same layout, spacing, text levels and colour rules as Plan and Draw.

## 3. Colour

### Light
| Token | Value | Use |
|---|---|---|
| `background` | `#F2EFE9` | Ground of the working area (with the dot matrix); the workbench shares it |
| `card` | `#FAF8F4` | Sidebar, popovers, unselected option cards |
| `inset` | `#E9E5DC` | Fields, timeline tracks, segmented wells, nested panels |
| `border` | `#DDD8CC` | Dividers and card outlines |
| `input` | `#E9E5DC` | The field fill. Fields have no border, so this is no longer a border colour |
| `foreground` | `#0F2A1F` | Primary text and headings. A very dark cool green-black |
| `muted-foreground` | `#615D56` | Secondary text. A warm neutral grey |
| `primary` | `#0F6B45` | Accent: main button, selection |
| `primary-foreground` | `#FFFFFF` | Text on the accent |
| `accent` | `#E9E5DC` | Hover wash only. Not the brand accent |
| `card-system` | `#EADFCB` | Cards and raised blocks: tournament cards, the hall settings panel, cards in the workbench |
| `field-raised` | `#E1D6C1` (hover `#DFD4BE`) | A field, well or secondary button on a card: one shade darker than the card |
| `field-on-inset` | `#DFDACE` (hover `#DBD6C9`) | The same on an inset block |
| `surface-inset-hover` | `#E2DDD1` | A field on the ground, hovered |
| `card-selected` | `#DCE7E4` | The selected format option |

### Dark
| Token | Value | Use |
|---|---|---|
| `background` | `#071F15` | Ground of the working area (with the dot matrix); the workbench shares it |
| `card` | `#0D3022` | Sidebar, popovers, unselected option cards |
| `inset` | `#1C4838` | Fields, timeline tracks, segmented wells, nested panels |
| `border` | `rgba(239,232,209,.22)` | Dividers and card outlines. A cream hairline |
| `input` | `#1C4838` | The field fill |
| `foreground` | `#EFE8D1` | Primary text and headings. Warm cream |
| `muted-foreground` | `#ABB4AF` | Secondary text. Neutral grey |
| `primary` | `#F8D15E` | Accent: main button, selection. Butter |
| `primary-foreground` | `#1A1400` | Text on the accent |
| `card-system` | `#124030` | Cards and raised blocks: tournament cards, the hall settings panel, cards in the workbench |
| `field-raised` | `#1C4838` (hover `#1F4D3C`) | A field, well or secondary button on a card: one shade lighter than the card |
| `field-on-inset` | `#124030` (hover `#1A4636`) | The same on an inset block |
| `surface-inset-hover` | `#1F4D3C` | A field on the ground, hovered |
| `card-selected` | `#0F4A43` | The selected format option |

### Other tokens (unchanged by the two themes above)
| Token | Value | Use |
|---|---|---|
| `tile`, `tile-border` | `#E3F6E8`, `#A9D9B8` (dark `#124030`, `#2A6B4C`) | Court tiles |
| `court`, `umpire` | `#0F6B45`, `#8FB0FF` | The court face and its umpire spots; the same in both themes. The blue is the lightest that reads as bright blue and keeps 3:1 on the court |
| `shuttle` | `#F4C430`, text on it `#1A1400` | Live match, profit tile, final, chosen court (principle 8) |
| `feature` | `#0A4A31` | The deep-green block, kept for the results page |
| `turf`, `turf-2`, `mint` | `#0F6B45`, `#14804F`, `#BDF2C9` | Kept as tokens; no longer used for headings, buttons or selection |

### Where the accent is used
Use `primary` for:
- the main button (New tournament)
- the selected radio dot and the selected format card's outline
- the active tab underline (the label stays primary text)
- the selected segment in a segmented control (accent fill, `primary-foreground` label)
- the 3px underline under the "next step" link in the workbench's status line, on hover and focus

Do not use the accent for: body text, headings, status, large fills, or more than one main button per screen.

### Text rules
- Primary text (`foreground`) is for body text, headings, field values and active labels.
- Secondary text (`muted-foreground`) is for captions, placeholders, times, descriptions and inactive tabs.
- Headings use `foreground`. They are not green.

### Status
| State | Fill | Text | Used for |
|---|---|---|---|
| Fits | `#58C27D` | `#07241A` | Schedule fits available court time |
| Tight | `#FFB020` | `#2A1A00` | Little buffer or thin margin |
| Over | `#D8402F` | `#FFFFFF` | Needs more court time, worst-case marker |
| Live | `#F4C430` | `#1A1400` | Match in progress |
| Off | `#E4E7E5` | `#2B343C` | Not booked, finished |

Status colours are the same in both themes and are used only for status: the workbench's health bar and chip, the worst-case flag and line. They are never used for selection, and the accent is never used for status. The health bar's filled bars and its chip always use the same status token; before the plan is complete the bar is empty and the chip reads "Incomplete".

### Timeline blocks
| Block | Light | Dark |
|---|---|---|
| Group | `#A9C3A0` | `#62B584` |
| Knockout | `#3F5D4B` | `#D3EEDB` |
| Bronze | `#C97B2E` | `#C97B2E` |
| Final | `#E9B949` | `#E9B949` |

Each block has a 1px outline `rgba(0,0,0,.25)`. The now line is the primary text colour. The worst-case line and label are `#D8402F` (dark `#FF7A6E`).

**Exception (26 Oct 2026, product owner's decision):** the worst-case line and its flag follow the fit status rather than always being red: neutral (foreground) when the plan fits, Tight when it fits only at typical length, Over when it doesn't fit or matches run past their court's hours. The flag always carries the words "Worst case" and the time.

### Contrast rules
- Primary text: 7:1 or better everywhere. Secondary text: 4.5:1 or better on every surface it sits on; check a new surface before putting secondary text on it. Large text (24px and up): 3:1.
- Yellow is never text on a light surface. Green text on a light surface is only `#0F6B45` or darker.
- `border` is for dividers and outlines that carry no meaning. A control's edge that must be seen (a checkbox, a dashed "add" box) uses `foreground` at 30–40%. `input` is a fill, not a border.
- Status as text (messages, figures, labels) uses the darker text shades, never the fill colours, which are too light (Fits, Tight) or too low-contrast (Over, 4.0:1) for small text on white: Fits text `#1A7343`, Tight text `#8A5200`, Over text `#B42B1C` (Dark: `#58C27D`, `#FFB020`, `#FF7A6E`). Tokens `--status-*-text` in `globals.css`; utilities `text-fits-text`, `text-tight-text`, `text-over-text`. (Added 26 Oct 2026.)
- Over as a fill behind text (chips, the loss tile, badges) uses `#C6372A` (`--status-over-strong`): white on `#D8402F` is 4.47:1, just under AA for small text. `#D8402F` stays for lines, markers and outlines.

### Dot matrix (working-area background)
The working area, which holds the venue (halls and courts), the timeline and the workbench, has a dot-matrix background, like a planning pad.

- Apply the `.workspace-dots` class to the one container that holds the main column and the workbench. The timeline's glass carries the same dots (see "Glass").
- It uses `--dot-color`, `--dot-size` (1px) and `--dot-gap` (22px). Do not hard-code them. Light dots are `rgba(15,42,31,.16)`, Dark `rgba(239,232,209,.09)`: the primary text colour at low opacity.
- Not on the sidebar, cards, fields, popovers, dialogs or the Live board.
- The workbench has no fill of its own: the dots run behind it.
- Cards and fields are opaque and sit on top of the dots. The dots must never show through them.
- It is static: fixed to the window, so it doesn't move as panes scroll, with no animation.

### Glass (the timeline)
The timeline is frosted glass over the venue, so the two read as one space: halls and courts scroll under it and show through, blurred.

- `.glass` on the timeline: the ground colour at `--glass-tint`, a 14px backdrop blur, and the dot matrix.
- `--glass-tint` keeps secondary text above 4.5:1 with a court behind it: 82% in Light, 70% in Dark (62% is the floor in Dark; it is a little denser so row labels read easily). Check before lowering it.
- The timeline is one sheet of glass: its sticky labels and ruler have no fill of their own. Rows fade out over 8px as they scroll under them, so nothing shows through behind the labels or the times.
- The glass starts at the soft divider above the timeline, with no gap between the line and the glass.
- Under `prefers-reduced-transparency` both are solid `background`.
- Glass is for the timeline only. Do not use it on cards, fields, popovers or dialogs.

### Surfaces: warm in Light, cool in Dark
- In Light every surface is warm and light: the ground, cards, fields, wells, hover fills. In Dark every surface is cool. The exceptions are the accent, the two text colours, and the specialised colours (the court and its lines, status colours, timeline blocks, the umpire blue).
- A step from a surface (a field on a card, a hover fill) is a token of its own. Never make one by mixing the text colour into the surface: the text colour is cool in Light and warm in Dark, so the mix breaks the rule.
- A field on the ground is `surface-inset`. On a card it is `field-raised`; on an inset block `field-on-inset`. Components read `--field` and `--field-hover`, which the surface sets, so a field needs no class of its own.
- Every step keeps secondary text at 4.5:1 (the Light hover on a card is 4.46:1, held only while hovering).

### Lines and borders
- Dividers, card outlines and dashed "add" boxes that only separate use `border`: a warm grey in Light, a cream hairline in Dark.
- Fields have no border. They are filled with `inset`.
- Active and selected states use `primary`, not `border`.
- The shell keeps its own rules (see "Surfaces in the shell"): the sidebar has no borders, and the workbench and timeline sit behind open dividers.

## 4. Typography

| Role | Font | Weight | Size | Notes |
|---|---|---|---|---|
| Screen heading | Barlow Condensed | 700 | 30px | Uppercase, `foreground` |
| Card heading | Barlow Condensed | 700 | 24–28px | Uppercase, `foreground` |
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

- **Spacing is a 4px grid.** Every padding and gap is one of 4, 8, 12, 16 or 24px (Tailwind 1, 2, 3, 4, 6); no 2, 6, 10, 14, 18 or 20px one-offs. Typical uses: 4px around small edit and hover boxes (with 8px either side of text), 8px inside chips, tiles and menus, 12px inside inset blocks, 16px around sections and panes, 24px between major regions. Control sizes (32px controls and stepper buttons) are set by the controls, not the grid.
- **No cards inside cards.** Panels (the workbench tabs, figure panels) are flat sections divided by a 1px `border` rule, not framed cards. Inside a section, at most one level of `inset` blocks (one per category or line); nothing framed inside those. Halls sit flat on the venue, divided by a rule.
- **Scrollbars:** never take room in the layout and are not shown at rest. The browser's own scrollbars are hidden everywhere. While a pane is being scrolled, a 4px rounded thumb (`foreground` at 40%) lies over its edge, 2px in. It can be dragged to scroll: its grab area is 12px across, and it thickens to 6px while held. It fades 3 seconds after the last scroll or touch of it (`ScrollHints` in `src/components/ui/scroll-hints.tsx`). Panes use the full 16px side padding on both sides.
- Radii: cards 14px, tiles 12px, controls 8px, timeline blocks 3px, chips fully round.
- Borders 1px `border`. Cards get `box-shadow: 0 1px 0 rgba(10,42,27,.04)`, no heavy shadows.
- Controls are 32px high in Plan (dense, desktop): inputs and selects with 14px text, buttons 32px (small 28px), steppers 32px, segmented controls 32px with 24px segments. Live's touch screens use 44px or more.
- **Plan layout:** three panes. The shell never scrolls as a page; each pane scrolls on its own. Sidebar 280px, collapsible to a 40px rail; the main column flexible (`min-width: 0`) with the 960px central column; the workbench 440px, folding to a 40px rail. The health bar sits at the top of the workbench, under its title menu. Below about 1000px wide the right pane stacks under the centre. (Plan mode is desktop only and keeps a 1024px minimum width, so in practice this applies to the results page.)
- **Live layout:** the wall board is a grid of widgets. The phone is two full-width tap halves with Undo, Fault and End set below.

### Surfaces in the shell
- The sidebar is the app's own space: `--card`, no borders (the change of colour is its edge; spacing separates its sections).
- Everything about the open tournament sits on one surface, `--background`, in a central column at most 960px wide, centred in the space the workbench leaves.
- The workbench (440px, from 16px below the shell's top, level with the name row) and the timeline (between the sidebar and the workbench) sit on the same surface, each behind one open, soft `--border` line; no cards, no lines across the timeline. Both fold away (to a 40px rail, or a 40px bar).

### Text levels in Plan
Plan is dense, so it uses four sizes only; weight and colour set the level within a size, not another size.

| Level | Size | Use |
|---|---|---|
| Heading | 24px Barlow Condensed 700, uppercase, `foreground` | A hall or page heading; the product name |
| Section | 20px Barlow Condensed 700, uppercase, `foreground` | A section of the workbench; the Timeline and Tournaments titles |
| Text | 14px Barlow | 600 for sub-headings, tabs, buttons and option titles; 600 in `muted-foreground` for labels; 400 for values and body; 400 in `muted-foreground` for notes |
| Caption | 12px Barlow | Hints and option descriptions, labels inside time fields, times on tracks, chips (700) |

No 13, 15, 16 or 17px text in Plan. The numerals drawn on courts are part of the drawing and sit outside the scale.

### The 40px rule
- Containers and the shell are multiples of 40px: sidebar 280, central column 960 at most, workbench 440, rails 40, court cards 200.
- Fields, buttons and other small controls are not: they size to their content and share their row (auto layout).

### Spacing scale
| Gap | Use |
|---|---|
| 4px | Icon to its text; a label to its value; a field to its help |
| 8px | Controls side by side in a row |
| 12px | Rows inside one group |
| 16px | Padding inside a panel or pane; the shell's edge to content |
| 24px | Between sections |

Everything in a panel shares one left edge; a row never carries padding of its own (a highlight is drawn with an offset outline). Dividers between panes are open: they stop 16px short of the shell's edges.

### Errors
A wrong value gets a red outline, with the reason in the tooltip and the accessible description. No message is printed under a field. A panel's summary line carries the visible message.

## 6. Components

- **Buttons.** Primary: `primary` fill with `primary-foreground` text (green in Light, butter in Dark); one per screen. Secondary (`outline`): a soft `inset` fill, no border, a step stronger on hover. Icon buttons (`ghost`): a square hugging the icon, no fill or border until hovered, never highlighted just for being expanded.
- **Fields.** A soft box (`--field`, set by the surface it sits on), no border, focus ring on focus. One text style for every field: 14px regular; a value is `foreground`, an empty field shows a quiet "–" (or a date's "dd/mm/yyyy", a time's "--:--", "Choose") in `muted-foreground`. **Its name is a 12px `muted-foreground` caption above it, one line, always there**, so a filled field still says what it is; a caption too long for its column is cut with "…" and shown in full on hover. The exceptions keep the name inside the box: the tournament's first row (name, date, time zone), where the tournament name's value is also semibold because it is a title.
- **Help on fields.** Nothing sits beside a field. Its help, and what is wrong with its value, show in a tooltip when the field is hovered or focused, and are its description for screen readers. A wrong value also outlines the field in `destructive`. ⓘ is only for headings and sub-headings.
- **Inline fields.** Fields set in a line of text (a hall's heading row: Opens, Closes, Time unit, Rate). Label in `muted-foreground`, value after it, no box; a soft `inset` fill on hover and the focus ring on focus; a wrong value gets a 2px `destructive` underline and its reason in the tooltip. Times can be typed, or stepped by the hall's time unit with the small chevrons (Alt+Up and Alt+Down).
- **Confirmation dialog.** Every "are you sure" uses the product's dialog (`useConfirm` in `src/components/ui/confirm.tsx`), never the browser's. `card` fill, 1px `border`, 16px padding, 400px wide, over a dimmed backdrop. Title: the question, 14px semibold. Body: what happens, 14px `muted-foreground`. Buttons at the right: Cancel (secondary), then the action named by its verb ("Clear hall", not "OK"). An action that removes data uses the destructive button and Cancel has the focus. Esc cancels; focus returns to what opened it.
- **Court row.** A hall's courts sit in one row of 200px cards that never wraps, with "Add court" at its end. Courts past the column's edge are clipped, with a 24px fade at an edge that has more. The row slides when dragged (5px before a press counts as a drag), with a trackpad or Shift+wheel, and when a court gets keyboard focus. Adding a court slides to the end.

Build these once in `src/components/ui` (extend shadcn where it exists) and reuse them.

- **Button.** Primary: `primary` fill, `primary-foreground` text. Secondary: `inset` fill, `foreground` text, no border. Height 32px (small 28px), 14px text.
- **Input.** `inset` fill, no border, 8px radius, 32px high, 14px text. Placeholder (the label) in `muted-foreground`; the value in `foreground`.
- **Segmented control.** `inset` well. Selected segment: `primary` fill with `primary-foreground` label. Unselected: `muted-foreground`.
- **Stepper.** Minus, numeral, plus. Minus is dimmed (opacity .4) at zero. 32px high, 32px-wide buttons, 14px numeral.
- **Tabs.** Text tabs. Active: `foreground` label with a 3px `primary` underline. Inactive: `muted-foreground`. Wrap or scroll on narrow widths.
- **Chip.** Pill. Status chips use the status fill and label from the status table. Neutral chips use `inset` and `foreground`.
- **Radio option card.** `card` fill with a 1px `border` outline. Selected: `card-selected` fill, a 2px `primary` outline and a `primary` radio dot; its title stays `foreground`.
- **Health bar.** In the workbench, with one chip beside it. One small bar per hour of court time booked (2px gaps), filled for the court time the matches need in the typical case; a part hour is a part-filled bar. Up to 48 bars: with more hours booked, each bar stands for 2 hours, then 3, and so on, and the tooltip says what one bar is worth. Filled bars and the chip use the current status token (Fits, Tight, Over, by the worst-case rule); unfilled bars use `border`. Until the plan is complete the bar is empty and grey; with no court time booked it is one empty track.
- **System card.** `card-system` fill. Tournament cards in the sidebar add a 1px `border` outline; cards in the workbench and the hall settings panel are flat.
- **Groups of fields in the workbench.** One or two rows of fields sit under a 14px semibold heading with no card (entry fees, expected entries, group settings). A card (`card-system`) is for nested settings or more than three rows (a cost line, a team competition).
- **Umpire spots.** A 12px circle with a 2px ring on the court. Its target is an undrawn square 4px larger all round. At rest: court-green fill, white ring. Hover: the ring turns `umpire` blue. On: fill and ring are both `umpire` blue. Focus: a white outline outside the circle.
- **Side panel.** The right-hand pane is one pattern used twice: the Plan workbench, and the Draw stage's teams panel. 440px, no fill (the dots run behind it), an open divider at its left, a 24px heading with ✕ at its right, content with 16px side padding, folding to a 40px rail with a single chevron and its title sideways. Rows inside it are `card-system`.
- **Drag states.** The thing in hand: a 1px `primary` border with a 1px `primary` ring (a draw entry), or a 2px `primary` ring (a game on the timeline). The place it would land: a dashed `primary` border on `card-selected` (a draw entry to swap with), or a dashed `primary` ghost on `primary` at 20% in a gap opened by sliding the following games along (the timeline). A drop that isn't allowed: a 2px `destructive` ring and a short reason beside the pointer. Sliding takes 150ms and is instant under reduced motion.
- **Court on the Live board.** The court face as planned, with a chip at the top in place of the group menu and the score under the net. Chips sit on court green, so they don't use the status tokens: On court is `shuttle` with `shuttle-foreground`; Up next, Free and Done for today are white on black at 30% (white on a lighter tint fails 4.5:1). The score is Barlow Condensed 700, 20px (14px on a medium court).
- **Score entry.** A grid: a 12px caption per game at the left, then one 40px-high number box per side, Barlow Condensed 20px, centred, the winning side's number bold. The side's name is a 12px caption over its column. A refused score puts a `destructive` outline on both boxes and the reason under them in `over-text` 12px.
- **Form dialog.** For a change that needs a few choices first (award a match, withdraw an entry, decide a tie). Built like the confirmation dialog: `card` surface, 480px wide, 16px padding and gaps, a 14px semibold title with one line of secondary text under it, the choices, then the actions at the bottom right with Cancel first. A choice is a full-width bordered row with a semibold label and a 12px line saying what it does; the chosen one has a `primary` border and ring. A field's caption sits above it at 12px.
- **Awarded match marks.** "W/O" (walkover) and "Ret." (retired) follow the score in the same type as the score; on the bracket they sit after the winner's score at 12px semibold.
- **Withdrawn.** The entry's name in secondary text, struck through, with an outline chip "Withdrawn". Never red: it is a fact, not an error.
- **Log entry.** A `card-system` row, 12px padding: the time in 14px semibold tabular numerals (48px column), then a chip for the kind (`off`; outline for a reversal), "by Desk" at 12px, the sentence at 14px and the note at 12px secondary. Reverse is an outline button at the right. A reversed entry's sentence is secondary and struck through.
- **Games on the Live timeline.** Finished: 40% opacity. On court: a 2px `shuttle` outline. Neither shows the grab cursor.
- **Panel tabs.** The tabs at the top of a side panel (Setup / Schedule / Budget; Games / Entries): 20px semibold, starting 16px in with the panel's content, the active one in the text colour with a 4px `primary` underline. A 1px `border` line runs under the row, inset 16px each side, on the same line as the underline. It is the only divider inside the panel.
- **Selection outline.** A chosen court or group card: a 3px `primary` ring with a 2px gap in the page colour. `primary` is the selection colour of each theme (dark green in Light, yellow in Dark); shuttle yellow is never used for selection in Light.
- **Group card of entries.** A `card-system` card with 4px padding: a heading row (the group's name at 14px semibold; at the right the entry count, or while Live the three counts at 12px semibold in `fits-text`, `tight-text` and `over-text`: "4 in", "3 not yet", "1 absent"), then the entries as rows with no fill of their own (hover: raised field).
- **Game card.** A `card-system` card, 12px padding and gaps. Closed: the time-and-place line at 12px secondary with a caret at the right, the two sides at 14px semibold, then the On court chip (shuttle), the score (20px display bold) or "N players not checked in" (12px semibold `tight-text`). Open: two score boxes side by side under the two names at 12px, their placeholder at 14px regular; the main button, Award match… (ghost) and the reason beside them; then the players. A waiting game that can be moved shows the grab cursor.
- **Court frame (Games tab).** A court is a `court` green block, 4px padding, 8px radius, with "Court 3 · Free" in white at 12px semibold; its game sits inside as a `card-system` card. While a game is dragged: frames that can take it get the selection outline; the others drop to 50% opacity.
- **Opened-entry inset.** `card-inset`: a block opened inside a card. Light: a step darker than the field shade (#D9CDB5), with secondary and status text a step stronger on it to keep 4.5:1. Dark: a step darker than the card (#0C2F22). Rows inside it (an entry's matches) are `card-system`, so they read as raised. Used for the whole of an opened entry: in the Entries list (row and details together) and under a game card.
- **Chosen game on the timeline.** A 3px `primary` outline with a 1px gap, above its neighbours. It replaces the on-court outline while chosen.
- **Simulation bar.** At the top of the side panel: a `card-system` bar, "Simulation." in semibold then "Watch only; nothing is saved." and an outline End simulation button at the right.
- **Page sections (Resources).** Each section starts with a top border and 16px above its heading; the heading is 20px semibold in the text colour with one line of secondary text under it.
- **Document card.** A `card-system` card, 12px padding and gaps: the name at 14px semibold, what it is at 12px secondary, its count at 12px semibold, anything left out at 12px in `tight-text`, then the actions at the bottom (Preview outline, Print primary).
- **Paper.** A document on screen (in a preview) is white with black text in both themes, 24px padding, inside the wide form dialog (820px). Documents are set in points and millimetres, as they print.
- **List row (kit, checklist).** A `card-system` row, 8px by 12px: a tick box (or, for an item the app checks, a filled green tick or an empty circle), the text at 14px semibold with a 12px second line, then its link or note, and for kit the quantity at 20px display bold in a 48px column. A ticked row's text is secondary and struck through.
- **Rail.** A folded side panel: 64px wide, the whole of it a button with the `inset` fill on hover. A 20px caret at the top, then text running down it at 20px semibold; the Plan rail's health bar is 12px wide.
- **Game card (replaces the earlier one).** A `card-system` block, 6px radius, 8px padding. Closed, one line at 14px semibold: home left, "vs" at 12px secondary centred (or the score in 20px display bold), away right, a caret. Due on a court with a player not checked in: the `tight` fill with its dark text. Open: the names at 20px semibold. In a court's frame its text starts on the same line as the frame's label.
- **Court frame (Games tab).** `court` green, 8px radius, 4px padding; a 12px label line in white ("Court 1" semibold, then what the game is); the game card inside. Free: a dashed white box 36px high in place of the card.
- **Clock.** The time in the Live panel's tab row: 24px display bold, tabular.
- **Simulation controls.** Icon buttons on the stage row with filled icons in status text colours: Play `fits-text`, Pause `tight-text`, Stop `over-text`; unavailable at 50%.
- **Tick rows (prizes).** In a `card-system` box: a tick box, the place at 14px (secondary when unticked), and a 128px amount field at the right, disabled when unticked.
- **Matches-played bar.** One row, 40px high, its sections 2px apart, the ends rounded. Each section is as wide as its share (`fr`), never under 3.5rem. Fills are the timeline's stage colours: `tl-group`, `tl-knockout` (every knockout round), `tl-final`. The number is the display face, 20px bold, in the stage's text colour (`tl-group-foreground`, `tl-knockout-foreground`, `tl-final-foreground`: dark, white, dark in Light; the dark ground on all three in Dark). Labels above are 12px: the name semibold, the count muted.
- **Stage zones and the buffer** are flat, see-through fills, with no hatching: `zone-group` is `tl-group` at 50%, `zone-ko` is `tl-knockout` at 50%, `zone-buffer` is `foreground` at 22%. A buffer past closing takes the `tl-worst` tint instead. The KO zone's label is the dark ground in Dark (its wash is pale there). Hatching is kept only for a gap in a hall's rate bands.
- **Tie links.** `tl-link`: in Light the Dark theme's ground (#071F15), in Dark the Light theme's ground (#F2EFE9). A staple is a 10×4px rounded bar across the join of two pills; a thread is a 1.5px line. Marked (their tie is chosen): `primary`, the thread 2.5px.
- **Court called.** `court-call`: the accent outline of `court-news`, pulsing every 1.4s until the desk touches the court. Reduced motion: a steady outline.
- **Buffer past closing.** The buffer block takes a `tl-worst` tint (30%) and a 1px `tl-worst` inset ring.
- **Held.** One neutral grey, `held` (Light #7A7672, Dark #6E6A66), for a thing that can't go ahead because a player isn't checked in. It is the fill of a waiting court (white text on it) and of a held game's block on the timeline, so the two read as the same thing. Neutral, not green, so it stays clear of the group and knockout greens.
- **Waiting court.** A court whose game can't start: the `held` fill, and (once the tournament has started) a slow fade to 40% opacity and back (1.8s, ease in and out) until the desk has looked at it. Reduced motion: no fade.
- **Court news.** New information on a court: a soft pulse of a 3px outline in `primary` (the accent: green in Light, yellow in Dark), 2px off the court, three pulses of 1s. Reduced motion: the outline, steady, for the 3 seconds.
- **Held game.** A waiting game that can't start: its card in the lists at 50% opacity in greyscale; its timeline block in the `held` fill.
- **Game time.** Two colours of its own, softer than Tight and Over (which stay for the plan's statuses): `time-near` (Light #F0D089, Dark #D9BC7A) from 80% of the slot and `time-over` (Light #E8A398, Dark #D4928A) past it, with `time-foreground` (#2A1A00) for text on either. Shown as a 10px dot (top right of a court; right of a game's header line, with a 1px ring on a pale card) and as the timeline block's fill. Never a whole card, and never a badge.
- **No state badges on Live.** A court or a game says where it has got to by how it is drawn: full strength (on), 60% with "Next" (due), grey (waiting), empty (free).
- **V/S.** Between a game's two sides: 20px regular (the lightest weight in use) in the secondary colour. A score in its place is 20px display bold.
- **Entry row.** An inset block (`field-raised`; `card-inset` when opened) in its group's card, 12px padding left and right, 12px between the place label and the name, 4px between rows. No chevron.
- **Board scale (the audience board only).** The one screen read from across a hall, so the text scale (24/20/14/12) and the 960 column don't apply to it. Its base size grows with its window, `clamp(10px, min(1.05vw, 1.9vh), 32px)` (about 20px on a 1920×1080 screen), and every size and space on it is in em of that: tournament name 2, clock 2.2, page and panel headings 1.3, names about 1, labels 0.75, status chips 0.7; spaces 0.4 to 1. A court tile sets its own text from its size (up to 1.6) so more courts make smaller tiles, not cut-off names; group tables grow up to 1.5 when there is room. Same tokens, fonts and flat panels as the app: tiles and panels `card-system`, Up next rows `card-inset`, On court `fits`, the call band `tight`. The board's controls are the app's own sizes.
- **Court sizes.** One setting for the whole venue, changed with the zoom icons on any hall's line and kept in the browser. Large (200px): everything. Medium (160px): outer box and net only, no name bands, the slot or player names in each half, the net line shortened ("W1"), hours and umpire circles kept. Small (120px): the box halved, slot or names, the group's name above, small blue dots for umpires, no hours or buttons; a click opens the whole court at Large in a popover (outside click or Esc closes it). The court number stays a faint watermark at every size.
- **Thin timeline.** One zoom step out from Whole day: every row is a 6px bar with 4px between, only hall names are labelled, bars carry no text, and the timeline's panel shrinks to fit. Zoom in, Fit play or Whole day restores the rows and the earlier height. Hover, drag, the playhead and the worst-case line work as before.
- **Card.** `card` fill, 1px `border`, 14px radius. Heading in Barlow Condensed uppercase `foreground`.
- **Court face.** Replaces the court tile in Plan (wireframe: `docs/design/court-face-wireframe.webp`). A court drawn from above in `--court` green with white lines (only the outer box, 2px at 90%, and the net, 3px, are heavy; the singles sidelines 10px in, the service lines and the centre lines are 1px at 50%), compact portrait (about 1.5 times taller than wide, at least 160px across). Surround: copy and delete icons at the top, the court's hours with up and down chevrons at the bottom. Inside: a name band at each end, each side's draw slot large in its half, one centred line above the net ("Wave 1 · R1/2", or the knockout match), the court number as a faint watermark (black at 18%, multiplied). With own courts per group, the top surround carries the court's group as a menu (every group of the tournament, with the courts it has, plus No group and Automatic split). Umpire spots at the four corners and the net ends, `--umpire` blue when on (3.5:1 on the court), white rings when off; each a 24px target.
- **Court panel.** The right pane in the Draw and Live stages (`pane-right-min` wide): the court's name as the card heading, then Now, Up next and Later today, each match an inset block (time and court, readiness chip, where it sits, both sides with their players and check-in chips). A chosen court is outlined with a 2px shuttle ring.
- **Group table.** In an inset block: compact rows (14px, tabular figures), status chip at the end, the qualifying cut as a 2px dashed `foreground` line under the last place through.
- **Bracket.** Rounds as columns, matches as 224px cards (code and time above, one row per side); the final outlined in shuttle; rounds spaced so each match sits between the two that feed it.
- **Stage switch.** In the top bar's centre: an inset well with one segment per stage (24px segments, 14px semibold); the viewed stage in `primary`; reached stages carry a tick; unavailable stages dimmed with a reason on hover.
- **Summary.** On the workbench surface like any section (no card): "SUMMARY" heading, status chip and a collapse chevron. Court time needed as numeral XL in `foreground` with "of" available time; 40-segment fit gauge in the status colour on a `border` track, the worst case as one `status-over-strong` segment; matches, revenue, cost and break-even as `inset` tiles; profit a shuttle-fill tile, loss a `status-over-strong` tile, always with the word. Collapsed, one line, profit in the fits text colour and loss in the over text colour.
- **Fit gauge.** 40 segments, `gauge-on` filled, one `gauge-warn` segment at the worst-case position, the rest `gauge-off`. The segment count is fixed, the fill is computed.
- **Timeline.** Time axis with hourly ticks, one row per hall band, a stages row, one lane per court. Blocks use the timeline colours and a 1px outline. Now line is solid, worst-case line is dashed red with a labelled flag. A buffer zone is hatched.
- **Stat tile.** Label above, numeral L below. Profit is a shuttle-fill tile.
- **Match row.** Time, court badge, pairs, state chip. Used for "Up next" and umpire lists.
- **Standings table.** Light header bar, qualifying rows carry a mint left edge, a dashed line marks the cut.
- **Live match card.** Dark green card, LIVE chip, two rows of pair name and set boxes, current set in shuttle yellow.
- **Suggested lever.** Bordered in amber, title, projected result, Preview button. Never applied automatically.

## 7. Accessibility

- Real `<button>`, `<a>`, `<input>`. A field whose label is shown inside it carries the label as `aria-label` and `title`. Icon-only buttons need `aria-label`.
- Visible focus ring (`ring`, 2px, 2px offset) on every interactive element.
- Timeline blocks reachable by keyboard. Arrow keys move between matches.
- Respect `prefers-reduced-motion`. No animation is required to understand state.
- Charts need a text summary (`aria-label` or a visually hidden description).

## 8. Do and do not

**Do**
- Use tokens, never raw hex, in components.
- Keep surfaces near-neutral; let cards carry the tints.
- Use `primary` for selection and the one main action.
- Use the status tokens, with a word, for status only.
- Switch theme by changing the class, not by changing token values in components.
- Let numbers come from the calculation engine, formatted with `tabular-nums`.

**Do not**
- Fill a whole page, pane or card with a saturated colour.
- Use a different hue for headings than for body text.
- Use the accent for status, or a status colour for selection.
- Apply the dot matrix to anything except the working area.
- Use shuttle yellow as text on a light surface.
- Hard-code tournament values, court counts or times in components.
- Add a new colour without adding a token and updating this file.

## 9. Using this in Claude Code

1. `design-tokens.css` is in `src/app/` and imported at the top of `globals.css`; Dark's values are in the `.dark` block there.
2. Set up the two fonts (section 4) and add the variable classes to `<body>`.
3. The theme switch sets the `dark` class on `<html>`.
4. `workspace-dots` goes on the working-area container.
5. Use tokens for every colour, one component at a time. Run lint, type check and build after each.
6. Compare each screen in both themes against the reference screens before calling it done.
