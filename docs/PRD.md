# Badminton Tournament App: Product Requirements (MVP)

## 1. Overview
A web app that lets organisers define a tournament, check whether it fits the time and courts available, check whether it pays for itself, and then run it live on the day. The same tournament record drives both. Nothing is entered twice.

This document defines the structure, inputs, logic and behaviour of the app. It contains no fixed tournament values: every number (pairs, groups, match counts, durations, fees, costs) is an organiser input or is calculated from inputs.

## 2. Users and roles
| Role | Can do |
|---|---|
| Main organiser | Everything: set up, plan, lock, go Live, make controlled changes |
| Tournament referee | Controlled changes in Live (withdrawals, walkovers, court reassignment, score corrections); score entry for any match |
| Control desk | Score entry for any match; call-up list; court board |
| Umpire | Score entry for their own match only |
| Spectator / player | Read-only: courts, next matches, standings, bracket, results (via shareable link, no login) |

## 3. Two modes
**Plan mode.** Tune inputs, run what-ifs, decide whether the tournament is worth running and in what format, take registrations, build the draw.

**Live mode.** Same tournament, structure frozen. Court board, call-ups, score entry, live standings, automatic bracket progression, delay tracking.

**Stages.** A tournament moves through four stages, shown as a switch in the top bar: **Plan → Draw → Live → Results**. Any stage reached so far can be viewed; moving on asks first. Moving to Draw switches the plan to the real entries: from then on groups, schedule and finance use the entries entered and their external flags instead of the expected numbers (kept for comparison), until the organiser goes back to the expected numbers. Entries are taken on the Draw stage: typed in, pasted from a spreadsheet, or imported from CSV (columns Category, Name, Player 1…n, External, Seed, found by their heading); a team also lists its squad and who plays each rubber, fixed for the day. **The draw** is made per category: seeds, in seed order, are spread snake-wise across the groups at the top of each (1–4 to A–D, then 5 to D, 6 to C…), and everyone else is placed at random from a stored number (so a draw repeats exactly and Redraw is a new number); for knockout only the draw is the seed order, seeds first. Any two entries can then be swapped by hand before the draw is locked. Once a category's draw is locked, the structure is read-only (categories, unit and format, groups, match rules, rules and entries; suggested levers that would change them aren't offered) until the draw is unlocked; venue hours, courts, the timeline, the buffer and finance stay editable.

**Locking.** When the organiser takes the tournament Live, structural settings lock (categories, groups, match rules, pair list, handicap). Controlled changes remain, restricted to organiser and referee, each written to an audit log: withdrawals, walkovers, court reassignment, score corrections, schedule reshuffles.

## 4. Tournament sections
A tournament is made of these sections, all editable in Plan mode:
1. Frame
2. Format
3. Schedule
4. Finance
5. Rules

