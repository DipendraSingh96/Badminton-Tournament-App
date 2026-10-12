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
1. **Left panel:** list of previous tournaments, and **New tournament**. A new tournament can be started by duplicating a previous one. A duplicate copies everything (including expected entries) except name, date and results.
2. **Middle: working area.** Tournament name, date and time zone across the top. Below them, the venue canvas (halls, courts) and the timeline.
3. **Right: workbench.** A sticky summary on top, then tabs. Panel width is variable (to be settled in the UI).

## Middle: venue canvas
- **Halls** hold **courts**. Add hall, add court. Scalable to any hall and court structure.
- **Hall settings** (rates are per hall):
  - Hall hours: from, until
  - **Rate bands:** one or more time bands, each with a from, until and a rate per court per hour (for example peak and off-peak). A hall starts with a single band covering its hours. Bands must not overlap and must cover the hall's hours. Gaps are flagged.
  - Shown as a strip across the day, so bands can be seen and edited visually
  - Option to copy hall settings from another hall
- **Selecting a court** opens its details:
  - Available from, until (defaults to the hall's hours; can be narrowed)
  - Umpires on the court
  - Option to copy these from the previous court
- **Court hire** is calculated per court: its available time within each rate band, multiplied by that band's rate. Only booked time is charged.
- **Timeline.** One overall timeline with a lane per hall, with rate bands shown as shading. Once the schedule is run, it shows stages and match waves across the halls. Used to see how groups and stages are distributed.

## Right: workbench
### Sticky summary (always visible)
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
The app suggests levers the organiser can change to improve profit or fit. These are what-if suggestions that show their effect, not automatic optimisation. Examples: add a court or extend hours, shorten matches (fewer points per game, best of 1), change the group structure, raise the entry or external fee, cap entries, reduce shuttles per game, reduce other costs.

## Rules for the flow
- Tabs run from stable to detailed. Setup is filled in once and rarely revisited; the other tabs are revisited constantly.
- A derived result appears as soon as the inputs it needs exist.
- Dependent fields: tournament type decides the category form; format decides which format fields appear; any best-of-3 stage reveals the best-of-3 allowance; categories feed the prize list.
- Editing the venue or setup flags the tuned values it affects and never changes them silently.
- A stage left blank is fine if no category plays it.
