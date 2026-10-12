# Wireframe context and decisions to date

A record of the context behind the Plan mode screens: the wireframes, the build brief, and every decision made along the way. Use it to look back on why things are the way they are.

Last updated: 12 October 2026, after build step 2 (venue canvas).

## 1. Sources of truth

| Document | Holds |
|---|---|
| `docs/PRD.md` | Product requirements: what the app must do |
| `docs/IA.md` | Information architecture v3: layout and content of the Plan mode screens. The build brief calls this `docs/information-architecture.md`; it is saved here as `IA.md`. |
| `docs/setup-inputs.md` | Inventory of every planner input, in three tiers. Written before halls existed: court windows, start/end time and a total umpire count have since been replaced by halls, rate bands and courts (section 5). |
| `docs/wireframe-context.md` | This file: wireframes, the brief, decisions and history |
| `CLAUDE.md` | Working rules for the codebase |

If this file and the PRD disagree, the PRD wins and this file should be corrected.

## 2. Wireframes

Three wireframes, supplied on 12 October 2026. They show layout and content, not visual style: a visual direction is still to be supplied (section 5, Design).

### 2.1 Venue and setup

![Plan mode: venue and setup](wireframes/01-venue-and-setup.webp)

- **Top bar:** "Product name", a theme (moon) button and an account button.
- **Left panel:** "New tournament +" button; "Previous tournaments" as cards (GZD 2026 to GZD 2022, each with a date). The selected card shows a **Duplicate** button.
- **Middle, header card:** Tournament name, Date (DD / MM / YYYY), Time zone (Europe/London).
- **Middle, Venue:** "Venue" heading with "Add hall +".
  - **Hall 1** card: "09:30 – 18:00 · 2 rate bands · 4 courts" and a **Hall settings** button.
  - Hall settings, open inline: Hall hours from / Until; "Copy settings from another hall"; "Rate bands across the day" as a strip (Off-peak plain from 09:30, Peak hatched from 15:00, ticks 09:30 / 15:00 / 18:00); band rows (Band name, From, Until, Rate £ per court per hour, remove ×); "Add band +"; a green check "Bands cover the hall's hours with no overlap".
  - Court cards: a top-down court drawing, "Court 1", "09:30–18:00 · 1 umpire". Court 2 is shown selected.
- **Right, Summary:** "Tight" badge; "Court time needed: 000 h of 000 h available" with a bar; tiles for Matches, Revenue, Total cost, Profit or loss, Break-even entries.
- **Right, Tournament setup tab:**
  - Tournament type as a segmented control: "Individual and pair events" / "Team". Note: "Team is always its own tournament. Choosing it replaces categories with a team line-up."
  - Categories as chips. Individual: Men's singles, Women's singles. Pair: Men's doubles, Women's doubles, Mixed doubles, Open doubles.
  - Format as large options: Groups then knockout, Groups only, Knockout only.

### 2.2 Schedule structure

![Plan mode: schedule structure](wireframes/02-schedule-structure.webp)

- **Middle:** Hall 1 with Courts 1–4 and a dashed "Add court" card; Hall 2 ("10:00 – 18:00 · 2 rate bands · 2 courts") with Courts 5–6, so court numbering continues across halls.
- **Right, Schedule structure tab:**
  - **Entries:** a card per category (e.g. Men's doubles, tagged "Pair"; Women's singles, tagged "Individual") with steppers for "Expected entries" and "Of which external".
  - **Structure:** segmented "Number of groups" / "Preferred group size"; steppers for Groups and Qualifiers per group; a Bronze match switch.
  - **Stages:** stage cards (cut off in the wireframe).

### 2.3 Finance

![Plan mode: finance tab](wireframes/03-finance.png)

- **Entry fees:** a card per category with a "Per player / Per entry" segmented control, Fee (£) and External fee (£).
- **Shuttles:** "Shuttles expected per game" stepper; "Cost entered" as "Per shuttle / Per tube of 12" with an amount and "= £0.00 per shuttle (calculated)".
- **Prizes:** rows of Category, Position (Winner, Runner-up), Amount (£), with remove; "Add prize +".
- **Other costs:** cards (e.g. Umpire food: Per person, Per umpire; Trophies: Fixed) with "Add cost +".
- **Other money in:** rows (e.g. Sponsorship, amount) with "Add income +".
- **Calculated (read-only):** Court hire, Revenue, Total cost, Break-even entries, Profit or loss.

## 3. The build brief: Plan mode screens

**Goal.** Replace the spreadsheet-style setup form with the three-area layout from the wireframes: tournament list on the left, venue canvas in the middle, workbench on the right.

**Scope.** Plan mode only, desktop only. **Out of scope:** Live mode, mobile layouts, draw and fixture generation, auth and roles.

