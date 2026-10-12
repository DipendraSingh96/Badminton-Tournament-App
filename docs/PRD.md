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
- **Venue: halls.** Each hall has its hours (from, until), one or more **rate bands** (from, until, rate per court per hour, e.g. peak and off-peak) and its courts. Bands must cover the hall's hours with no overlap. A hall's settings can be copied from another hall.
- **Courts.** Each court has its availability (defaults to its hall's hours; can be narrowed) and the umpires on it. Total umpires is the sum across courts.
- **Buffer:** time held back at the end of the whole day for miscellaneous activity such as prize distribution. Play must end by the latest hall closing minus the buffer; a hall that closes earlier is unaffected.

### 4.1a Unit of play and categories (set at the start of Categories and format)
- **Unit of play**, chosen once per tournament:
  - **Individual entries:** players (singles) or pairs (doubles) enter and win individually.
  - **Teams:** teams made up of several players and pairs enter, and the winner is a team (e.g. Thomas Cup, Uber Cup).
- **Event types:** men's singles, women's singles, men's doubles, women's doubles, mixed doubles, and Open doubles (men's, women's and mixed pairs competing together; doubles only).
- **Categories:** any number. With individual entries, each category is one event type with its own eligibility and expected entries (players for singles, pairs for doubles). With teams, each category is a team competition with its own line-up (see 4.2) and expected teams.

### 4.2 Format (tuned until demand fits the frame)
**Format type**, chosen once per tournament: groups then knockout, knockout only, or groups only.

Per category, as the format type requires:
- Number of groups and group size (or let the app propose a split from the entry count)
- Qualifiers per group and knockout depth (quarterfinals, semifinals, bronze match yes/no, final)
- Knockout pairing pattern (e.g. cross-group seeding)

**Team line-up** (team events): the organiser sets how many rubbers of each event type a tie between two teams contains (e.g. three men's singles and two men's doubles). Every rubber is always played. The team that wins the most rubbers wins the tie. Each player plays one rubber only, so a team's squad is the players its line-up needs (one per singles rubber, two per doubles rubber). No reserves for now.

**Scoring, set per stage** (group, early knockout rounds, bronze, final) and applied to every event:
- Points per game
- Deuce rule: none (straight race), hard cap, or standard with a maximum
- Sets per match: best of 1 or best of 3
- **Best-of-3 allowance**, set by the organiser once for the tournament: extra time added to the typical length of every best-of-3 match, organising time included, because some go to a third game (e.g. 33% adds a third)

### 4.3 Schedule
- **Time per game, set per event type** (e.g. men's singles, mixed doubles): typical playing time per game, plus organising time per match.
- **Buffer time**
- Court allocation in waves, with dedicated court blocks per category and reallocation when a category finishes early
- Rest time between a pair's consecutive matches
- Outputs: day timetable, finish-time estimate (typical and worst case), fits / doesn't fit against Frame

### 4.4 Finance (a section of every tournament, not a separate module)
Inputs:
- Expected entries, and entry fee (per player or per pair; may differ per category or by player type)
- Shuttles per game, cost per shuttle
- Prizes by category and position
- Court hire, calculated per court: its booked availability within each of its hall's rate bands, × that band's rate (only booked time is charged, including the buffer)
- Other costs as a free list; each is a fixed amount or a per-person amount (e.g. umpire food, trophies, printing)

Outputs: revenue, shuttle cost, total cost, profit or loss, break-even entries, cost breakdown, profit curve across entry counts.

Finance shares its inputs with the other sections (entries, match count, time per game). It recalculates live as the organiser changes format or entries. It must work with zero fees and zero prizes, in which case it shows the cost to the organisers.

### 4.5 Rules (all configurable)
- **Eligibility:** which people may enter which categories; limits on number of categories per person; mutually exclusive categories; internal-only or open categories; mixed internal/external pairs allowed or not
- **Ranking and tiebreaks:** an ordered list of criteria (e.g. match wins, point difference, head-to-head, draw of lots)
- **Handicap:** points added to a designated pair type, flat or varying by stage
- **Withdrawals:** before the draw (resolved with byes) and during the event
- **Walkovers:** automatic advance when an opponent withdraws or retires
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
To be supplied by the product owner (a UX designer). Until it is, the app uses **neutral design tokens**: shadcn/ui neutral greys, one neutral primary, and no brand accent. Every colour, radius, spacing and type choice is a design token in `src/app/globals.css`, so a visual direction can be applied later without rewriting screens. (The earlier sporty high-contrast direction was withdrawn on 12 October 2026.)

- **Themes:** light and dark, with a toggle; the device setting is followed until the person chooses.
- **Status colours** are semantic only: success (fits, pays for itself), warning (tight), destructive (doesn't fit, loss).
- **Type:** Geist; Geist Mono with tabular figures for numbers.
- **Icons:** Phosphor.
- **Layout and content** of the Plan mode screens follow `docs/IA.md`.
- **Accessibility:** WCAG AA contrast for all text, and at least 3:1 for input outlines and focus rings, in both themes.

Live mode has the strictest requirements: score entry on a phone one-handed, and a court board readable from a distance on a large screen.

## 12. Open questions
- Entry fee basis: per player or per pair; per-category fees; different fees for members and external players?
- Who registers pairs: organiser only, or self-registration?
- Draw method: seeded, random, or manual placement?
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
