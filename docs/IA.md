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
3. **Right: workbench** (Plan stage only). It starts below the name row, level with the stage row, and runs to the bottom; 440px wide. From its top: the **progress bar** (five parts: Basics, Venue, Setup, Schedule, Budget, each filled when nothing in it is missing) with the fit chip and ✕ to fold it away; "N items to fill in" with the next item and an arrow pointing down to it, or once complete one line of results (court time · matches · profit); then three tabs side by side, **Setup · Schedule · Budget**, so the fit stays in view across all three. Sections are separated by spacing and headings, with no dividers. Folded, it is a 40px rail with « and the progress parts stacked vertically; the choice is remembered.

**Surfaces.** The sidebar keeps its own colour with no visible borders. The main column and the workbench share the page background. Two **open dividers** separate them: one soft line between the working space and the workbench, one between the venue and the timeline; each stops 16px short of the shell's edges. The timeline has no lines across it. It folds to a 40px bar: play, the time, a scrubber over the day marked where the group stage, knockout rounds and final start, and an arrow to expand.

**Fields.** Text, number, stepper, date, time and select fields show their label inside (as placeholder; a select's empty option), not above; the label stays as the field's accessible name and tooltip. A field is a soft box with no border, a step stronger on hover, with the focus ring on focus. Time fields carry their label inside at the left (the hall's hours read Opens and Closes). A field's help (ⓘ) sits beside its box. **A wrong value** outlines the field in red and puts the reason in its tooltip (and its description, for screen readers); nothing is printed under the field, so rows keep their shape. Where a panel has a summary line (the hall's rate bands: "Bands overlap from 12:00 to 13:00"), that is the one visible message. Choice groups (segmented controls, option cards) keep their labels.

**Buttons.** Icon buttons are squares that hug their icon, with no fill or border until hovered. Secondary text buttons (Add hall, Play, Paste rows…) have a soft fill and no border; primary buttons are filled.

**Sizes and spacing.** Containers and the shell sit on multiples of 40px: sidebar 280, central column 960 at most, workbench 440, rails 40, court cards 200. Fields and small controls size to their content and share their row. Gaps follow one scale: 4px icon to text; 8px between controls in a row; 12px between rows of a group; 16px inside panels and from the shell's edge (so 16px above the name row, 16px from it to the stage row, and 16px under the stage row, kept clear as the page scrolls beneath); 24px between sections. Everything in a panel shares one left edge.

**Rate bands.** A hall with rates that change during the day shows a fixed track of the day, always 06:00 to 24:00, so it never shifts. The organiser drags on a free part of the track to set a band ("Drag to set Band 1" while it's empty), drags a band or its edges to move or resize it, and can type the same times in the band's row. **The bands set the hall's hours:** the hall opens when the earliest band starts and closes when the latest ends, so there's no need to set the hours first. A band 09:00 to 13:00 and another 13:00 to 19:00 make the hall 09:00 to 19:00; shortening or removing a band changes the hours with it. A hall whose hours were set before ticking "Rate changes during the day" starts with one band over those hours. A band drawn close to its neighbour joins it; bands can't be dragged over each other. A gap between bands is hatched red on the track and named in the panel's summary line, as is an overlap typed in the rows. Times under the track show the hall's hours and band edges, with a dimmer scale every three hours.

The shell (sidebar, main column, workbench) never scrolls as a page; only the panes inside it scroll.

**Stages.** The stage row under the tournament's name: Plan · Draw · Live · Results. Stages reached show a tick and can be viewed; the next is reached by choosing it (asks first); later ones wait. In Plan, once entries are closed a bar above the summary says so ("Using real entries. The plan uses the N entries entered." with Use expected numbers) or, with the draw locked, "Draw locked. Categories, groups, rules and entries are read-only." with Unlock draw.

**Draw stage.** Pages along the top, in order: Entries, Draw, Teams, Group stage, KO stage, Schedule, in the central column like everything else; Schedule's timeline runs edge to edge. Entries: one category at a time (a tab per category with its count); a table of entries (number, name, players, external, seed, remove), with Add, Paste rows and Import CSV (a preview lists rows that can't be read before anything is added). A team's row opens to its squad and its line-up: each rubber with its players chosen from the squad, flagged until complete. Draw: per category, Make the draw fills the plan's groups (with the real entries; knockout only is one list in seed order). Groups show side by side, each place as slot (A1), name, seed in brackets and an Ext chip for external entries. Choose one entry, then another, to swap them; Redraw keeps the seeds; Lock draw makes it final (and the structure read-only), Unlock undoes that. A draw made before entries or group sizes changed is flagged and must be made again before locking. Schedule: the venue and timeline as in Plan, with the draw's names: a court's name bands show the teams (or pairs, players) and its halves the players of the rubber; match descriptions on the timeline use the names. The right-hand panel (where the workbench is in Plan) is the court panel: with a court chosen (click it; it's outlined in shuttle yellow), the match on it now at the playhead, the next three with readiness (Ready, or how many players haven't checked in, with each player's Arrived, Not yet or Absent), and the rest of its day under "Later today"; with none chosen, the call-up list of the next matches across the venue, each with its court. Teams: on the left, every team (or pair, player) in draw order, searchable by team or player name and filterable by category, each with its draw place, next match (time and court) and check-in (N/M in, or Absent), and a count of players checked in; on the right, the chosen one: category, draw place, seed and external, each player's check-in (Arrived, Not yet, Absent; or Check in everyone), a team's line-up, and every match with time, court, opponent and where it sits (choose a player to see only their matches; the match on now is highlighted). Knockout matches, results and qualification follow with Live. Group stage: per category, a standings table per group in the configured tiebreak order (#, team, played, won, lost, and a column per numeric tiebreak), with a dashed line under the places that go through and a status chip per row (In contention until results; Through or Out once Live decides them); an "If it ended now" switch previews the knockout places once results exist. KO stage: per category, the knockout from the first round to the final (outlined in shuttle yellow) and the bronze match, each match with its scheduled time and courts and its sides ("Winner A", "Winner QF1"; names for knockout only, by seed) until results fill them.

**Sample data.** To see how things look before real data exists, the stage being viewed can be filled with sample data (the wand at the right of the stage row: "Fill Plan with sample data"). It fills only what's still empty, so an empty stage is filled completely and a part-done one completed; nothing entered is overwritten. The Plan stage fills as a whole (tournament, venue, categories, scoring and timing, finance, rules); the Draw stage fills its entries (up to each category's expected number, with players, line-ups and seeds) and then makes the draw, without check-in. **Remove sample data** (the eraser: "Remove sample data from Draw: 32 entries, 2 draws") takes out that stage's sample data only; anything edited since it was filled is the organiser's and stays, as does a sample category holding entries, and a draw that held a removed entry is cleared (unlocking it). If the stage also holds the organiser's own data, it asks first. Results has nothing to fill; on Live the buttons are hidden. Fill and Remove are each one undoable step. Clear hall uses a broom, so the two can't be confused.

**Undo and redo.** Ctrl+Z (Cmd+Z on a Mac) undoes the last change to the plan, up to 10 changes back; Ctrl+Shift+Z or Ctrl+Y redoes. Changes made close together (typing, a run of stepper clicks) undo as one. Undo and redo buttons sit at the right of the name row. The history lives in the browser tab only and is lost on reload.

## Middle: venue canvas
- **Halls** hold **courts**. Add hall, add court. Scalable to any hall and court structure.
- **Hall header**, on one line: the editable hall name, a chevron that opens the hall settings in place, the summary (hours, charging unit, rate, courts), and a **copy from another hall** button at the end of the summary. On the right, **Clear hall** (keeps the name; empties hours, rates and courts) and **Delete hall** (only when there is more than one hall).
- **Hall settings** (rates are per hall):
  - Hall hours: from, until
  - **Rate bands:** one or more time bands, each with a from, until and a rate per court per hour (for example peak and off-peak). A hall starts with a single band covering its hours. Bands must not overlap and must cover the hall's hours. Gaps are flagged.
  - Shown as a strip across the day, so bands can be seen and edited visually
- **Court face.** Each court is drawn from above and edited on the court itself (see docs/design/court-face-wireframe.webp):
  - Surround, top: copy from the previous court (left) and delete court (right). Between them, with own courts per group, the court's group as a menu listing every group of the tournament with the courts it has ("Group A · C1, C2"), then No group and Automatic split. Choosing a group adds this court to it. A court set by hand shows a pin.
  - Each end: the side's name band ("Team A1"; the team's name in Live) and its draw slot, large. Player names arrive in Live.
  - Above the net, one centred line: the wave and rubber ("Wave 1 · R1/2"), or the knockout match, at the timeline's playhead. The court number is a faint watermark.
  - Umpire spots at the four corners and each end of the net; any spot toggles an umpire on or off, and the court's umpire count follows.
  - Surround, bottom: the court's hours (defaults to the hall's hours; can be narrowed), each stepped up or down by the hall's charging unit.
- **Court hire** is calculated per court: its available time within each rate band, multiplied by that band's rate. Only booked time is charged.
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