### 4.1 Frame (set first; the outer bounds and the type of competition)
- **Date and time zone.** The day's times come from the venue: it runs from the earliest hall opening to the latest hall closing. A ceiling, not a target: the tournament may finish earlier, never later.
- **Venue: halls.** Each hall has its hours (from, until), a **unit time** it charges by (e.g. 60, 40 or 30 minutes), a rate per court per unit, and its courts. By default a hall has one rate all day; ticking "Rate changes during the day" splits the day into **rate bands** (from, until, rate per court per unit, e.g. off-peak and peak), set on a strip or as rows. Unticking keeps the first band's rate for the whole day, after asking. Bands must cover the hall's hours with no overlap. Hire is always a whole number of units: hall hours, band edges and court hours must each fall on a whole-unit step from the hall's opening time. Everything in a hall (hours, unit time, rates and courts) can be copied from another hall.
- **Courts.** Each court has its availability (defaults to its hall's hours; can be narrowed) and the umpires on it. Total umpires is the sum across courts.
- **Buffer:** time held back at the end of the whole day for miscellaneous activity such as prize distribution. Play must end by the latest hall closing minus the buffer; a hall that closes earlier is unaffected. On the timeline it is shown straight after the last match. It can be dragged to pin it at a time: then play must end by the buffer's start, and the buffer must end by the latest closing.
- **Setting times by dragging.** A hall's hours, its rate band boundaries, each court's availability and the buffer can be set by dragging on the timeline (and the hall's hours and bands on a strip in its settings), as well as by typing. Drawing a new window starts on a 10-minute grid and its length is whole units of the hall's unit time; after that, edges and whole windows move in whole units. Band boundaries and court edges snap to unit steps from the hall's opening. A pinned buffer starts on the 10-minute grid and lasts whole units of the hall that closes last.

### 4.1a Unit of play and categories (set at the start of Categories and format)
- **Unit of play**, chosen once per tournament:
  - **Individual entries:** players (singles) or pairs (doubles) enter and win individually.
  - **Teams:** teams made up of several players and pairs enter, and the winner is a team (e.g. Thomas Cup, Uber Cup).
- **Event types:** men's singles, women's singles, men's doubles, women's doubles, mixed doubles, and Open doubles (men's, women's and mixed pairs competing together; doubles only).
- **Categories:** any number. With individual entries, each category is one event type with its own eligibility and expected entries (players for singles, pairs for doubles). With teams, each category is a team competition with its own line-up (see 4.2) and expected teams.

### 4.2 Format (tuned until demand fits the frame)
**Format type**, chosen once per tournament: groups then knockout, knockout only, or groups only.

Per category, as the format type requires (set within the stage cards: groups and qualifiers in the group stage, the bronze match between the knockout rounds and the final):
- Number of groups and group size (or let the app propose a split from the entry count)
- Qualifiers per group and knockout depth (quarterfinals, semifinals, bronze match yes/no, final)
- Knockout pairing pattern (e.g. cross-group seeding)

**Team line-up** (team events): the organiser sets how many rubbers of each event type a tie between two teams contains (e.g. three men's singles and two men's doubles). Every rubber is always played. The team that wins the most rubbers wins the tie. Each player plays one rubber only, so a team's squad is the players its line-up needs (one per singles rubber, two per doubles rubber). No reserves for now.

**Scoring and timing, set per stage** (group, early knockout rounds, bronze, final) and applied to every event, including every rubber of a team tie:
- Points per game
- Deuce rule: none (straight race), hard cap, or standard with a maximum
- Sets per match: best of 1 or best of 3
- Minutes per game (typical playing time) and organising time per match (walk-on, warm-up, changeover)
- **Best-of-3 allowance**, set by the organiser once for the tournament: extra time added to the typical length of every best-of-3 match, organising time included, because some go to a third game (e.g. 33% adds a third)

### 4.3 Schedule
- **Time per game, set per stage** (see 4.2).
- **Waves:** a wave is one round of a group, in which every entry in the group plays at most once. A group of n entries has n − 1 rounds when n is even and n when n is odd; the group stage has as many waves as its largest group.
- **Timeline:** one overall timeline with a lane per hall (rate bands shaded, a row per court showing its availability, the buffer hatched) and the estimated schedule laid over the courts. It works like a video timeline: a playhead can be dragged, set to a moment or played forward, and every court card on the venue shows what is running on it at that moment (stage, wave or knockout round, category). It is docked along the bottom of the working area (height adjustable and remembered) and opens on the whole day; it can be zoomed in and out (buttons, or Ctrl and the scroll wheel at the pointer), scrolled sideways, or framed on the matches ("Fit play"). It can be used from the keyboard: one tab stop per court, arrow keys between matches and courts, Alt and the arrows to move a match. The worst-case finish line takes the fit status's colour (neutral when it fits, warning when tight, destructive when it doesn't fit or matches run past their court's hours).
- **Schedule estimate** (until the scheduler is built): matches are placed in order on the first court that can start them, at typical length, within each court's hours. Group waves run in order; a category's knockout rounds start once its group stage is over, each round after the previous one; the bronze match and final follow the semi-finals. A team tie's rubbers are separate matches. Rest between matches isn't modelled. Matches that fit nowhere are reported.
- **Group courts** (a stored setting on the group stage):
  - **Own courts per group** (the default): each group keeps its own courts in its hall and plays its waves in order there. A hall's courts are shared out in proportion to each group's matches, at least one court each, in court order (e.g. 4 courts and 2 equal groups: courts 1–2 and 3–4). With more groups than courts, groups share a court and alternate wave by wave. The organiser can choose any group of the tournament (from any hall) on a court: the court plays that group, which keeps its other courts, and the court's previous group loses it. A court can also be set to no group. "Automatic split" undoes a court's choice. A group left with no court of its own shares the court carrying the least in its hall, so no match is lost, and the summary names it until a court is chosen for it.
  - **Shared across the hall:** each match goes to the first free court in the hall, which can finish sooner but mixes groups across courts.
  - The knockout uses any free court in its halls either way.
- **Stage zones per hall:** each hall has a Stages row on the timeline with a Group stage zone and a KO stage zone (knockout rounds, bronze match and final), shown as plain labelled shading across that hall's courts. A zone's length always comes from its matches. A zone can be dragged along the timeline to leave free time mid-tournament (its stage then starts no earlier there), or onto another hall's Stages row to move that whole stage to that hall (e.g. all knockout matches into one hall). A zone that can't start where it's dragged, because what it depends on hasn't finished, turns red with the earliest possible start.
- **Moving single matches:** an organiser can drag one match earlier or later, onto any court of the same hall within its stage's zone (e.g. when a team is late); it takes that place and the matches after it on that court shift along. Limits always hold: a match stays in its zone and hall, knockout order holds (a semi-final waits for its quarter-finals), and no pair or team plays two matches at once. A moved match or zone is marked; each can be reset to the estimate, or all moves reset at once.
- **Fixtures in the estimate:** each group plays in its suggested hall (see Groups per hall), round by round (a round is a wave), using a round-robin draw. The knockout uses cross-group seeding by default (winners of each group, then runners-up, and so on; byes to the top seeds), labelled e.g. "Quarter-final 1: Winner A v Runner-up B", "Semi-final 1: Winner QF1 v Winner QF2", "Bronze: Loser SF1 v Loser SF2". Until entries and the draw exist, sides are shown as draw slots (Pair A1, Team B3); names replace them later. Each match on the timeline shows its category, group or round, wave, sides, rubber (team ties), court and time.
- **Groups per hall** (several halls): keeps each group in one hall and shares groups across halls in proportion to each hall's number of courts, so changing hours never moves a group. Changing hours never moves or removes a match either: a match that runs past its court's hours stays where it is and is flagged, and its zone turns red.
- **Buffer time**
- Court allocation in waves, with dedicated court blocks per category and reallocation when a category finishes early
- Rest time between a pair's consecutive matches
- Outputs: day timetable, finish-time estimate (typical and worst case), fits / doesn't fit against Frame

### 4.4 Finance (a section of every tournament, not a separate module)
Inputs:
- Expected entries and, of those, expected external entries (counted in entries: players, pairs or teams); entry fee per player or per entry, with an optional external fee. With a per-player fee, external entries are multiplied by the players in an entry.
- Shuttles per game, and the shuttle price either per shuttle or per tube (with the number of shuttles per tube set by the organiser; the cost per shuttle is calculated)
- Prizes by category and position
- Court hire, calculated per court: the units of its booked availability within each of its hall's rate bands, × that band's rate per unit (only booked time is charged, including the buffer)
- Other costs as a free list; each is a fixed amount or a per-person amount (e.g. umpire food, trophies, printing)
- Other money in as a free list; each is a fixed amount (e.g. sponsorship) or a per-person amount, per player or for a set number of people (e.g. spectator tickets)

Outputs: revenue (entry fees plus other money in), shuttle cost, total cost, profit or loss, break-even entries for a chosen category (others held at their expected entries), cost breakdown, profit curve across entry counts.

**Suggested levers:** what-if suggestions, each re-running the plan with one input changed and showing the new fit status, court time needed and profit. They never change the plan. Only natural steps are used, so no step size is invented: one more court in a hall; best of 1 instead of best of 3 for a stage; no deuce for a stage; one group more or fewer, or a preferred group size one larger or smaller; no bronze match; the exact fee rise that breaks even (when there is a loss); shuttles per game down to the next whole number (not below 1); without each other cost. Levers that improve neither fit nor profit are not shown. Each lever can be **previewed**: the summary, timeline and court cards show the plan with that change, and the organiser then chooses **Keep** (the change is made to the input, which they can see and edit) or **Discard**. Editing any input ends a preview.

Finance shares its inputs with the other sections (entries, match count, time per game). It recalculates live as the organiser changes format or entries. It must work with zero fees and zero prizes, in which case it shows the cost to the organisers.

### 4.5 Rules (all configurable)
Set once per tournament on the Tournament setup tab and stored with it. Plan mode stores them; the draw, standings and Live mode apply them.
- **Eligibility:**
  - Most categories one person may enter (optional; empty means no limit)
  - Mutually exclusive categories: pairs of categories one person can't both enter
  - Members-only (internal) categories; every other category is open to external players
  - Whether a member may pair with an external player
- **Ranking and tiebreaks:** an ordered list chosen from matches won, game difference, point difference, head-to-head, points won (total), rubbers won (team events only) and draw of lots. At least one criterion; draw of lots can only be last.
- **Handicap (Open doubles only):** off unless switched on. A points head start in every game, given to the weaker pair type when different pair types meet, the same in every stage. Three values: mixed vs men's pair (to the mixed pair), women's vs men's pair (to the women's pair), women's vs mixed pair (to the women's pair). Pairs of the same type get none. Applies to Open doubles categories and Open doubles rubbers in team ties.
- **Withdrawals:** before the draw, the place becomes a bye. After play starts, the organiser's choice: the remaining matches are walkovers and played results stand, or all the withdrawn entry's results are voided.
- **Walkovers:** the organiser's choice: a win in straight games at the stage's points per game (e.g. 21–0, 21–0), or a win with no games or points added.
- **Match start and rest policies**

