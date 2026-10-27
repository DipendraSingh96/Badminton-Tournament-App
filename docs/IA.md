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
1. **Left panel:** list of previous tournaments, and **New tournament**. A new tournament can be started by duplicating a previous one. A duplicate copies everything (including expected entries) except name, date and results. The panel collapses to a thin rail (expand, New tournament, the current tournament's initial); the choice is remembered.
2. **Middle: working area.** Tournament name, date and time zone across the top. Below them, the venue canvas (halls, courts). The timeline is docked along the bottom of the working area, with a draggable height that is remembered, so the venue and the timeline are visible together.
3. **Right: workbench.** A sticky summary on top, then tabs. Panel width is variable (to be settled in the UI).

The shell (top bar, left panel, workbench) never scrolls as a page; only the panes inside it scroll.

**Undo and redo.** Ctrl+Z (Cmd+Z on a Mac) undoes the last change to the plan, up to 10 changes back; Ctrl+Shift+Z or Ctrl+Y redoes. Changes made close together (typing, a run of stepper clicks) undo as one. Undo and redo buttons sit in the top bar. The history lives in the browser tab only and is lost on reload.

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
