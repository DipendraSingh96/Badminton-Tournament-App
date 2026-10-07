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
- **Time available:** start time and end time, or total hours. A ceiling, not a target. The tournament may finish earlier, never later.
- **Courts:** number of courts, which may vary by time window (e.g. more courts earlier in the day, fewer later).
- **Umpires:** number available.
- **Discipline(s):** single discipline or multiple disciplines played together.
- **Unit of competition:** individual, pair or team.
- **Categories:** any number, each with its own discipline, eligibility, and expected entries.

MVP supports pairs (doubles), one or more categories, group stage then knockout. See Out of scope.

### 4.2 Format (tuned until demand fits the frame)
Per category:
- Number of groups and group size (or let the app propose a split from the entry count)
- Qualifiers per group and knockout depth (quarterfinals, semifinals, bronze match yes/no, final)
- Knockout pairing pattern (e.g. cross-group seeding) 

**Match rules, set per stage** (group, early knockout rounds, bronze, final):
- Points per game
- Deuce rule: none (straight race), hard cap, or standard with a maximum
- Sets per match: best of 1 or best of 3

### 4.3 Schedule
- **Time per game:** playing time plus organising time between games. Tunable separately per stage.
- **Buffer time**
- Court allocation in waves, with dedicated court blocks per category and reallocation when a category finishes early
- Rest time between a pair's consecutive matches
- Outputs: day timetable, finish-time estimate (typical and worst case), fits / doesn't fit against Frame

### 4.4 Finance (a section of every tournament, not a separate module)
Inputs:
- Expected entries, and entry fee (per player or per pair; may differ per category or by player type)
- Shuttles per game, cost per shuttle
- Prizes by category and position
- Other costs as a free list; each is a fixed amount or a per-person amount (e.g. umpire food, court hire, trophies, printing)

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
Court-minutes available = time available × courts (respecting court availability windows). Court-minutes needed = total matches × slot length, calculated at typical and worst-case duration (worst case derived from the match rules for each stage). Show whether the plan fits, how much spare there is, and which inputs to change if it doesn't.

### 5.2 Format
Given the number of pairs in a category and the chosen group structure, generate groups, fixtures (a group of n plays n(n−1)/2 matches), qualification places and bracket pairings. Group size and number of groups trade off: larger groups lengthen the group stage and shorten the knockout, and the reverse. Recompute whenever entries or structure change, including after registration closes and actual entries differ from expected.

### 5.3 Schedule
Allocate every match to a court and slot in waves, from the match rules, time per game, buffer, rest policy and court availability. Estimate finish time, typical and worst case.

### 5.4 Finance
- Revenue = entries × fee
- Shuttle cost = total matches × shuttles per game × cost per shuttle
- Total cost = shuttles + prizes + other costs
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
Team tournaments, singles, formats other than group stage plus knockout, online payments, notifications (email/SMS/push), multi-day events, public tournament discovery.

## 11. Design direction
To be supplied by the product owner (a UX designer). Until supplied, use neutral shadcn/ui defaults and keep all colour, type and spacing as design tokens so a visual direction can be applied later without rewriting screens. Live mode has the strictest requirements: score entry on a phone one-handed, and a court board readable from a distance on a large screen.

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
