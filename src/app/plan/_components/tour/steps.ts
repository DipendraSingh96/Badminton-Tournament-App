import type { TourState } from "@/lib/tournament/tour-sample";

// The product tour, as data: ten chapters of short steps. Each step lights
// one part of the real screen and says what it is and how it is used. The
// screen a step needs (which sample, stage, page, tab and panels) is part of
// the step, so any chapter can be started cold.
//
// The tour begins on a blank tournament, as a new one opens, and the sample
// fills in as the chapters go. The side panel and the timeline stay folded
// until their own chapters; after that they are open where a step is about
// them and folded where the step is about the main area.

/** The screen a step is shown on. */
export interface TourScreen {
  /** The point of the sample tournament's life. */
  sample: TourState;
  stage: "plan" | "draw" | "live" | "results";
  /** The Plan side panel's tab. */
  tab?: "setup" | "schedule" | "finance";
  drawView?: "entries" | "draw" | "bracket" | "courts" | "resources";
  liveView?: "checkin" | "board" | "standings" | "knockout" | "changes";
  resultsView?: "summary" | "groups" | "knockout" | "day" | "money" | "changes";
  /** The side panel: folded unless said. */
  panel?: boolean;
  /** The timeline: folded unless said. */
  timeline?: boolean;
  /** A rehearsal (Simulate live): opened, or opened and started. */
  rehearsal?: "open" | "started";
}

export interface TourStep {
  id: string;
  /** What to light: a CSS selector for one element on the screen. */
  target: string;
  title: string;
  body: string;
  screen: TourScreen;
}

export interface TourChapter {
  id: string;
  title: string;
  steps: TourStep[];
}

const stages = 'nav[aria-label="Stages"]';
const page = '[data-tour="page"]';
const sidePanel = 'aside[aria-label="Side panel"]';

/** The Plan stage on the sample as far as it has been filled in; panels folded unless said. */
const plan = (sample: TourState, more: Partial<TourScreen> = {}): TourScreen => ({ sample, stage: "plan", ...more });
const draw = (more: Partial<TourScreen> = {}): TourScreen => ({ sample: "draw", stage: "draw", drawView: "entries", ...more });
const rehearsal = (more: Partial<TourScreen> = {}): TourScreen => ({ sample: "ready", stage: "live", liveView: "checkin", rehearsal: "open", ...more });
const live = (more: Partial<TourScreen> = {}): TourScreen => ({ sample: "midday", stage: "live", liveView: "board", ...more });
const results = (more: Partial<TourScreen> = {}): TourScreen => ({ sample: "results", stage: "results", resultsView: "summary", ...more });

