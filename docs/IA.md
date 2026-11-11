# Tournament Planner: Information Architecture (v3)

## Principle
Ask for the biggest, most stable information first, and the most detailed, most changeable information last. Results appear next to the inputs that produce them.

| Group | Meaning | Changes |
|---|---|---|
| **Base** | The event's setup: day, venue, what is played, rules | Rarely, and deliberately |
| **Tuned** | Structure, stage rules, timing, buffer and money, adjusted to make the plan fit and pay | Often, while testing |
| **Derived** | Results calculated from the above | Never typed in |

## Platform
Plan mode is desktop only. Only Live mode needs a phone layout.

## Screen layout (three areas)
1. **Sidebar** (the full height of the window, the app's own space): at the top, the product name and the collapse button; in the middle, **New tournament** and the saved tournaments; at the foot, **Profile** (with sign-in, slice 4) and **Settings** (theme: Light, Dark or System). The tournaments: the saved tournaments, newest first (those without a date yet at the top), and **New tournament**, which starts a blank one without touching the others. Each change saves to the open tournament straight away; its card shows "Saved" and the time. Clicking another card opens it, with its own undo history. The open tournament's card has **Duplicate** and **Delete** (Delete asks first and can't be undone; the next tournament opens). A duplicate is a new tournament with the same structure: venue, categories and expected numbers, rules, timings, finance and timeline moves. It has no name or date, no entries, check-in or draw, and starts at the Plan stage. Tournaments are kept in this browser until they move to Supabase. The panel collapses to a thin rail (expand, New tournament, the current tournament's initial); the choice is remembered.
2. **Main column: the open tournament.** Everything in it sits in a **central column at most 960px wide**, centred in the space between the sidebar and the workbench, so it moves as the workbench opens or folds; inside it everything is left-aligned except a few tools at the right (undo and redo, the sample-data buttons, Clear hall). From the top: the **name row** (tournament name, date and time zone, with undo and redo at its right); the **stage row** (Plan · Draw · Live · Results, with the sample-data buttons at its right; 8px above and below); then the stage's page. On the Plan stage the page is the venue (halls and courts, with **+ Add hall** under the last hall's courts), and below it the **timeline**, which runs edge to edge from the sidebar to the workbench under one soft divider, with a draggable height that is remembered.
3. **Right: workbench** (Plan stage only). It runs the full height, starting 16px from the shell's top, level with the name row; 440px wide. From its top: a **heading** at the 24px level with ✕ to fold it away: "Set up your tournament" while anything is missing, then "Your plan fits", "Your plan is tight" or "Your plan overflows", with only the status words in the status colour; **"N items to fill in"** with the next item and an arrow pointing down to it; with sample data in the plan, **"N items using sample data"** with a jump to the first of it; the **health bar** with the fit chip: one small bar per hour of court time booked (each bar is 2 hours or more past 48 hours), filled for the court time the matches need, in the status colour; empty and grey until the plan is complete; once complete, one line of results under it (court time · matches · profit); then three tabs side by side, **Setup · Schedule · Budget**, each with the number of items left in it in brackets ("Setup (6)"), so the fit stays in view across all three. Sections are separated by spacing and headings, with no dividers. Folded, it is a 40px rail with a single chevron to open it and, running top to bottom with its text sideways: the heading ("Your plan is tight"), the health bar, and the profit or loss (or "N items to fill in" until the plan is complete); the choice is remembered.

**Surfaces.** The sidebar keeps its own colour with no visible borders. The main column and the workbench share the page background and its dot matrix; the timeline is frosted glass over the venue, which scrolls under it. Two **open dividers** separate them: one soft line between the working space and the workbench, one between the venue and the timeline; each stops 16px short of the shell's edges. The timeline has no lines across it. It folds to a 40px bar: play, the time, a scrubber over the day marked where the group stage, knockout rounds and final start, and an arrow to expand.

