# Tournament setup inputs

Every input the Plan mode planner uses, grouped for information architecture and user flow:

- **Tier 1, base set-up:** defines the event; set first and rarely changed.
- **Tier 2, structure and time tuning:** adjusted until the plan fits the time and courts.
- **Tier 3, money tuning:** adjusted until the plan pays for itself.

Source of truth for the fields: `src/lib/tournament/draft.ts` (form state) and `src/lib/tournament/schema.ts` (rules). Requirements: `docs/PRD.md`.

---

## Tier 1: Base set-up (defines the event; set first, rarely changed)

### 1a. The day
| Input | Rule | Feeds |
|---|---|---|
| Tournament name | Optional | Labels only |
| Date | Required | Times |
| Time zone | Required (defaults to the browser's) | Times shown and stored |
| Start time | Required | Playing time |
| End time | Required, after start | Playing time (a ceiling: may finish earlier, never later) |
| Buffer (minutes) | Required, 0 or more | Held back at the end of the day (prize distribution etc.); cuts usable time, still paid for |

### 1b. Venue
| Input | Rule | Feeds |
|---|---|---|
| Court windows (one or more) | At least one; windows must not overlap | Capacity, court hire |
| ↳ From, Until | Required per window | Court time available |
| ↳ Courts | Whole number, 1 or more | Court time available, court hire |
| ↳ Rate per court per hour (£) | Required, 0 or more | Court hire (all booked time is charged) |
| Umpires available | Whole number, 0 or more | Only "per umpire" costs today (the user still has to decide where it belongs) |

### 1c. What is being played
| Input | Rule | Feeds |
|---|---|---|
| Unit of play | Once per tournament: individual entries, or teams | Shape of every category |
| Categories (one or more) | At least one | Everything downstream |
| ↳ *Individual:* Event | Men's singles, women's singles, men's doubles, women's doubles, mixed doubles, open doubles (doubles only) | Players per entry; which timing is needed |
| ↳ *Individual:* Name | Optional (defaults to the event) | Labels |
| ↳ *Team:* Competition name | Required | Labels |
| ↳ *Team:* Line-up of a tie | A rubber count for each of the six events; at least one rubber. All rubbers are played; most rubbers wins. One player per rubber, so the line-up sets the squad | Matches per tie, squad size, which timing is needed |
| ↳ Expected entries / Expected teams | Whole number, 2 or more | Format, matches, revenue, player count |

---

## Tier 2: Tuning: structure and time (adjusted until the plan fits)

### 2a. Format
| Input | Rule | Feeds |
|---|---|---|
| Format type | Once per tournament: groups then knockout, knockout only, or groups only | Which fields below appear |
| ↳ Groups | *Groups formats only:* propose from a preferred group size, or set the number of groups | Group split |
| ↳ Preferred group size / Number of groups | Whole number; size 2 or more, count 1 or more | Group matches |
| ↳ Qualifiers per group | *Groups then knockout only:* 1 up to the smallest group | Knockout size |
| ↳ Bronze match | On/off; *knockout formats only* | One extra match per category |

### 2b. Scoring (per stage played: group, knockout rounds, bronze, final)
| Input | Rule | Feeds |
|---|---|---|
| Points per game | Whole number, 1 or more | Worst-case length |
| Deuce rule | None, hard cap, or win by two up to a maximum | Worst-case length |
| ↳ Cap / Maximum points | *Cap or standard only:* above points per game | Worst-case length |
| Games per match | Best of 1 or best of 3 | Typical and worst-case length, shuttles |
| Best-of-3 allowance (%) | *Shown when any stage is best of 3;* once per tournament | Typical best-of-3 length and shuttles; typical never exceeds the worst case |

A stage left blank is fine if no category plays it.

### 2c. Timing (per event in use)
| Input | Rule | Feeds |
|---|---|---|
| Minutes per game | More than 0 | Match slot length |
| Organising time per match | 0 or more | Match slot length |

Only the events chosen in 1c are asked for.

---

## Tier 3: Tuning: money

### 3a. Entry fees (per category)
| Input | Rule | Feeds |
|---|---|---|
| Charged | Per player, or per entry (player, pair or team) | Revenue |
| Fee (£) | 0 or more | Revenue |
| External fee (£) | Optional; defaults to the fee | Revenue |
| Expected external players/entries | Optional; capped at total entrants | Revenue |

### 3b. Running costs
| Input | Rule | Feeds |
|---|---|---|
| Shuttles per game | 0 or more (fractions allowed) | Shuttle cost |
| Cost per shuttle (£) | 0 or more | Shuttle cost |
| Prizes (list) | Category, position, amount | Prize cost |
| Other costs (list) | Name, then fixed or per person | Other costs |
| ↳ Fixed: amount | 0 or more | Other costs |
| ↳ Per person: amount and "per" | Per player, per umpire, or a typed number of people | Other costs |

---

## Not inputs: what the planner works out
- **Time:**
  - playing time
  - court time available (by window)
  - slot length per stage and event (typical and worst)
  - court time needed (typical and worst)
  - spare or short
  - suggested fixes (extra minutes, extra courts, fewer matches)
- **Structure:**
  - group sizes
  - qualifiers
  - bracket and byes
  - fixtures (ties) per stage
  - matches (fixtures × rubbers)
  - team squad size
  - player headcount
- **Money:**
  - court hire
  - games and shuttles
  - revenue per category
  - total cost
  - profit, or the cost to the organisers
  - break-even entries and the profit curve
- **Dashboard-only controls** (not plan data): the profit-curve category, and "show up to" entries.

## Dependencies (drive the flow order)
1. Unit of play → the category form (event vs team line-up, "entries" vs "teams").
2. Format type → which format fields show (groups, qualifiers, bronze).
3. Events and line-ups → which events need timing.
4. Any best-of-3 stage → the allowance field.
5. Categories → the prize category list; umpires → "per umpire" costs.
6. All of tiers 1 and 2a–2c → capacity. Adding tier 3 → finance.

## Suggested flow
1. **The day:** date, time zone, start, end, buffer.
2. **Venue:** court windows (times, courts, rate), umpires. Capacity available is known at this point.
3. **What's played:** unit of play, then categories (events or team line-ups) and expected entries.
4. **Format:** format type, then groups, qualifiers and bronze per category.
5. **Rules of play:** scoring per stage, the best-of-3 allowance, timing per event. The full capacity check is ready here.
6. **Money:** fees, shuttles, prizes, other costs. Finance, break-even and profit are ready here.
7. **Tune loop:** the dashboard shows fits/tight/doesn't fit and profit. The organiser goes back to tier 2 and 3 levers (and buffer, courts or entries) until the plan fits and pays.

## Open points for the IA
- **Umpires:** placement is still to be decided by the user. Today the count only feeds per-umpire costs.
- **Buffer:** sits in tier 1 but works as a capacity lever.
- **Expected entries:** sits in tier 1, but also drives format and break-even, so it's often revisited in the tune loop.