export const TOUR: TourChapter[] = [
  {
    id: "start",
    title: "Start a tournament",
    steps: [
      {
        id: "start-new",
        target: '[data-tour="new"]',
        title: "New tournament",
        body: "Every tournament starts here, blank, like the one behind this card. The tour fills in a sample as it goes; nothing of yours is touched.",
        screen: plan("blank"),
      },
      {
        id: "start-basics",
        target: '[data-tour="basics"]',
        title: "Name, date and time zone",
        body: "Give it a name, the day it is played and its time zone. All times are shown in that zone. You can change these later.",
        screen: plan("basics"),
      },
      {
        id: "start-list",
        target: 'section[aria-labelledby="tournaments-heading"]',
        title: "Your tournaments",
        body: "Each one is saved to your account as you work, so it opens on any device you sign in on. The open one can be duplicated or deleted from its card.",
        screen: plan("basics"),
      },
    ],
  },
  {
    id: "stages",
    title: "The four stages",
    steps: [
      {
        id: "stages-row",
        target: stages,
        title: "Plan, Draw, Live, Results",
        body: "A tournament moves through four stages, left to right. One record carries through all of them.",
        screen: plan("basics"),
      },
      {
        id: "stages-what",
        target: stages,
        title: "What each stage is for",
        body: "Plan: design the day and price it. Draw: take the real entries and make the draw. Live: run the day. Results: what happened, and the money.",
        screen: plan("basics"),
      },
      {
        id: "stages-moving",
        target: stages,
        title: "Moving on",
        body: "The next stage opens once this one is complete, and it asks first. A stage you have reached shows a tick and can be looked at again.",
        screen: plan("basics"),
      },
    ],
  },
  {
    id: "venue",
    title: "The venue",
    steps: [
      {
        id: "venue-hall",
        target: '[data-tour="hall-line"]',
        title: "A hall",
        body: "Set the hall's time unit (how hire is charged), its rate, and when it opens and closes. The arrow opens more settings, such as different rates through the day.",
        screen: plan("hall"),
      },
      {
        id: "venue-add",
        target: '[data-tour="add-court"]',
        title: "Add courts and halls",
        body: "A new hall has one court. Add the rest here. Add hall, under the courts, starts another hall with its own hours and rate.",
        screen: plan("hall"),
      },
      {
        id: "venue-court",
        target: "[data-court-card]",
        title: "A court",
        body: "Each court has its own hours: set them to what the tournament needs. They can differ from the hall's, for a court booked for only part of the day. The circles are umpire spots: click one to seat an umpire.",
        screen: plan("courts"),
      },
      {
        id: "venue-size",
        target: '[data-tour="court-size"]',
        title: "Court size",
        body: "Make the courts smaller to see a whole venue at once, or larger for detail. It changes the view only.",
        screen: plan("courts"),
      },
    ],
  },
  {
    id: "panel",
    title: "The side panel",
    steps: [
      {
        id: "panel-summary",
        target: 'section[aria-label="Summary"]',
        title: "The plan at a glance",
        body: "The side panel opens from the right. Its top says how many items are still to fill in. Once the plan is whole it shows whether the matches fit, with the court hours, the number of matches and the profit.",
        screen: plan("courts", { panel: true, tab: "setup" }),
      },
      {
        id: "panel-setup",
        target: '[data-tour="tabs"]',
        title: "Setup",
        body: "Who enters (individuals and pairs, or teams), the categories, the format (groups, knockout, or both) and the rules: tiebreak order, who can enter, withdrawals and walkovers.",
        screen: plan("setup", { panel: true, tab: "setup" }),
      },
      {
        id: "panel-schedule",
        target: '[data-tour="tabs"]',
        title: "Schedule",
        body: "How many entries you expect, the group sizes and who goes through, the scoring and minutes per game for each stage, and extra time for long matches and prize giving.",
        screen: plan("schedule", { panel: true, tab: "schedule" }),
      },
      {
        id: "panel-budget",
        target: '[data-tour="tabs"]',
        title: "Budget",
        body: "Entry fees, shuttles, prizes and other costs. Court hire comes from the venue. Every figure shows how it is worked out.",
        screen: plan("plan", { panel: true, tab: "finance" }),
      },
      {
        id: "panel-draws",
        target: "[data-move-to-draws]",
        title: "Move to Draws",
        body: "The plan is now complete and fits. This takes the tournament on to the Draw stage.",
        screen: plan("plan", { panel: true, tab: "finance" }),
      },
    ],
  },
  {
    id: "timeline",
    title: "The timeline",
    steps: [
      {
        id: "timeline-what",
        target: '[data-tour="timeline"]',
        title: "The day from above",
        body: "The whole day in time: a row for each court, a block for each match, and a zone for each stage. It is worked out from the plan and changes as the plan does.",
        screen: plan("plan", { timeline: true }),
      },
      {
        id: "timeline-play",
        target: '[data-tour="timeline-clock"]',
        title: "Play the day",
        body: "Play, or drag the cursor, to move through the day. The courts above show who is on at that moment.",
        screen: plan("plan", { timeline: true }),
      },
      {
        id: "timeline-move",
        target: '[data-tour="timeline-rows"]',
        title: "Move things by hand",
        body: "Drag a stage zone to your timing, or drag a match to another time or court. A team match-up's matches are linked and move together. Hover a match for its details.",
        screen: plan("plan", { timeline: true }),
      },
      {
        id: "timeline-tools",
        target: '[data-tour="timeline-tools"]',
        title: "Zoom and fold",
        body: "Zoom in and out, fit the playing hours, or fold the timeline to a bar. The dashed line is the worst-case finish, if every match runs long.",
        screen: plan("plan", { timeline: true }),
      },
    ],
  },
  {
    id: "draw",
    title: "The Draw stage",
    steps: [
      {
        id: "draw-entries",
        target: page,
        title: "Entries",
        body: "The real entries, per category: typed in, pasted from a spreadsheet or imported. Mark seeds and external entries here. From now on the plan uses these, not the expected numbers.",
        screen: draw({ drawView: "entries" }),
      },
      {
        id: "draw-draw",
        target: page,
        title: "Draw",
        body: "Make the draw: seeds are spread across the groups and the rest are placed at random. Drag one entry onto another to swap them, Redraw for a new one, then Lock draw when it is final.",
        screen: draw({ drawView: "draw" }),
      },
      {
        id: "draw-knockout",
        target: page,
        title: "KO stage",
        body: "The knockout bracket that follows the groups: who meets whom, round by round. Names fill in as the groups finish.",
        screen: draw({ drawView: "bracket" }),
      },
      {
        id: "draw-schedule",
        target: page,
        title: "Schedule",
        body: "The courts and the timeline with real names. It is for reading here: the day is as planned.",
        screen: draw({ drawView: "courts", timeline: true }),
      },
      {
        id: "draw-resources",
        target: page,
        title: "Resources",
        body: "What to bring and print for the day: shuttles, umpires, score sheets and the rules sheet.",
        screen: draw({ drawView: "resources" }),
      },
      {
        id: "draw-panel",
        target: sidePanel,
        title: "Teams",
        body: "Every entry by group, with a search. Click one to see its players and its matches. The button at the top is the way on.",
        screen: draw({ drawView: "draw", panel: true }),
      },
    ],
  },
  {
    id: "simulate",
    title: "Simulate live",
    steps: [
      {
        id: "simulate-what",
        target: "[data-draw-next]",
        title: "Simulate live",
        body: "Once every draw is locked, this opens a rehearsal of the day. It works as Live does, but nothing is saved and the tournament stays in the Draw stage.",
        screen: { sample: "ready", stage: "draw", drawView: "draw", panel: true },
      },
      {
        id: "simulate-checkin",
        target: page,
        title: "Check-in",
        body: "Live opens here. Mark each player Arrived, Not yet or Absent. A match goes on court only when all its players are checked in.",
        screen: rehearsal({ liveView: "checkin" }),
      },
      {
        id: "simulate-start",
        target: "[data-start-rehearsal]",
        title: "Start the simulation",
        body: "This begins the tournament day simulation. Its clock runs at a minute a second, and the first matches go on court.",
        screen: rehearsal({ liveView: "checkin" }),
      },
      {
        id: "simulate-board",
        target: page,
        title: "Court board",
        body: "Every court and who is on it. In a simulation the clock stops when a match's time is up, so you can practise entering its score.",
        screen: rehearsal({ liveView: "board", rehearsal: "started" }),
      },
      {
        id: "simulate-end",
        target: '[data-tour="end-rehearsal"]',
        title: "End the rehearsal",
        body: "Play, pause or stop the simulation here. Stopping returns to the draw with nothing changed, so you can rehearse as often as you like.",
        screen: rehearsal({ liveView: "board", rehearsal: "started" }),
      },
    ],
  },
  {
    id: "live",
    title: "Run the real day",
    steps: [
      {
        id: "live-go",
        target: "[data-draw-next]",
        title: "Go Live, on the day",
        body: "The real tournament can only go Live on its date: that day this button reads Go Live. The structure is then locked, and every change you make is logged.",
        screen: { sample: "ready", stage: "draw", drawView: "draw", panel: true },
      },
      {
        id: "live-clock",
        target: page,
        title: "The real clock",
        body: "On the day the clock is the real time and never pauses. Check players in, press Start tournament, and each court's next match goes on as soon as its players are free.",
        screen: live(),
      },
      {
        id: "live-score",
        target: sidePanel,
        title: "Enter the score to end a match",
        body: "A match ends only when you enter its score and finish it here; until then it stays on court, however long it runs. The next match then comes onto that court by itself.",
        screen: live({ panel: true }),
      },
      {
        id: "live-walkover",
        target: sidePanel,
        title: "Walkovers and withdrawals",
        body: "If a side can't play, open the match and give it as a walkover. An entry that leaves for the day is withdrawn from the Entries tab. Both follow the rules you set, and both can be reversed from Changes.",
        screen: live({ panel: true }),
      },
      {
        id: "live-grey",
        target: '[data-court-state="waiting"]',
        title: "A grey court is waiting",
        body: "Its next match can't start: a player isn't checked in. Check them in, give a walkover, or put another match on the court so it doesn't stand empty.",
        screen: live(),
      },
      {
        id: "live-drag",
        target: page,
        title: "Drag a match to a court",
        body: "Drag a waiting match from the Games panel onto any court to play it there next. The court takes it, and the match it replaced waits its turn.",
        screen: live({ panel: true }),
      },
      {
        id: "live-timeline",
        target: '[data-tour="timeline"]',
        title: "Reshuffle the timeline",
        body: "As the day drifts, drag matches that haven't started to another time or court to suit it. What has been played stays put, and the rest of the day re-times around your moves.",
        screen: live({ timeline: true }),
      },
    ],
  },
  {
    id: "finish",
    title: "Finish the tournament",
    steps: [
      {
        id: "finish-button",
        target: "[data-finish-tournament]",
        title: "Finish tournament",
        body: "This appears once every match has been played and nothing is left to decide, such as a level group. Here the sample's whole day has been played.",
        screen: { sample: "played", stage: "live", liveView: "board" },
      },
      {
        id: "finish-reopen",
        target: stages,
        title: "Not final until you say",
        body: "Finishing moves the tournament to Results. If a score needs correcting afterwards, Live can be reopened; both are logged.",
        screen: { sample: "played", stage: "live", liveView: "board" },
      },
    ],
  },
  {
    id: "results",
    title: "Results and wrap-up",
    steps: [
      {
        id: "results-summary",
        target: page,
        title: "Summary",
        body: "Winners and placings for every category, and the day in a few numbers.",
        screen: results({ resultsView: "summary" }),
      },
      {
        id: "results-tables",
        target: page,
        title: "Group tables and knockout",
        body: "The final group tables and the bracket with every score, as they ended.",
        screen: results({ resultsView: "groups" }),
      },
      {
        id: "results-money",
        target: page,
        title: "The day and the money",
        body: "The day sets what happened against the plan. Money shows plan against actual; correct any line with the real figure.",
        screen: results({ resultsView: "money" }),
      },
      {
        id: "results-sheet",
        target: "[data-results-sheet]",
        title: "Results sheet",
        body: "A sheet for players to print or save as a PDF: places, tables and the bracket. No money or phone numbers are on it.",
        screen: results({ resultsView: "summary" }),
      },
    ],
  },
];

/** The screen the sample is explored on once the tour is over: finished, so every stage can be looked at. */
export const EXPLORE: TourScreen = { sample: "results", stage: "results", resultsView: "summary", panel: true };

/** A place in the tour. */
export interface TourPlace {
  chapter: number;
  step: number;
}

/** The step after a place; null at the end of the tour. */
export function nextPlace(at: TourPlace): TourPlace | null {
  if (at.step + 1 < TOUR[at.chapter]!.steps.length) return { chapter: at.chapter, step: at.step + 1 };
  return at.chapter + 1 < TOUR.length ? { chapter: at.chapter + 1, step: 0 } : null;
}

/** The step before a place; null at the start of the tour. */
export function previousPlace(at: TourPlace): TourPlace | null {
  if (at.step > 0) return { chapter: at.chapter, step: at.step - 1 };
  return at.chapter > 0 ? { chapter: at.chapter - 1, step: TOUR[at.chapter - 1]!.steps.length - 1 } : null;
}