**Fields.** Text, number, stepper, date, time and select fields show their label inside (as placeholder; a select's empty option), not above; the label stays as the field's accessible name and tooltip. A field is a soft box with no border, a step stronger on hover, with the focus ring on focus. Time fields carry their label inside at the left (the hall's hours read Opens and Closes). A field's help (ⓘ) sits beside its box. **A wrong value** outlines the field in red and puts the reason in its tooltip (and its description, for screen readers); nothing is printed under the field, so rows keep their shape. Where a panel has a summary line (the hall's rate bands: "Bands overlap from 12:00 to 13:00"), that is the one visible message. Choice groups (segmented controls, option cards) keep their labels.

**Buttons.** Icon buttons are squares that hug their icon, with no fill or border until hovered. Secondary text buttons (Add hall, Play, Paste rows…) have a soft fill and no border; primary buttons are filled.

**Sizes and spacing.** Containers and the shell sit on multiples of 40px: sidebar 280, central column 960 at most, workbench 440, rails 40, court cards 200. Fields and small controls size to their content and share their row. Gaps follow one scale: 4px icon to text; 8px between controls in a row; 12px between rows of a group; 16px inside panels and from the shell's edge (so 16px above the name row, 16px from it to the stage row, and 16px under the stage row, kept clear as the page scrolls beneath); 24px between sections. Everything in a panel shares one left edge.

**Rate bands.** A hall with rates that change during the day shows a fixed track of the day, always 06:00 to 24:00, so it never shifts. The organiser drags on a free part of the track to set a band ("Drag to set Band 1" while it's empty), drags a band or its edges to move or resize it, and can type the same times in the band's row. **The bands set the hall's hours:** the hall opens when the earliest band starts and closes when the latest ends, so there's no need to set the hours first. A band 09:00 to 13:00 and another 13:00 to 19:00 make the hall 09:00 to 19:00; shortening or removing a band changes the hours with it. A hall whose hours were set before ticking "Rate changes during the day" starts with one band over those hours. A band drawn close to its neighbour joins it; bands can't be dragged over each other. A gap between bands is hatched red on the track and named in the panel's summary line, as is an overlap typed in the rows. Times under the track show the hall's hours and band edges, with a dimmer scale every three hours.

The shell (sidebar, main column, workbench) never scrolls as a page; only the panes inside it scroll.

**Stages.** The stage row under the tournament's name: Plan · Draw · Live · Results. Stages reached show a tick and can be viewed; the next is reached by choosing it (asks first); later ones wait. **Draw waits until the plan is complete** (its tooltip says how many items are left), and Plan shows its tick only once it is complete and the tournament has moved on. In Plan, once the plan uses the real entries, the Schedule tab's Entries section says so and carries Use expected numbers; there is no banner for it. With the draw locked, a bar at the top of the workbench says "Draw locked. Categories, groups, rules and entries are read-only." with Unlock draw. Every confirmation is the product's own dialog.

**Draw stage.** Pages along the top, in order: **Entries, Draw, KO stage, Schedule**, in the central column like everything else; Schedule's timeline runs edge to edge. The page tabs have no fill, so the dot grid shows behind them. Teams are in the side panel (below); the group tables (standings) and check-in belong to Live.
- **Side panel** (every Draw page): the same pane as the Plan workbench (440px, full height, open divider, a 24px heading with ✕, folding to a 40px rail; one open-or-folded choice for both). It shows **every team** (or pair, player) in draw order with a search, a category filter, each one's draw place and next match. **A team opens in place:** clicking its row expands it in the list (category, draw place, seed, external; players; a team's line-up; "Swap draw place with" while the draw is unlocked; every match with time, court and opponent), and a second click closes it; one is open at a time. Clicking a team's name anywhere else opens the panel if it is folded, clears a search or filter that hides the team, scrolls to it and expands it. **One court's games** for the day show when a court is clicked on Schedule, with a back arrow to the list.
- **Names are links:** a team's name on the Draw page, in the bracket, on a court and in the panel's match lists opens that team in the panel.
- **Entries:** one category at a time (a tab per category with its count); a table of entries (number, name, players, external, seed, remove), with Add, Paste rows and Import CSV (a preview lists rows that can't be read before anything is added). A team's row opens to its squad and its line-up: each rubber with its players chosen from the squad, flagged until complete.
- **Draw:** per category, Make the draw fills the plan's groups (with the real entries; knockout only is one list in seed order). Groups sit side by side, four across at 1440 wide with the panel open, each place as slot (A1), name, seed in brackets and an Ext chip. Hovering an entry shows its full name; a click opens it in the panel. **Drag an entry onto another to swap them**, within a group or across groups (the held one is outlined in the accent, the one under it dashed). Redraw keeps the seeds; Lock draw makes it final (and the structure read-only), Unlock undoes that. A draw made before entries or group sizes changed is flagged and must be made again before locking.
- **KO stage:** per category, the knockout from the first round to the final (outlined in shuttle yellow) and the bronze match, each match with its scheduled time and courts and its sides ("Winner A", "Winner QF1"; names for knockout only, by seed) until results fill them.
- **Schedule:** the venue and timeline as planned, to look at rather than rebuild. A hall's line is plain text (name, opens, closes, time unit, rate, courts) with only the court zoom icons. There is no hall settings panel, Copy from another hall, Flip hall, Delete hall, Add hall or Add court. A court shows its hours and umpires but they can't be changed, and has no copy or delete; **its group menu still works**. A click on a court opens its games in the panel. On the timeline only games can be dragged; stage zones, hall hours and rate bands, court hours and the buffer are fixed. Zoom, Fit play, Whole day, thin rows, Play and the hover card work as in Plan.

**Sample data.** To see how things look before real data exists, the stage being viewed can be filled with sample data (the wand at the right of the stage row: "Fill Plan with sample data"). It fills only what's still empty, so an empty stage is filled completely and a part-done one completed; nothing entered is overwritten. The Plan stage fills as a whole (tournament, venue, categories, scoring and timing, finance, rules); the Draw stage fills its entries (up to each category's expected number, with players, line-ups and seeds) and then makes the draw, without check-in. **Remove sample data** (the eraser: "Remove sample data from Draw: 32 entries, 2 draws") takes out that stage's sample data only; anything edited since it was filled is the organiser's and stays, as does a sample category holding entries, and a draw that held a removed entry is cleared (unlocking it). If the stage also holds the organiser's own data, it asks first. Results has nothing to fill; on Live the buttons are hidden. Fill and Remove are each one undoable step. Clear hall uses a broom, so the two can't be confused.

**Undo and redo.** Ctrl+Z (Cmd+Z on a Mac) undoes the last change to the plan, up to 10 changes back; Ctrl+Shift+Z or Ctrl+Y redoes. Changes made close together (typing, a run of stepper clicks) undo as one. Undo and redo buttons sit at the right of the name row. The history lives in the browser tab only and is lost on reload.

## Middle: venue canvas
- **Halls** hold **courts**. Add hall, add court. Scalable to any hall and court structure.
- **Hall header**, on one line: the editable hall name, a chevron that opens the hall settings in place, then the hall's settings set in line as plain text: **Opens**, **Closes** (typed, or stepped by the time unit with small chevrons), **Time unit** (minutes) and **Rate** (£ per court per unit; with rate bands on it reads "N rate bands" and opens the settings), then the number of courts. The line and the settings panel hold the same values. On the right, the court zoom icons, **Copy from another hall**, **Flip hall** (draws the courts right to left, 4, 3, 2, 1, to match the real hall; numbers, groups, hours and the timeline do not change; saved with the hall) and **Delete hall** (only when there is more than one hall). The settings panel starts closed; it is where rate bands are set.
- **Courts** sit in one row per hall that never wraps: drag the row sideways to see courts past the edge; adding a court slides to the end, where **Add court** is.
- **Hall settings** (rates are per hall):
  - Hall hours: from, until
  - **Rate bands:** one or more time bands, each with a from, until and a rate per court per hour (for example peak and off-peak). A hall starts with a single band covering its hours. Bands must not overlap and must cover the hall's hours. Gaps are flagged.
  - Shown as a strip across the day, so bands can be seen and edited visually
- **Court face.** Each court is drawn from above and edited on the court itself (see docs/design/court-face-wireframe.webp):
  - Surround, top: copy from the previous court (left) and delete court (right). Between them, with own courts per group, the court's group as a menu listing every group of the tournament with the courts it has ("Group A · C1, C2"), then No group and Automatic split. Choosing a group adds this court to it. A court set by hand shows a pin.
  - Each end: the side's name band ("Team A1"; the team's name in Live) and its draw slot, large. Player names arrive in Live.
  - Above the net, one centred line: the wave and rubber ("Wave 1 · R1/2"), or the knockout match, at the timeline's playhead. The court number is a faint watermark.
  - Umpire spots at the four corners and each end of the net; any spot toggles an umpire on or off, and the court's umpire count follows.
  - **Court sizes:** zoom out and zoom in icons on each hall's line set one size for every hall: Large, Medium (less detail, shorter) and Small (the box, its sides and its group, to see many halls at once; a click opens the whole court in a popup to change it).
  - Surround, bottom: the court's hours (defaults to the hall's hours; can be narrowed), each stepped up or down by the hall's charging unit.
- **Court hire** is calculated per court: its available time within each rate band, multiplied by that band's rate. Only booked time is charged.
- **Timeline header:** the title, a plain Play button (no fill until hovered) and the playhead's time in the same 20px type as the title.
- **Dragging a game** works like a video editor's timeline: the game in hand is outlined in the accent; in the lane under the pointer the games from the drop point on slide along to open a gap, with a dashed ghost of the game in it; letting go drops it there (the same lane rearranges, another lane takes it). A drop that isn't allowed is outlined in red and says why.
- **Timeline zoom:** zooming in goes towards Fit play; zooming out goes to Whole day, and once more to thin rows, where the timeline shrinks to a few thin bars per hall so more of the venue shows. Hovering a match says what it is at every level.
- **Timeline.** One overall timeline with a lane per hall, with rate bands shown as shading. Once the schedule is run, it shows stages and match waves across the halls. Used to see how groups and stages are distributed. With own courts per group, each court's lane label names its group(s), e.g. "Court 1 · A". It opens showing the whole day and can be zoomed (buttons, or Ctrl and the scroll wheel) and scrolled sideways; "Fit play" frames the matches.

## Right: workbench
### Sticky summary (always visible; on the workbench surface, collapsible to one line)
- **Fit status** (fits, tight, doesn't fit), shown with court time needed against court time available
- Total matches
- Revenue, total cost, profit or loss
- Break-even entries

### Tab 1. Tournament setup
- **Tournament type:** individual and pair events, or team. Team is always its own tournament and cannot share one with individual or pair categories.
- **Categories**
  - Individual and pair categories can be mixed in one tournament (for example singles and doubles as separate categories)
  - Individual: men's singles, women's singles
  - Pair: men's doubles, women's doubles, mixed doubles, open doubles
  - Team: line-up of a tie, with a rubber count for each of the six events (including open doubles)
- **Format:** groups then knockout, groups only, or knockout only
- **Rules** (set once for the tournament, not per category): tiebreak order, handicap, eligibility, withdrawal rules, walkover rules

### Tab 2. Schedule structure
Inputs
- Expected entries per category (individual, pair or team), and **expected external entries** next to it
- Number of groups or preferred group size
- Qualifiers per group
- Bronze match
- **Group courts:** own courts per group (default) or shared across the hall
- **Per stage** (group, knockout games, finals): points per game, deuce rule and cap, games per match (best of 1 or 3), minutes per game, organising time per match
- Buffer

Derived (shown within the tab)
- Group size, number of matches, matches per entry in the group stage
- Number of waves in the group stage
- Total expected play time, court time needed
- Fit status
- Suggested wave distribution for a multi-hall structure

### Tab 3. Finance
Inputs
- Entry fees, with an external fee for external entries
- Shuttles expected per game
- Cost per shuttle or per tube of 12
- Prizes
- Other costs
- Other money in

Derived
- Court hire, revenue, total cost
- Break-even entries
- Profit or loss
- **Suggested levers** (see below)

## Suggested levers
The app suggests levers the organiser can change to improve profit or fit. These are what-if suggestions that show their effect, not automatic optimisation. Each can be previewed across the summary, timeline and venue, then kept (the input changes) or discarded. Examples: add a court or extend hours, shorten matches (fewer points per game, best of 1), change the group structure, raise the entry or external fee, cap entries, reduce shuttles per game, reduce other costs.

## Rules for the flow
- Tabs run from stable to detailed. Setup is filled in once and rarely revisited; the other tabs are revisited constantly.
- A derived result appears as soon as the inputs it needs exist.
- Dependent fields: tournament type decides the category form; format decides which format fields appear; any best-of-3 stage reveals the best-of-3 allowance; categories feed the prize list.
- Editing the venue or setup flags the tuned values it affects and never changes them silently.
- A stage left blank is fine if no category plays it.

## Workbench rules (added 10 Nov 2026)
- **Field names:** every field in the workbench and in a hall's settings panel has a 12px caption above it that stays when the field is filled. The tournament's first row (name, date, time zone) and a hall's line keep their names inside or beside the value.
- **Help:** there is no ⓘ beside a field. Hovering or focusing a field shows its help, and what is wrong with its value. ⓘ stays beside headings and sub-headings.
- **No redundant text:** no label that repeats the heading right above it, and no "nothing yet" line where an Add button already says it.
- **Setup tab, Rules:** three groups under the Rules heading. **Tiebreak order** (plain list). **Who can enter** (a card: most categories per person, categories that can't be entered together, members-only categories, whether a member may pair with an external player). **Withdrawals and walkovers** (plain). Open doubles handicap sits after the tiebreak order when Open doubles is played.
- **Setup tab, Categories:** each chosen category is a row of its event and an optional category name, under the column captions "Event" and "Category name (optional)".
- **Schedule tab, Stages:** one sub-heading per stage (Group stage, Knockout rounds, Bronze match, Final). Under Group stage, "Group courts" first, as it is for every category. Then, in every stage, one card per category holding that category's settings for the stage: in the group stage its groups and qualifiers; in the bronze match its "Play a bronze match" switch; and always its points per game, games per match, deuce, minutes per game and organising time. Each card has "Same as group stage" (from the second stage on) and "Copy to all categories".
- **Schedule tab, Entries:** "Expected entries" and "External entries" per category.
- **Budget tab, figures:** Money in, Total cost and Profit are shown together at the top of the Finance card.
- **Budget tab, Break-even:** one figure for the whole tournament, in total entries: "The tournament breaks even at 24 pairs in total (32 expected)". Under it, a table of the breakdown at break-even beside the plan as expected (each category's entries, money in, total cost, profit), then the chart of profit against total entries. There is no category menu: a total is shared between the categories in the proportions of their expected entries.

## Live stage (from 11 Nov 2026)
Laid out like the Draw stage: a row of pages over the 960px central column, the same spacing, text levels and colour rules, in Light and Dark. Pages, in the order the day uses them: **Check-in · Court board · Standings and bracket · Changes** (all four are built). The audience board will be a full-screen page of its own. Nothing about money is shown while the tournament is Live, on any stage: the Budget tab is greyed and cannot be opened, and profit, fees and hire rates are not drawn.

- **Check-in:** a heading with "23 of 64 players checked in · 2 absent" and a bar of the same; a search that has the keyboard when the page opens, a category filter and a "Not checked in" switch; then one card per entry in order of first game. A card shows the entry's name, category, draw place and "First game 09:15 · Court 3", an "All arrived" button, and a row per player with a phone box (and a call link once filled) and three choices: Arrived, Not yet, Absent. An entry with an absent player is tagged Absent; one fully arrived is tagged All in. No side panel on this page.
- **Draw stage, Entries:** each player has a phone box under their name (beside it for a team's squad).
- **Court board:** a heading with "12 of 62 games played · 3 on court", Print score sheets and the court zoom icons; then each hall's name and its courts in the same sliding row as Plan. A court shows its current game: the sides, the group and wave along the net, the score so far under the net in large numerals, and a chip at its top (On court in shuttle yellow; Up next, Free or Done for today on a dark tint). Nothing about the venue can be changed. A click on a court selects it (accent outline) and opens it in the side panel. No timeline on this page.
- **Court board's side panel** (the workbench pattern: 440px, folds to a 40px rail): with no court chosen, **Call-up**: the next twelve games to call, soonest first, each with its time and court, what it is, both sides, and "Ready" or "N not checked in" (the names in its tooltip); a click opens its court. With a court chosen: a back arrow, then **On court / Up next** (the current game with its score entry), **Next on this court** and **Played on this court** (each game opens in place, to score it out of turn or correct it).
- **Score entry:** the two sides' names over two large number boxes per game ("Score" for best of 1; "Game 1…3" for best of 3, a later game opening once the one before is won). A wrong score is outlined in red with the reason under it. **Start game** puts it on court (typing a score does too); **Finish match** is available once the scores make a result; a finished match shows **Correct score**, which asks first. A game whose sides aren't known yet (a knockout game before its group or earlier match is finished) says so and can't be started; once they are known it shows their names and is scored like any other. A game whose sides a later correction changed says so in red above its score.
- **Print score sheets:** a button on Draw's Schedule page and on the Court board opens a small menu (Every game, Group stage only, a court, a category) with the number of sheets and pages, then the browser's print dialog.
- **Standings and bracket:** the central column, no side panel. Category tabs, each with "3 of 4 groups finished" or "Final played". Then the category's name with how it is ranked ("Top 2 of each group go through · ranked by matches won, then point difference, then head-to-head, then draw of lots") and, at the right, the **If it ended now** switch.
  - **Group tables,** two across: the group's name with "4 of 6 games played" or "Finished"; columns #, entry, P, W, L, then one per numeric tiebreak in use (GD, PD, Pts, RW), then a chip: In contention, Through, Out, Level (or Winner, for groups only). A dashed line under the last qualifying place. Shared places show as "2=". A table with entries level across the line says "Level on every tiebreak: decide by hand" in red.
  - **Knockout,** under the tables: a column per round to the Final (outlined in shuttle yellow) with the Bronze match under it. Each match box has its code, its time and court (a link that opens that court on the Court board; "On court" in place of the time while it is being played), then each side with its score per game (rubbers won for a team tie), the winner in bold. Sides not yet known show where they come from ("Winner QF1") in grey. Under the Final, **Champion** and the name. A match whose sides changed after it was played says so in red.
  - **If it ended now** fills the knockout's open group places with the entries currently in them, in grey italics, with a line saying so. It is off and disabled once every group has finished.
  - Knockout only: no tables, the bracket by seed. Groups only: no bracket.
- **Undo while Live:** the undo and redo arrows are disabled, with "No undo while Live: reverse a change from the Changes page".
- **Court board's timeline:** the Court board sits over the same timeline as Plan and Draw (glass, docked at the bottom, folds and resizes the same way). A game that hasn't started is dragged to another court or another place in a court's order, with the ghost and the gap; each move is logged. Finished games are faded and can't be moved; the game on court has a shuttle-yellow outline and can't be moved. There is no "Reset all moves" here: a move is reversed from the log.
- **Award match…** (a quiet button beside Finish match on any game not finished) opens a dialog: **Why** (Walkover, with how the tournament scores it; or Retired), **Who wins it** (the two sides, each saying what the other did), and an optional note. Retired is pre-chosen when scores have been entered. An awarded match shows "W/O" or "Ret." after its score on the court, in the panel and on the bracket, and the panel says "won by walkover" or "won: … retired".
- **Standings and bracket, changes:** a withdrawn entry is last in its table, struck through, with a Withdrawn chip. A finished table with entries sharing a place has **Decide…**, which opens a dialog listing them with up and down arrows and an optional note; afterwards the table says "Level entries were placed by hand (see Changes)".
- **Check-in:** a withdrawn entry has a Withdrawn chip.
- **Changes:** the central column, no side panel. A heading with "3 changes in force · 10 entries in the log", **Print log** and **Withdraw an entry…** (the page's main action). A paragraph saying where the other changes are made. Then a search and a kind filter, and the log, newest first: each entry a card with the time, a chip for its kind, "by Desk", the sentence, the note, and **Reverse** at the right. A reversed entry is struck through with "Reversed 14:32". Reverse asks first; where a later change stands in the way the button is disabled and its tooltip names that change. The first entry, "The tournament went Live", has **Take out of Live** in place of Reverse.
- **Withdraw an entry…** opens a dialog: who (entries listed by category), then for a group-stage withdrawal the two choices (Played results stand; All its results are voided) with the tournament's rule pre-chosen, the games given as walkovers or no longer counted, the group's table now and after side by side, and an optional note. The action is the destructive button.
