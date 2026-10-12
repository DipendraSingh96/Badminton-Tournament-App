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

export const WITHDRAWAL_LABELS: Record<WithdrawalRule, string> = {
  byesThenWalkovers: "Walkovers; played results stand",
  byesThenVoid: "Void all their results",
};

export const WALKOVER_LABELS: Record<WalkoverRule, string> = {
  straightGamesAtTarget: "Straight games at the target score",
  winOnly: "A win with no games or points",
};
