import type { TourState } from "@/lib/tournament/tour-sample";

// The product tour, as data: nine chapters of short steps. Each step lights
// one part of the real screen and says what it is and how it is used. The
// screen a step needs (which sample, stage, page, tab and panels) is part of
// the step, so any chapter can be started cold.

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
  /** The side panel: open unless said. */
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

const plan: TourScreen = { sample: "plan", stage: "plan", tab: "setup" };
const draw: TourScreen = { sample: "draw", stage: "draw", drawView: "entries" };
const rehearsal: TourScreen = { sample: "ready", stage: "live", liveView: "checkin", rehearsal: "open", panel: false };
const results: TourScreen = { sample: "results", stage: "results", resultsView: "summary" };

export const TOUR: TourChapter[] = [
  {
    id: "start",
    title: "Start a tournament",
    steps: [
      {
        id: "start-new",
        target: '[data-tour="new"]',
        title: "New tournament",
        body: "Every tournament starts here. This tour uses a sample one, so nothing of yours is touched.",
        screen: plan,
      },
      {
        id: "start-basics",
        target: '[data-tour="basics"]',
        title: "Name, date and time zone",
        body: "Give it a name, the day it is played and its time zone. All times are shown in that zone. You can change these later.",
        screen: plan,
      },
      {
        id: "start-list",
        target: 'section[aria-labelledby="tournaments-heading"]',
        title: "Your tournaments",
        body: "Each one is saved to your account as you work, so it opens on any device you sign in on. The open one can be duplicated or deleted from its card.",
        screen: plan,
      },
    ],
  },
  {
    id: "stages",
    title: "The four stages",
    steps: [
      {
        id: "stages-row",
        target: 'nav[aria-label="Stages"]',
        title: "Plan, Draw, Live, Results",
        body: "A tournament moves through four stages, left to right. One record carries through all of them.",
        screen: plan,
      },
      {
        id: "stages-what",
        target: 'nav[aria-label="Stages"]',
        title: "What each stage is for",
        body: "Plan: design the day and price it. Draw: take the real entries and make the draw. Live: run the day. Results: what happened, and the money.",
        screen: plan,
      },
      {
        id: "stages-moving",
        target: 'nav[aria-label="Stages"]',
        title: "Moving on",
        body: "The next stage opens once this one is complete, and it asks first. A stage you have reached shows a tick and can be looked at again.",
        screen: plan,
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
        screen: { ...plan, panel: false },
      },
      {
        id: "venue-court",
        target: "[data-court-card]",
        title: "A court",
        body: "Each court has its own hours: set them to what the tournament needs. They can differ from the hall's, for a court booked for only part of the day. The circles are umpire spots: click one to seat an umpire.",
        screen: { ...plan, panel: false },
      },
      {
        id: "venue-add",
        target: '[data-tour="add-court"]',
        title: "Add courts and halls",
        body: "Add a court here. Add hall, under the courts, starts another hall with its own hours and rate. Copy and delete are at the top of each court.",
        screen: { ...plan, panel: false },
      },
      {
        id: "venue-size",
        target: '[data-tour="court-size"]',
        title: "Court size",
        body: "Make the courts smaller to see a whole venue at once, or larger for detail. It changes the view only.",
        screen: { ...plan, panel: false },
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
        body: "The bar shows court time needed against court time booked. Fits, Tight or Over says whether the matches fit, with the hours, the number of matches and the profit. While anything is missing, it says how many items are left.",
        screen: plan,
      },
      {
        id: "panel-setup",
        target: '[data-tour="tabs"]',
        title: "Setup",
        body: "Who enters (individuals and pairs, or teams), the categories, the format (groups, knockout, or both) and the rules: tiebreak order, who can enter, withdrawals and walkovers.",
        screen: { ...plan, tab: "setup" },
      },
      {
        id: "panel-schedule",
        target: '[data-tour="tabs"]',
        title: "Schedule",
        body: "How many entries you expect, the group sizes and who goes through, the scoring and minutes per game for each stage, and extra time for long matches and prize giving.",
        screen: { ...plan, tab: "schedule" },
      },
      {
        id: "panel-budget",
        target: '[data-tour="tabs"]',
        title: "Budget",
        body: "Entry fees, shuttles, prizes and other costs. Court hire comes from the venue. Every figure shows how it is worked out.",
        screen: { ...plan, tab: "finance" },
      },
      {
        id: "panel-draws",
        target: "[data-move-to-draws]",
        title: "Move to Draws",
        body: "When the plan is complete and fits, this takes the tournament on to the Draw stage.",
        screen: plan,
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
        body: "The whole day in time: a row for each court, a block for each match, and a band for each stage. It is worked out from the plan and changes as the plan does.",
        screen: { ...plan, panel: false, timeline: true },
      },
      {
        id: "timeline-play",
        target: '[data-tour="timeline-clock"]',
        title: "Play the day",
        body: "Play, or drag the cursor, to move through the day. The courts above show who is on at that moment.",
        screen: { ...plan, panel: false, timeline: true },
      },
      {
        id: "timeline-move",
        target: '[data-tour="timeline-rows"]',
        title: "Move things by hand",
        body: "Drag a match to another time or court, or drag a stage's band to leave a gap. A team match-up's matches are linked and move together. Hover a match for its details.",
        screen: { ...plan, panel: false, timeline: true },
      },
      {
        id: "timeline-tools",
        target: '[data-tour="timeline-tools"]',
        title: "Zoom and fold",
        body: "Zoom in and out, fit the playing hours, or fold the timeline to a bar. The dashed line is the worst-case finish, if every match runs long.",
        screen: { ...plan, panel: false, timeline: true },
      },
    ],
  },
  {
    id: "draw",
    title: "The Draw stage",
    steps: [
      {
        id: "draw-entries",
        target: '[data-tour="page"]',
        title: "Entries",
        body: "The real entries, per category: typed in, pasted from a spreadsheet or imported. Mark seeds and external entries here. From now on the plan uses these, not the expected numbers.",
        screen: { ...draw, drawView: "entries", panel: false },
      },
      {
        id: "draw-draw",
        target: '[data-tour="page"]',
        title: "Draw",
        body: "Make the draw: seeds are spread across the groups and the rest are placed at random. Drag one entry onto another to swap them, Redraw for a new one, then Lock draw when it is final.",
        screen: { ...draw, drawView: "draw", panel: false },
      },
      {
        id: "draw-knockout",
        target: '[data-tour="page"]',
        title: "KO stage",
        body: "The knockout bracket that follows the groups: who meets whom, round by round. Names fill in as the groups finish.",
        screen: { ...draw, drawView: "bracket", panel: false },
      },
      {
        id: "draw-schedule",
        target: '[data-tour="page"]',
        title: "Schedule",
        body: "The courts and the timeline with real names. It is for reading here: the day is as planned.",
        screen: { ...draw, drawView: "courts", panel: false, timeline: true },
      },
      {
        id: "draw-resources",
        target: '[data-tour="page"]',
        title: "Resources",
        body: "What to bring and print for the day: shuttles, umpires, score sheets and the rules sheet.",
        screen: { ...draw, drawView: "resources", panel: false },
      },
      {
        id: "draw-panel",
        target: 'aside[aria-label="Side panel"]',
        title: "Teams",
        body: "Every entry by group, with a search. Click one to see its players and its matches. The button at the top is the way on.",
        screen: { ...draw, drawView: "draw", panel: true },
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
        body: "Once every draw is locked, this opens a rehearsal of the day. It works exactly as Live does, but nothing is saved and the tournament stays in the Draw stage.",
        screen: { sample: "ready", stage: "draw", drawView: "draw", panel: true },
      },
      {
        id: "simulate-checkin",
        target: '[data-tour="page"]',
        title: "Check-in",
        body: "Live opens here. Mark each player Arrived, Not yet or Absent. A match goes on court only when all its players are checked in.",
        screen: { ...rehearsal, liveView: "checkin" },
      },
      {
        id: "simulate-start",
        target: "[data-start-rehearsal]",
        title: "Start the simulation",
        body: "This begins the day. The clock runs at a minute a second, and the first matches go on court.",
        screen: { ...rehearsal, liveView: "checkin" },
      },
      {
        id: "simulate-board",
        target: '[data-tour="page"]',
        title: "Court board",
        body: "Every court and who is on it. When a match's time is up the clock stops for you to enter its score.",
        screen: { ...rehearsal, liveView: "board", rehearsal: "started" },
      },
      {
        id: "simulate-games",
        target: 'aside[aria-label="Side panel"]',
        title: "Games",
        body: "The matches to run. Open one to type its score and finish it; the next match then comes onto that court. Walkovers and withdrawals are given here too.",
        screen: { ...rehearsal, liveView: "board", rehearsal: "started", panel: true },
      },
      {
        id: "simulate-end",
        target: '[data-tour="end-rehearsal"]',
        title: "End the rehearsal",
        body: "Standings, the knockout and a log of every change are on the other pages. End rehearsal returns to the draw with nothing changed. On the day itself, the button on the Draw stage reads Go Live.",
        screen: { ...rehearsal, liveView: "standings", rehearsal: "started" },
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
        screen: { sample: "played", stage: "live", liveView: "board", panel: false },
      },
      {
        id: "finish-reopen",
        target: 'nav[aria-label="Stages"]',
        title: "Not final until you say",
        body: "Finishing moves the tournament to Results. If a score needs correcting afterwards, Live can be reopened; both are logged.",
        screen: { sample: "played", stage: "live", liveView: "board", panel: false },
      },
    ],
  },
  {
    id: "results",
    title: "Results and wrap-up",
    steps: [
      {
        id: "results-summary",
        target: '[data-tour="page"]',
        title: "Summary",
        body: "Winners and placings for every category, and the day in a few numbers.",
        screen: { ...results, resultsView: "summary" },
      },
      {
        id: "results-tables",
        target: '[data-tour="page"]',
        title: "Group tables and knockout",
        body: "The final group tables and the bracket with every score, as they ended.",
        screen: { ...results, resultsView: "groups" },
      },
      {
        id: "results-money",
        target: '[data-tour="page"]',
        title: "The day and the money",
        body: "The day sets what happened against the plan. Money shows plan against actual; correct any line with the real figure.",
        screen: { ...results, resultsView: "money" },
      },
      {
        id: "results-sheet",
        target: "[data-results-sheet]",
        title: "Results sheet",
        body: "A sheet for players to print or save as a PDF: places, tables and the bracket. No money or phone numbers are on it.",
        screen: { ...results, resultsView: "summary" },
      },
    ],
  },
];

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