## 5. Calculations (engine)
All calculation logic lives in a separate engine of pure functions with tests. It takes the tournament inputs and returns results; it contains no tournament-specific values.

### 5.1 Capacity
Court-minutes available = Σ over courts of each court's availability within the playing window (earliest hall opening to latest hall closing, less the buffer). Court-minutes needed = Σ matches × slot length for each stage and event type, calculated at typical and worst-case duration. The slot length takes the games and longest possible game from the stage's scoring, and the minutes per game and organising time from the event's timing. Typical best of 1 = minutes per game + organising. Typical best of 3 = (2 × minutes per game + organising) × (1 + best-of-3 allowance), capped at the worst case. Worst case plays every game at its longest possible length, plus organising. Typical shuttle use for best of 3 assumes 2 games plus the same allowance. Show whether the plan fits, how much spare there is, and which inputs to change if it doesn't.

### 5.2 Format
Given the number of entries in a category, the format type and the chosen group structure, generate groups, fixtures (a group of n plays n(n−1)/2 fixtures), qualification places and bracket pairings. A knockout of n entries plays n − 1 fixtures, plus a bronze match if chosen. With individual entries each fixture is one match; in a team event each fixture is a tie of as many matches (rubbers) as the line-up sets. Group size and number of groups trade off: larger groups lengthen the group stage and shorten the knockout, and the reverse. Recompute whenever entries or structure change, including after registration closes and actual entries differ from expected.

