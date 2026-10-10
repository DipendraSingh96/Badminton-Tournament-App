import type { EventType, FormatType, Unit } from "@/engine";

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
