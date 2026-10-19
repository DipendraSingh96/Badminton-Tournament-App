# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Primary: the main organiser.** For now that is the product owner alone, planning and running their own badminton tournaments. Use by other organisers or clubs is undecided.
- **On the day (Live mode, per `docs/PRD.md` §2):**
  - **Tournament referee:** makes controlled changes.
  - **Control desk:** enters scores and runs call-ups.
  - **Umpires:** score their own match.
  - **Spectators and players:** a read-only link, no login.

## Product Purpose

Helps an organiser decide whether a tournament is worth running, then run it. In Plan mode they set:

- the frame: halls, courts, hours and hire rates
- the categories and format
- the rules
- the finance

The app shows whether the event fits the time and courts and whether it pays for itself. The same tournament record then goes Live: court board, call-ups, score entry, standings, bracket progression and delay tracking. After the event it becomes a results page.

Success means the organiser commits to a format knowing it fits and breaks even, and on the day nothing is entered twice.

## Positioning

- **Decide before committing.** Capacity, schedule and break-even respond to every input. What-ifs and suggested levers show what to change before anything is booked.
- **One record, plan to live.** The plan *is* the live tournament. Structure locks at Live, and only audit-logged controlled changes can modify it.
- **Hands-on timeline.** The estimated day is visible and movable by hand:
  - stage zones can be moved in time or between halls
  - single matches can be shuffled within their zone
  - hall hire is shown in whole units
  - late matches are flagged, never dropped.

## Operating Context

- **Plan mode:** desk work on a laptop or desktop, iterating on what-ifs. Layout and content follow `docs/IA.md`.
- **Live mode:** a sports hall on the day.
  - Score entry must work one-handed on a phone.
  - The court board must be readable from a distance on a large screen.
- **Locale:** one-day events. UK English. Times are stored in UTC and shown in the tournament's time zone.

## Capabilities and Constraints

- **Formats:** groups then knockout, knockout only, or groups only.
- **No fixed values:** every tournament number is an organiser input or calculated from inputs. Settings that affect results are stored and editable.
- **Engine:** calculations live in a pure, tested engine (`src/engine/`).
- **Permissions** are enforced in Supabase RLS.
- **Out of scope (MVP):** other formats, online payments, notifications, multi-day events, public tournament discovery.
- **Open product questions** (PRD §12):
  - entry fee basis
  - who registers pairs
  - draw method
  - the score-correction window
- **Data and privacy:** UK data protection rules apply (PRD §13):
  - minimum personal data
  - no contact or finance data on spectator pages
  - no tracking cookies
  - organiser-controlled display names, publishing and retention.

## Brand Commitments

- **Name:** none yet. "Badminton Tournament App" is a working name.
- **Voice:** plain, direct UK English. Short sentences that say what happens, e.g. "Runs past closing", "Stays in the group stage".
- **Visual direction:** to be supplied by the product owner, who is a UX designer. Until then the app uses neutral design tokens (PRD §11).

## Evidence on Hand

- **Requirements:** `docs/PRD.md`, `docs/IA.md`, `docs/wireframe-context.md`.
- **Real users and data:** no testimonials, users, logos or event data yet. Don't invent any.

## Product Principles

1. **Answer the decision first.** Does it fit? Does it pay? Then show what to change.
2. **Nothing is entered twice.** Plan, live and results are one record.
3. **Derived, not filled in.** Zones, schedules and structure come from inputs. Manual moves adjust them and never become required fields.
4. **Never silently lose work.** Changes flag problems, such as late matches or a zone that can't start; they don't drop or move things unasked.
5. **Built for the hall.** Live screens are designed for a phone in one hand and a board across the room.

## Accessibility & Inclusion

- WCAG AA contrast for all text, in light and dark themes.
- At least 3:1 contrast for input outlines and focus rings.
- Interactions such as timeline moves have keyboard equivalents.