### 5.3 Schedule
Allocate every match to a court and slot in waves, from the match rules, time per game, buffer, rest policy and court availability. Estimate finish time, typical and worst case.

### 5.4 Finance
- Revenue = entries × fee
- Shuttle cost = total matches × shuttles per game × cost per shuttle
- Court hire = Σ over courts, Σ over their hall's rate bands, of (hours the court is booked within the band × the band's rate per court per hour)
- Total cost = court hire + shuttles + prizes + other costs
- Profit = revenue − total cost
- Break-even entries and profit curve: because entries change the format, and the format changes the match count, these are found by re-running the format for each entry count rather than from a single formula.

## 6. Live mode features
- **Court board:** match on each court now, and next up
- **Call-up list:** pairs who should get ready for upcoming matches
- **Score entry:** fast entry per game and set, by authorised roles
- **Live standings:** group tables using the configured ranking order, updating as scores arrive
- **Qualification and bracket:** knockout slots fill automatically from group results and match winners
- **Delay tracking:** ahead or behind schedule, and effect on finish time
- **Controlled changes:** withdrawals, walkovers, court reassignment, score corrections; all audit-logged

## 7. Results
After the event, the same spectator link becomes a **results page** inside the app (final rankings, group tables, bracket, scores). It is built from the database, so corrections update it. No separate hosting. A **PDF export** button generates a PDF on demand; PDFs are not stored.

