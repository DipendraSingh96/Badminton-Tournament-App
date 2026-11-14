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

**Stages.** A tournament moves through four stages, shown as a switch in the top bar: **Plan → Draw → Live → Results**. Any stage reached so far can be viewed; moving on asks first. Moving to Draw switches the plan to the real entries: from then on groups, schedule and finance use the entries entered and their external flags instead of the expected numbers (kept for comparison), until the organiser goes back to the expected numbers. Entries are taken on the Draw stage: typed in, pasted from a spreadsheet, or imported from CSV (columns Category, Name, Player 1…n, External, Seed, found by their heading); a team also lists its squad and who plays each rubber, fixed for the day. **The draw** is made per category: seeds, in seed order, are spread snake-wise across the groups at the top of each (1–4 to A–D, then 5 to D, 6 to C…), and everyone else is placed at random from a stored number (so a draw repeats exactly and Redraw is a new number); for knockout only the draw is the seed order, seeds first. Any two entries can then be swapped by hand before the draw is locked. **Check-in** (part of Live mode, not shown in the Draw stage): on the day each player is marked Arrived, Not yet or Absent at the desk; a match is ready when all its players (by line-up for teams) have arrived, and the court panel and call-up list show who hasn't. Withdrawing an absent entry (applying the withdrawal rule) comes with Live mode, where results exist. Once a category's draw is locked, the structure is read-only (categories, unit and format, groups, match rules, rules and entries; suggested levers that would change them aren't offered) until the draw is unlocked; venue hours, courts, the timeline, the buffer and finance stay editable.

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

**Scoring and timing, set per category and per stage** (group, early knockout rounds, bronze, final). Each category has its own, because categories can differ in size and in how the organiser wants them played; they apply to every event the category plays in that stage, including every rubber of a team tie. A new category starts with a copy of the first category's, and a stage's settings can be copied to all categories:
- Points per game
- Deuce rule: none (straight race), hard cap, or standard with a maximum
- Sets per match: best of 1 or best of 3
- Minutes per game (typical playing time) and organising time per match (walk-on, warm-up, changeover)
- **Best-of-3 allowance**, set by the organiser once for the tournament: extra time added to the typical length of every best-of-3 match, organising time included, because some go to a third game (e.g. 33% adds a third)

### 4.3 Schedule
- **Time per game, set per category and stage** (see 4.2).
- **Waves:** a wave is one round of a group, in which every entry in the group plays at most once. A group of n entries has n − 1 rounds when n is even and n when n is odd; the group stage has as many waves as its largest group.
- **Timeline:** one overall timeline with a lane per hall (rate bands shaded, a row per court showing its availability, the buffer hatched) and the estimated schedule laid over the courts. It works like a video timeline: a playhead can be dragged, set to a moment or played forward, and every court card on the venue shows what is running on it at that moment (stage, wave or knockout round, category). It is docked along the bottom of the working area (height adjustable and remembered) and opens on the whole day; it can be zoomed in and out (buttons, or Ctrl and the scroll wheel at the pointer), scrolled sideways, or framed on the matches ("Fit play"). It can be used from the keyboard: one tab stop per court, arrow keys between matches and courts, Alt and the arrows to move a match. The worst-case finish line takes the fit status's colour (neutral when it fits, warning when tight, destructive when it doesn't fit or matches run past their court's hours).
- **Schedule estimate** (until the scheduler is built): matches are placed in order on the first court that can start them, at typical length, within each court's hours. Group waves run in order; a category's knockout rounds start once its group stage is over, each round after the previous one; the bronze match and final follow the semi-finals. A team tie's rubbers are separate matches. Rest between matches isn't modelled. Matches that fit nowhere are reported.
- **Group courts** (a stored setting on the group stage):
  - **Own courts per group** (the default): each group keeps its own courts in its hall and plays its waves in order there. A hall's courts are shared out in proportion to each group's matches, at least one court each, in court order (e.g. 4 courts and 2 equal groups: courts 1–2 and 3–4). With more groups than courts, groups share a court and alternate wave by wave. The organiser can choose any group of the tournament (from any hall) on a court: the court plays that group, which keeps its other courts, and the court's previous group loses it. A court can also be set to no group. "Automatic split" undoes a court's choice. A group left with no court of its own shares the court carrying the least in its hall, so no match is lost, and the summary names it until a court is chosen for it. A group may also borrow another court of its hall once that court's own groups have finished there, so the group stage ends level instead of leaving courts empty while other groups queue; a court set to no group is never lent. A match moved by hand stays within its stage on its court: group matches always come before that court's knockout matches.
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

Outputs: revenue (entry fees plus other money in), shuttle cost, total cost, profit or loss, break-even for the whole tournament in total entries (each total shared between the categories in the proportions of their expected entries, none below the two a category needs to run), with the breakdown at break-even beside the plan as expected, cost breakdown, profit curve across entry counts.

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

### 4.6 Dummy data
So an organiser can see how the plan, the draw and the day will look before real data exists, any page where data is entered (the Plan stage as a whole; Entries, Draw and Teams on the Draw stage) can be filled with dummy data. A fill only fills what's still empty and never overwrites the organiser's data. Dummy data is marked; **Remove dummy data** takes it all out and keeps anything the organiser has since edited. Live and Results show the outcome of Plan and Draw and take no dummy data; in slice 3 the organiser still marks attendance and makes overrides there. Dummy values are the one exception to "no tournament values in application code": they live in one place and are used only on request.

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

**Going Live.** Live is reached from Draw once every category's draw is made and locked; moving on asks first. From then the structure, the venue and the draw are fixed (Plan and Draw can be looked at). The only changes from here are the controlled changes below.

**No money while Live.** The hall is a shared space and the organiser's screen is often left open, so while the tournament is Live nothing about money is shown on any stage: no profit or loss, no entry fees, no hire rates, and the Budget tab cannot be opened. There is no way to reveal it. Money returns with Results.

**Check-in.** The Live stage's first page. Everyone entered, the people playing soonest first, each player marked Arrived, Not yet or Absent, with one action to mark a whole pair or team arrived, a search, a category filter and a "Not checked in" filter. Absent is a note for the desk; it withdraws nobody (that is a controlled change).

**Phone numbers.** Each player may have a phone number, entered on the Draw stage's Entries page (typed, or a "Phone 1…n" column in a paste or CSV) or at check-in. They are contact details for the organiser only and never appear on the audience board or a shared link.

**Scores.** Per game: two numbers, checked against the category's rules for the stage. With no deuce, the first to the points per game wins and the game stops there. With a deuce rule (hard cap, or win by two up to a maximum), a game is won by two clear points once a side reaches the points per game, or by the first to the cap or maximum. A game can't end level. A match is won by the side that takes most of its games: one for best of 1, the first to two for best of 3. A score that isn't a possible final score is refused with the reason in plain words. The desk can always enter or correct any score, whatever an umpire's phone or a paper sheet said; a finished match is reopened to correct it (logged, once the log exists). Each match keeps when it was started and finished.

**What is on a court now.** Live follows what has been played, not the clock. Each court keeps its games in their scheduled order; its current game is the first one not finished, and it is On court once started, Up next until then. A court with no games left is done for the day. The desk works from three lists that re-sort as games start and finish: the games on court, the courts standing free (each with the game it is due next), and the other waiting games, soonest scheduled first. **Starting a game:** a game can't be started, or scored, until every player in it (by line-up for a team's rubber) is marked Arrived; until then it can only be awarded. Typing its first score starts it. Players can be checked in wherever the game or the entry is shown, not only on the Check-in page.

