import type { EventType, FormatType, TiebreakCriterion, Unit, WalkoverRule, WithdrawalRule } from "@/engine";

// Organiser-facing names for engine choices. UK English.

export const EVENT_LABELS: Record<EventType, string> = {
  MS: "Men's singles",
  WS: "Women's singles",
  MD: "Men's doubles",
  WD: "Women's doubles",
  XD: "Mixed doubles",
  OPEN: "Open doubles",
};

export const UNIT_LABELS: Record<Unit, string> = {
  individual: "Individual entries (players or pairs)",
  team: "Teams",
};

export const FORMAT_LABELS: Record<FormatType, string> = {
  groupsKnockout: "Groups, then knockout",
  knockout: "Knockout only",
  groups: "Groups only",
};

export const TIEBREAK_LABELS: Record<TiebreakCriterion, string> = {
  matchesWon: "Matches won",
  gameDifference: "Game difference",
  pointDifference: "Point difference",
  headToHead: "Head-to-head",
  pointsWon: "Points won (total)",
  rubbersWon: "Rubbers won",
  drawOfLots: "Draw of lots",
};

/** What each tiebreak criterion means, in one line, as the organiser reads it. */
export function tiebreakMeanings(unit: "individual" | "team" | null): Record<TiebreakCriterion, string> {
  const team = unit === "team";
  return {
    matchesWon: team ? "The most match-ups won in the group" : "The most matches won in the group",
    gameDifference: "Games won less games lost, across the group",
    pointDifference: "Points won less points lost, across the group",
    headToHead: "The result of the match between the entries that are level",
    pointsWon: "The most points won in all, across the group",
    rubbersWon: "The most matches won across a team's match-ups",
    drawOfLots: "Drawn by lot when nothing else separates them",
  };
}

/**
 * The tiebreak criteria by name, as the organiser reads them. In a team
 * event two teams meeting is a match-up and each match inside it a match,
 * so "matches won" there means the matches (what the data calls rubbers) and
 * the meetings won are "match-ups won".
 */
export function tiebreakLabels(unit: "individual" | "team" | null): Record<TiebreakCriterion, string> {
  return unit === "team"
    ? { ...TIEBREAK_LABELS, matchesWon: "Match-ups won", rubbersWon: "Matches won" }
    : { ...TIEBREAK_LABELS, rubbersWon: "Matches won (team events)" };
}

export const WITHDRAWAL_LABELS: Record<WithdrawalRule, string> = {
  byesThenWalkovers: "Walkovers",
  byesThenVoid: "Void results",
};

export const WALKOVER_LABELS: Record<WalkoverRule, string> = {
  straightGamesAtTarget: "Win with points",
  winOnly: "Win only",
};