## 8. Engine testing
The engine is tested with sample inputs written in the test files. Tests check the logic (e.g. group fixtures follow n(n−1)/2, tiebreaks apply in the configured order, brackets follow the configured pairing pattern, capacity and finance respond correctly when inputs change). Sample values live only in tests, never in application code or requirements.

## 9. Build slices
Each slice is demoable. Start each in plan mode.

1. **Plan mode: calculations only.** Frame, format, capacity check, finance section and dashboard. Acceptance: changing any input updates capacity, match counts and finance; fits / doesn't fit is shown; break-even and profit curve work.
2. **Draw, fixtures and schedule.** Register pairs, enforce configured eligibility, generate groups and fixtures, produce the wave schedule. Acceptance: changing the entry count regenerates the structure and schedule.
3. **Live mode.** Lock and go Live; court board, call-ups, score entry, live standings, automatic bracket progression, delay tracking. Acceptance: a full simulated tournament can be played through to a final.
4. **Roles and spectator link.** Supabase Auth, RLS for all roles, audit log, read-only shareable link. Acceptance: umpires can only enter scores for their own match; spectators cannot write.
5. **Results page and PDF export.**

## 10. Out of scope (MVP)
Formats other than groups then knockout, knockout only, or groups only; online payments, notifications (email/SMS/push), multi-day events, public tournament discovery.

## 11. Design direction
Supplied by the product owner on 26 October 2026: the **Court green** design system, `docs/design-system.md`, with its tokens in `src/app/design-tokens.css`. That document is the source of truth for colour, type, spacing, components and themes; this section only summarises it.

- **Themes:** Plan (light surface, green accents) and Plan dark for the planning screens, with a toggle that follows the device until the person chooses; Live (dark court green) for the wall board, control desk and umpire phone.
- **Green is a signal, not a wallpaper;** one accent (shuttle yellow) marks the single most important thing on a screen.
- **Status** always shows a word with its colour: Fits, Tight, Over, Live, Off.
- **Type:** Barlow for text, Barlow Condensed for headings and numerals, tabular figures for all numbers.
- **Icons:** Phosphor.
- **Layout and content** of the Plan mode screens follow `docs/IA.md`.
- **Accessibility:** WCAG AA contrast for all text, and at least 3:1 for input outlines and focus rings, in every theme.

Live mode has the strictest requirements: score entry on a phone one-handed, and a court board readable from a distance on a large screen.

## 12. Open questions
- Entry fee basis: per player or per pair; per-category fees; different fees for members and external players?
- Who registers pairs: settled for now as the organiser (typed, pasted or CSV); self-registration may come later.
- Draw method: settled as seeded, then random, with swaps by hand before locking.
- Score entry correction window and approval flow

## 13. Data and privacy
The app is for one club's events. It stores personal data (at minimum names), so UK data protection rules apply. This section is a product requirement, not legal advice; the club should review it.

- **Minimum data.** Store only what is needed to run the event: names, pair, category, scores. Collect contact details only if a feature needs them, and mark each such field as optional.
- **Purpose.** Data is used only to run and report on the tournament.
- **Spectator view.** The read-only link shows only what spectators need (names, matches, scores, standings). It never exposes contact details or finance information. Enforce this in Supabase RLS, not only in the UI.
- **Display names.** The organiser can choose how names appear publicly (full name, first name and initial, or initials).
- **Publish control.** The organiser can unpublish the spectator and results pages at any time.
- **Retention.** Personal contact details are deleted a set period after the event (organiser-configurable). The organiser can archive or delete an entire tournament.
- **Removal requests.** The organiser can remove or anonymise a person's details on request, with results kept in anonymised form where the standings need them.
- **No tracking.** No advertising or analytics cookies on spectator pages.
- **Privacy notice.** A short notice is shown wherever personal details are collected, saying what is stored, why, and who to contact.
- **Not stored.** No payment card or bank details (payments are out of scope).
- **Audit log.** Records who made each controlled change and when, but stores no more personal data than names or user IDs.