**Main points of the brief**
- **App shell:** top bar (product name placeholder, account icon, light/dark toggle); left panel (New tournament, previous tournaments, most recent first); middle (inline-editable name, date and time zone, then the venue canvas, then the timeline); right workbench with a draggable width that is remembered between sessions.
- **Venue canvas:** halls containing court cards and an Add court card; Add hall below the halls.
  - Hall settings: hall hours, rate bands (new halls start with one band covering the hall's hours), a strip showing the bands across the day, validation (bands must not overlap and must cover the hours; gaps shown clearly), copy settings from another hall.
  - Court details: available from and until (defaults to the hall's hours; can be narrowed), umpires on the court, copy from the previous court, delete court.
  - Court hire per court: available time within each rate band × that band's rate. Only booked time is charged.
  - Timeline: one overall timeline with a lane per hall, rate bands as background shading, and each court's availability. Built so it can later show stages and match waves.
- **Workbench:**
  - Sticky summary: fit status, court time needed against available, total matches, revenue, total cost, profit or loss, break-even entries. Updates live.
  - Tournament setup tab: tournament type, categories, format, and rules (tiebreak order as an orderable list, handicap, eligibility, withdrawal rules, walkover rules). Rules are stored for the tournament, not per category. Individual and pair categories can be mixed. Open doubles is available under pair as well as team.
  - Schedule structure tab: expected entries with expected external entries; groups or preferred group size, qualifiers, bronze; a card per stage; buffer; a derived block (group size, matches, matches per entry in the group stage, waves in the group stage, total play time, court time needed, fit status, suggested wave distribution for multiple halls).
  - Finance tab: entry fees with an external fee; shuttles per game with a per shuttle / per tube of 12 toggle; prizes, other costs, other money in; a derived block; suggested levers as what-if cards that re-run the engine with one changed input and show the change in fit and profit (they suggest, never apply).
- **Inputs vs derived:** inputs are form controls; derived values are read-only and never look editable. No spreadsheet-style tables for inputs: cards, segmented controls, steppers and inline lists.
- **Behaviour:** recalculate live; keep the draft autosave; editing the venue or setup flags the tuned values it affects and never changes them silently; dependent fields (type decides the category form, format decides the format fields, any best-of-3 stage reveals the allowance, categories feed the prize list); duplicate tournament copies everything except name, date and results; inline validation and empty states.
- **Data and engine:** halls replace court windows; total umpires is derived from umpires per court; per-band court hire; add expected external entries, the per-tube shuttle option, other money in and the rules settings; migrate existing drafts.
- **Design:** shadcn/ui and Tailwind with tokens; light and dark; generous spacing, clear hierarchy, subtle motion; court cards with a simple top-down court drawing.

**Build order (each step demoable, each planned before code)**
1. Shell and layout: three areas, resizable right panel, sticky summary showing real engine values. **Done.**
2. Venue canvas: halls, courts, court details, hall rate bands, validation, the court hire engine change. **Done.**
3. Tournament setup tab, including rules.
4. Schedule structure tab.
5. Finance tab, including suggested levers.
6. Timeline.
7. Previous tournaments list and duplicate tournament.

**Acceptance**
- Changing any input updates the sticky summary immediately.
- A hall with peak and off-peak bands produces the correct court hire.
- A mixed singles and doubles tournament can be set up; a team tournament cannot include them.
- A duplicated tournament carries over everything except name, date and results.
- No tournament values are hard-coded in application code.
- Typecheck, lint and tests pass.

## 4. Where the brief and earlier decisions differ (as settled)

| Brief says | Settled as | Why |
|---|---|---|
| Lucide icons | **Phosphor** | The user kept the icon set already in use (CLAUDE.md says Phosphor). |
| Do not invent a brand | **Neutral tokens** | The earlier sporty high-contrast direction was withdrawn on 12 Oct; neutral until a direction is supplied. |
| Minutes per game and organising time on each stage card | **Per stage** (to be built in step 4) | The user chose the brief's model, reversing the 10 Oct per-event timing. The engine still has per-event timing until step 4. |
| Stage cards: group, knockout, finals | **Four cards**: group, knockout rounds, bronze, final | The user kept bronze separate. |
| Structure block shown once | **Per category** | Each category keeps its own groups, qualifiers and bronze. |
| Category chips (one per event) | **Several categories per event**, each renameable | e.g. Men's doubles A and B. |
| Court details panel (placement not specified) | **Floating panel beside the selected court**; the hall's other courts dim | User's choice. |

## 5. Decisions log

### Platform and tooling
- Next.js 16 (App Router), TypeScript strict, Supabase (connected; no tables yet), Vercel from `main`, Vitest. Repo: `DipendraSingh96/Badminton-Tournament-App`.
- Calculations live in `src/engine/` as pure functions with tests; ESLint blocks UI, framework and database imports there.
- Plans are saved in the browser (localStorage) until sign-in arrives in build slice 4. Saved shape: `badminton:plan-draft:v4`; older v3 drafts are migrated on load.
- Plan mode is desktop only (minimum width 1024 px), per the IA.

### Design
- 10 Oct: sporty high-contrast (shuttle yellow) chosen via the taste-skill. **Withdrawn 12 Oct:** neutral shadcn tokens until a visual direction is supplied.
- Light and dark themes with a toggle (next-themes), following the device until chosen.
- Status colours are semantic: success (fits, pays), warning (tight), destructive (doesn't fit, loss).
- Icons: Phosphor. Product name placeholder: "Tournament planner" (`src/lib/product.ts`).
- Accessibility: WCAG AA for text; at least 3:1 for input outlines and focus rings.

### Scope changes to the PRD (10 Oct)
- Teams, singles, and knockout-only and groups-only formats were brought into scope.

### Tournament structure
- Unit of play (tournament type) chosen once: individual and pair events, or team. Team is always its own tournament.
- Events: men's singles, women's singles, men's doubles, women's doubles, mixed doubles, Open doubles (doubles only: men's, women's and mixed pairs together).
- Format chosen once per tournament: groups then knockout, knockout only, or groups only. Structure (groups or preferred group size, qualifiers, bronze) is per category.
- Knockout only: every entry goes into the bracket; byes fill it; bronze needs at least four entries.
- Labels: individual events say "Expected entries"; team events say **"Expected teams"** with the people it means shown underneath (e.g. "= 48 pairs, 96 players").

### Teams
- The organiser sets the line-up of a tie: a rubber count for each of the six events. All rubbers are always played; the team winning most rubbers wins the tie.
- Each player plays one rubber, so a team's squad is the players its line-up needs (one per singles rubber, two per doubles rubber). No reserves.

### Time and scoring
- Scoring (points per game, deuce rule and cap/maximum, best of 1 or 3) is set per stage and applies to every event.
- Timing: set per event type since 10 Oct (minutes per game, organising time per match). **To move to the stage cards in step 4** (section 4).
- Best-of-3 allowance (11 Oct), set once by the organiser: typical best-of-3 length = (2 × minutes per game + organising) × (1 + allowance), capped at the worst case. Shuttle use for best of 3 gets the same allowance. Best of 1 is unaffected.
- Worst case: every game played, each at its longest possible length (from the deuce rule), plus organising.

### Venue (12 Oct)
- Halls have hours, rate bands (from, until, rate per court per hour) and courts. Bands must cover the hall's hours with no overlap; gaps and overlaps are named with their times.
- The day runs from the earliest hall opening to the latest closing. There is no separate tournament start or end time.
- Buffer is held back at the end of the whole day; a hall that closes earlier is unaffected. It is set in the Schedule structure tab.
- Court availability defaults to its hall's hours (stored as "follow the hall") and can be narrowed. Courts are numbered across halls.
- Umpires are set per court; the total feeds "per umpire" costs.
- Court hire per court: booked availability within each band × the band's rate. Booked time is charged, buffer included.
- Migration from court windows: each old window became a hall with one band at its rate and that many courts; the old umpire total was shared across courts.

### Finance
- Entry fee per player or per entry (player, pair or team), with an optional external fee and expected external entrants.
- Other costs: fixed, or per person (per player, per umpire, or a typed number of people).
- Court hire is calculated from the venue, not typed in.
- Break-even is found by re-running the format at each entry count, because entries change the format and the match count.

### Workbench and dashboard
- Sticky summary always visible; break-even uses the first category until the Finance tab lets the organiser choose.
- Every figure can be opened to show its working, with exact minutes so each line adds up.
- The summary lists what is missing and jumps to the field.

## 6. Build status

| Step | Status | Notes |
|---|---|---|
| Earlier slice 1 work (engine, plan form, dashboard) | Done | Commits from 7 to 11 Oct. |
| 1. Shell and layout | Done | Commits `3210483`, `13a0cb3` (12 Oct). |
| 2. Venue canvas | Done | Commits `5a7ca2c` to `c56e3ac` (12 Oct). |
| 3. Tournament setup tab and rules | Next | |
| 4. Schedule structure tab | To do | Includes moving timing to the stage cards. |
| 5. Finance tab and suggested levers | To do | Includes per-tube shuttles and other money in. |
| 6. Timeline | To do | |
| 7. Previous tournaments and duplicate | To do | |

**Still interim**
- The workbench tabs hold the older form sections until steps 3 to 5 replace them.
- The timeline card is an empty placeholder.
- The left panel shows only the current tournament; "New tournament" clears the plan.
- Break-even in the summary uses the first category.

## 7. Open questions carried forward
- Rules settings (step 3): what tiebreak criteria are offered, how handicap works, what eligibility rules look like, and the withdrawal and walkover rules.
- Waves (step 4): how a group-stage wave is defined, and how the suggested wave distribution across halls should work.
- Umpires: whether they belong anywhere other than on courts.
- PRD §12: who registers pairs, the draw method, the score correction window.

## 8. Working notes
- Start each step in plan mode and agree the approach before writing code.
- Run the dev server on port 3001 (`npm run dev -- --port 3001`).
- If styles look out of date in the browser, stop the server, delete `.next` and start it again.
- Sample tournament values belong only in test files.
- Run `npm test`, `npm run lint` and `npm run typecheck` before finishing any task.
