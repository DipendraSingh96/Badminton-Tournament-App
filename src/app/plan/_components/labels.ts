import { playersPerEntry, type AnalysisError, type EventType, type FormatError, type Stage, type Unit } from "@/engine";
import { EVENT_LABELS } from "@/lib/tournament/events";
import type { PlanDraft } from "@/lib/tournament/draft";
import type { PlanIssue } from "@/lib/tournament/schema";

export const STAGE_LABELS: Record<Stage, string> = {
  group: "Group stage",
  knockout: "Knockout rounds",
  bronze: "Bronze match",
  final: "Final",
};

const money = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });

export function formatMoney(amount: number): string {
  return money.format(amount);
}

export function formatMinutes(total: number): string {
  const minutes = Math.round(Math.abs(total));
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/** Group sizes in short form, e.g. [4, 4, 3] → "2 × 4, 1 × 3". */
export function formatGroupSizes(sizes: number[]): string {
  const counts = new Map<number, number>();
  for (const size of sizes) counts.set(size, (counts.get(size) ?? 0) + 1);
  return [...counts].map(([size, count]) => `${count} × ${size}`).join(", ");
}

/** Short duration for headline figures, e.g. "18h 16m". */
export function formatMinutesShort(total: number): string {
  const minutes = Math.round(Math.abs(total));
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

export function categoryName(draft: PlanDraft, id: string): string {
  const index = draft.categories.findIndex((c) => c.id === id);
  const category = draft.categories[index];
  const fallback =
    draft.unit === "individual" && category?.event ? EVENT_LABELS[category.event] : `Category ${index + 1}`;
  return category?.name.trim() || fallback;
}

/** What one entry is called: player, pair, team, or entry when not yet known. */
export function entryNoun(unit: Unit | null, event: EventType | null, plural = false): string {
  const noun =
    unit === "team" ? "team" : unit === "individual" && event ? (playersPerEntry(event) === 1 ? "player" : "pair") : "entry";
  if (!plural) return noun;
  return noun === "entry" ? "entries" : `${noun}s`;
}

/** Where an issue sits, in words, e.g. "Mixed doubles" or "Finance". */
export function issueSection(draft: PlanDraft, issue: PlanIssue): string {
  const [section, key] = issue.path;
  switch (section) {
    case "frame":
      return "Frame";
    case "categories": {
      const category = typeof key === "number" ? draft.categories[key] : undefined;
      return category ? categoryName(draft, category.id) : "Categories";
    }
    case "unit":
    case "format":
      return "Categories and format";
    case "stageRules":
      return `Match rules: ${STAGE_LABELS[key as Stage]}`;
    case "finance":
      return "Finance";
    default:
      return "Plan";
  }
}

export function formatErrorMessage(error: FormatError): string {
  switch (error.code) {
    case "tooFewEntries":
      return `Needs at least ${error.minimum} entries`;
    case "missingGroups":
      return "Set how groups are made";
    case "invalidGroupCount":
      return `Too many groups for these entries: at most ${error.maximum}`;
    case "invalidQualifiers":
      return `Qualifiers per group must be between 1 and ${error.maximum} (the smallest group)`;
  }
}

export function analysisErrorMessages(draft: PlanDraft, error: AnalysisError): string[] {
  if (error.code === "missingStageRules") {
    return [`Enter match rules for the ${STAGE_LABELS[error.stage].toLowerCase()}`];
  }
  return error.errors.map(
    (e) => `${categoryName(draft, error.categoryId)}: ${formatErrorMessage(e)}`,
  );
}