**Standings.** A group's table counts finished matches only (for teams, ties whose rubbers are all finished): played, won, lost, games and points for and against, and rubbers won. A team tie goes to the side with most rubbers; level on rubbers, to games, then points. Entries are ranked by the tournament's tiebreak order, one criterion at a time, each separating only the entries still level after the ones before it. Head-to-head looks only at the matches between the entries level at that point. Draw of lots uses a number fixed by the draw, so it gives the same answer every time. Entries level after every criterion share a place.

**Who goes through.** A group's places are final once every one of its matches is finished; until then everyone is In contention. Then the places above the qualifying line are Through and the rest Out. If entries share a place across the line (possible only with no draw of lots in the order), they are marked Level, to be decided by hand, and the knockout places they would take stay open.

**Knockout sides.** A knockout side is filled from results, never typed: a group's place ("Winner A") once that group's places are final, and a match's winner or loser ("Winner QF1", "Loser SF1") once it is finished. A knockout game can be started only when both its sides are known. Each match keeps the two entries that played it. If a score is corrected later and the results now put a different entry in a match already started, that match is flagged "The sides have changed since this was played"; nothing is changed automatically, and its winner is still whoever played and won it.

**Controlled changes.** While Live the desk can change only these, and each is written to the log:
- **Walkover:** a side didn't play. The desk says who wins; it is scored by the tournament's walkover rule (straight games at the stage's points per game, or a win with no games or points).
- **Retirement:** a side stopped during play. The desk says who wins; the scores entered stand. If it stopped during a game, that game's points count but it is nobody's game.
- **Withdrawal:** a whole entry leaves (one player missing from a team is not a withdrawal). With group games still to play the desk chooses each time, starting from the tournament's withdrawal rule: its played results stand and its remaining games are walkovers, or all its results are voided (they count for nobody, and its unplayed games aren't played). Either way it is placed last in its group and marked Withdrawn. After its group has finished the table doesn't change: its next knockout game is a walkover, and so is any game that walkover puts it in (the bronze match). Before confirming, the desk sees the games affected and the group's table before and after. An entry with a game on court can't be withdrawn until that game is finished or awarded.
- **Score correction:** a finished match is reopened, changed and finished again. The log holds both scores, says if the winner changed, and names any later game whose sides no longer match who played it. A first-time score is not a controlled change and is not logged. Reopening an awarded match puts it back to being decided by its scores.
- **Court move:** a game that hasn't started is moved to another court, or to another place in a court's order; from the timeline, or by putting a waiting game on a free court from the side panel (it becomes that court's next game). A game on court or finished can't be moved.
- **A tie decided by hand:** where a finished group has entries level on every tiebreak, the desk puts them in order. It applies after every tiebreak, to that group only.
- **A level knockout tie decided by hand:** a knockout tie (team events with an even number of rubbers) can end level on rubbers, games and points. It is then nobody's, and the round after it can't be filled, until the desk says who goes through (after a deciding game, a coin toss, the referee's ruling). The scores stand as entered. The decision is logged with its note and can be reversed. It applies only while the scores leave the tie level: if a score is later corrected so that one side is ahead, the scores decide it.

**The log.** One list kept with the tournament, starting with going Live. Each entry has the time (shown in the tournament's time zone), who made it ("Desk" until sign-in exists), the kind of change, the change in one sentence, an optional note, and what it replaced. **Reverse** puts back exactly what a change replaced and is itself logged; a change can't be reversed while a later change to the same thing still stands (that one is reversed first). Reversing "went Live" takes the tournament back to the Draw stage with its scores, log and locked draw kept. There is no undo or redo while Live. The log can be printed.

**Getting ready (the Draw stage's Resources page).** One place to prepare the day. None of it changes the tournament's structure or results, so it stays editable when the draw is locked and while Live, and writes nothing to the log.
- **Documents,** printed through the browser (which can also save a PDF to send). No document carries a phone number or any money.
  - *Score sheets:* one a game, as before.
  - *Rulebook,* for players, written from the stored settings the app scores and ranks by, so it can't disagree with them: each category's format (groups, who goes through, the knockout, a third-place match); scoring per stage (points per game, the deuce rule, best of one or three), stages that score alike said once; the order groups are ranked by; how a walkover is scored, what a withdrawal does, and retirements; who can enter and the open doubles handicap where set; then the organiser's own rules, a line each. Anything not set is listed on the page and left out.
  - *Programme,* for players: the name, date and each hall's hours and courts; every category's groups with the entries in them; the knockout by round with its slots; and each court's games in order with their times.
- **Kit list:** quantities counted from the plan. Shuttles are the plan's own count (games by shuttles per game), given in tubes, rounded up, where shuttles per tube is set; a score sheet a game and the A4 pages that makes; a pen and a clipboard a court; the umpire chairs the venue has. The organiser adds rows of their own, and ticks each row as packed.
- **Checklist:** items the app checks itself (date and hours set, entries in every category, every player named, team line-ups set, every category drawn and locked, every game on the schedule, the plan fits the day) and the organiser's own items. The first can't be ticked by hand.
- **Readiness:** how many of all those are done, and the days to go.
- **Message to players:** written from the tournament, to copy and send with the two documents.
- A copied tournament keeps the organiser's own rules, items and kit rows, unticked.

**Prizes.** For each category, a prize for 1st, 2nd and 3rd place, each given or not and with its own amount. A prize that isn't given costs nothing and needs nothing filled in.

**Score sheets (replaces the earlier per-match sheets).** Blank, and by how a stage is scored rather than by match: every match scored the same way (points per game, deuce rule, best of one or three) uses the same design, across stages and categories, so any sheet does for any of its matches. One match to an A4 page: the tournament and date; what the design is for and its scoring; blanks for court, time, group or round, match (and category where the design serves several), the two sides and their players; for each game a row of numbered point boxes a side, to the points per game and on to the deuce limit where there is one; the result; and signatures of the umpire and both sides. The organiser prints as many of each design as they want, starting from the number of matches that use it. An organiser may instead use their own sheet (a PDF or an image), kept on the device until tournaments are stored in the database.

**Free courts.** While Live a court is free when it has nothing on it and no game of its own waiting.

**Poster prompt.** Resources offers a prompt to give an image tool to make a poster: the name, date, times, venue and how to enter (typed by the organiser), courts, format, and each category with its entry fee and prizes. Fees and prizes are left out while the tournament is Live. Generating the poster inside the app is not built: it needs an image model behind a server route with its key kept off the browser, sign-in, and storage for the images.

**Starting the tournament.** Going Live doesn't start play: the desk does, with Start tournament (starting or scoring a first game counts as starting). The real start is kept and logged with how far it was from the plan ("started at 09:20, 20 minutes after the plan"). It isn't reversed from the log: games begin with it.

**Games start by themselves.** Once the tournament has started, each court's next game goes on court as soon as its sides are known, all its players are checked in (by line-up for a team's rubber) and none of them is on another court. This happens at the start, when a game finishes or is given as a walkover, when a player is checked in, and when a game is moved. A game whose players are on another court simply waits. A game with a player not checked in is **held**: it stays waiting until they are checked in, or the match is given as a walkover, or another game is put on its court.

**The day as it is really going.** While Live, times shown are projected from what has happened, not read from the plan. On each court, in its own order: a finished game sits at its real start and finish; a game on court runs from its real start for its planned length, or to now once it has run past that; a waiting game follows straight on from the one before it (never before now), except that a knockout game whose sides aren't known yet doesn't move ahead of its planned time shifted by how late the day began; and a walkover with nothing played takes no time. Games don't change court by themselves: the desk moves them. Plan and Draw keep showing the plan.

**A game's time.** A game on court is compared with its slot on the schedule (playing time plus changeover): from 80% of the slot it is shown as near its end, and past the slot as over. It is shown quietly: a small dot on the game's card and on its court, and a soft fill on its timeline block. Nothing on the Live pages is a full yellow or red card, and there is no "On court" badge: who is on a court is simply shown on it. The Court board and the audience board show no live scores for now; scores are entered and read in the side panel, and finished results are in the tables and the bracket.

**Putting a game on another court.** Any waiting game may be put on any court that isn't playing (within the hall rules for its stage). It goes first there; a game that was waiting on that court goes back behind it. It is a court move: logged and reversible. It can be done from the timeline, from the side panel (dragging, "Move to court…", or "Put on court N" with a court chosen) and by dropping a game from the side panel onto a court on the Court board.

**The schedule's rules, 14 Nov 2026 (these replace anything above that says otherwise).**
- **The knockout waits for the group stage.** A competition's knockout games start only when every group game of that competition has finished, in every hall: in the plan, in the day as it is projected, and for games starting by themselves. Until then no knockout side is known (the knockout page shows where each side comes from; "If it ended now" shows who would go through). Another competition's groups don't hold it up.
- **A stage is one zone.** The group stage runs from its first game to its last, the knockout from there on, the same in every hall that plays it. On the day the zones follow the games as they are really going.
- **Dragging a stage** moves it in every hall together, to any time of the day. It never changes the court or hall a game is on. Games it pushes past closing are flagged, never refused.
- **Late** means past the court's closing time. The buffer is not a wall: it sits straight after the last game and moves with it, and is shown red, with a warning, when it no longer ends by the last closing. (The plan's fit still counts the buffer.)
- **A court never stands empty while another of its games can be played.** If the game at the front can't start yet (a team still playing elsewhere, a result not in), the court's next game that can start goes first; the one that was waiting goes on as soon as it can.
- **A tie's rubbers on one court are played back to back** ("stapled"), at the earliest one's place. Stapled rubbers are moved as one; in Live that is one logged change, reversed as one. Rubbers of a tie on different courts are moved one at a time.
- **Money missing doesn't stop the timing.** While the only things still to fill in are money (prize amounts, fees, shuttle price, other costs and income, hire rates), the day is still timed: timeline, courts, matches, hours and fit. Profit is shown only when the money is complete.

**What a court shows.** A court shows the first game it hasn't finished, once that game's two sides are known. A knockout game whose sides aren't known yet is never shown on its court: until they are, the court is **free** (blank), so the desk can use it. The top of a court names what is on it (the game's group or round), not the group the court was planned for.

**Free courts and other halls.** A court with nothing left that can be played now (no game, or only games still waiting for players or for their sides) may be given a waiting group game from any group in any hall, at the desk's discretion. A court that still has a playable game of its own takes group games from its own hall only. Knockout games need a hall that has the knockout stage.

**Held games before the start.** From the moment the tournament is Live, a game with a player not checked in is shown as held (grey) on the timeline, in the lists and on its court, so the desk can move playable games ahead of it before pressing Start tournament. Nothing fades, flashes or is called on the audience board until the tournament has started.

**The Live clock.** While Live the timeline's cursor is the real time in the tournament's time zone. It is not moved by hand. (With developer mode on it can be, to look around the day.)

**Developer tools: the simulated day.** Not an organiser feature: behind a Developer tools switch in Settings (off by default, kept on the device, not in the tournament). On the Live stage, one control, **Start tournament simulation**, plays the day from the timeline cursor's time (for a tournament that has really started, **Simulate the rest of the day** carries on from the day as it stands). The simulation plays the hall's part and nothing of the desk's:
- **By itself:** players not yet marked check in before their first game (a few late; a few never, who stay "not yet"); each game starts as soon as its court and its players are free and its sides are known, and runs a little short of or past its planned length; scores are random but valid under the stage's rules; the knockout fills to a champion. A court whose player is only late stands held until they arrive.
- **Not by itself:** it gives no walkovers. When a court's game can't start because a player who isn't coming hasn't checked in, **the day pauses** there and waits for the desk: check the player in, give a walkover, or put another game on the court. Then it plays on by itself. With two courts waiting it plays on once neither is.
- **The desk during a simulation:** check-in, walkovers and retirements, moving a waiting game, withdrawals, deciding a level group or a level knockout tie and reversing a change all work, on the simulated day only. The simulation pauses when a knockout tie ends level, for the desk to decide it. Start game is the simulation's; so are scores and Finish match, unless the desk takes them.
- **"I enter the scores"** (a switch in the simulation's banner): the simulation starts games but doesn't score them. When a game's time is up the day pauses; the desk enters its score and finishes the match, and the day plays on. It can be switched on and off mid-day.
- Whatever the desk does during a simulation is stamped with the simulated time, not the real clock.
- It plays at 5 minutes a second, can be paused, and its cursor can be moved, but not back past the desk's last action nor on past a court that is waiting.
- **It is never saved:** stopping it leaves the tournament exactly as it was, the desk's simulated actions included. Who is late, who never comes and how long each game takes are fixed when it starts, so the day stays the same day each time it is worked out again after the desk acts. Its random numbers (the share absent and late, how early or late a game runs) are kept with the sample-data values.

**The audience board.** A read-only screen for the hall, opened from the Live stage in its own window on the desk's computer and shown on a TV or projector (a link for other devices comes with the spectator link). It shows the day as the desk sees it and changes the moment the desk does anything; nothing can be changed from it. It turns by itself between every court (the game on it and its score, or the game due next), the group tables and, once a category's knockout has begun (a group finished, or a knockout game started), its bracket. The waiting games, soonest first as the day is really going, are always in view. When a court's game can't start because a player hasn't checked in, the board calls them to the desk by name; a player marked Absent isn't called. It never shows phone numbers, money, check-in marks, the log or how a game is doing against its slot. It has its own Light / Dark choice, apart from the desk's. A simulated day (developer tools) is shown on it too, and is still never saved.

**Names in public.** The organiser chooses how people's names appear on the audience board (and, later, the spectator link): in full, first name and initial ("Asha P."), or initials ("A.P."). It is a stored setting, in full to begin with, and can be changed while Live. A team's name is shown as it is. The desk always sees full names.

**Score sheets.** Printable, one per game, two to an A4 page, for umpires without a phone: tournament and date, court, time, category, group and wave (or knockout round), both sides and their players, a score box per game the match can have, a winner tick and the umpire's name and signature. No phone numbers and no money. Printed from the Draw stage's Schedule page once a draw is locked, and from Live's Court board: every game, the group stage, one court, or one category. Knockout sheets name their sides once the groups decide them.

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

- **Themes:** Light and Dark, with a toggle that follows the device until the person chooses. Every stage, Live included, is built in both.
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
