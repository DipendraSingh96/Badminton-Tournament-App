import { playersPerEntry, type AnalysisError, type EventType, type FormatError, type Stage, type Unit } from "@/engine";
import { defaultCategoryName, hallName, type PlanDraft } from "@/lib/tournament/draft";
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

/** Group names within a category: A, B, C… */
export function groupLetter(index: number): string {
  return index < 26 ? String.fromCharCode(65 + index) : `${index + 1}`;
}

/** Group indexes as letters with runs joined, e.g. [0, 1, 2, 4] → "A–C, E". */
export function groupRange(indexes: number[]): string {
  const sorted = [...indexes].sort((a, b) => a - b);
  const runs: string[] = [];
  let start = sorted[0];
  for (let i = 0; i < sorted.length; i++) {
    const current = sorted[i]!;
    const next = sorted[i + 1];
    if (next !== current + 1) {
      runs.push(
        start === current
          ? groupLetter(current)
          : current === start! + 1
            ? `${groupLetter(start!)}, ${groupLetter(current)}`
            : `${groupLetter(start!)}–${groupLetter(current)}`,
      );
      start = next;
    }
  }
  return runs.join(", ");
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
  if (!category) return "Removed category";
  return category.name.trim() || defaultCategoryName(draft, index);
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
    case "frame": {
      if (key === "halls") {
        const index = issue.path[2];
        const hall = typeof index === "number" ? draft.frame.halls[index] : undefined;
        return hall ? hallName(hall, index as number) : "Venue";
      }
      return key === "bufferMinutes" ? "Buffer" : "Tournament";
    }
    case "categories": {
      const category = typeof key === "number" ? draft.categories[key] : undefined;
      return category ? categoryName(draft, category.id) : "Categories";
    }
    case "unit":
    case "format":
      return "Tournament setup";
    case "rules":
      return "Rules";
    case "bestOfThreeAllowance":
      return "Stages";
    case "stageRules":
      return `Stage: ${STAGE_LABELS[key as Stage]}`;
    case "finance":
      return key === "otherIncome"
        ? "Finance: Other money in"
        : key === "otherCosts"
          ? "Finance: Other costs"
          : key === "prizes"
            ? "Finance: Prizes"
            : "Finance: Shuttles";
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
    return [`Enter scoring for the ${STAGE_LABELS[error.stage].toLowerCase()}`];
  }
  if (error.code === "missingStageTiming") {
    return [`Enter timing for the ${STAGE_LABELS[error.stage].toLowerCase()}`];
  }
  return error.errors.map(
    (e) => `${categoryName(draft, error.categoryId)}: ${formatErrorMessage(e)}`,
  );
}
