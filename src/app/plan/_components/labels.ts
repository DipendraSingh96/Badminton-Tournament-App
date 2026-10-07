import type { AnalysisError, FormatError, Stage } from "@/engine";
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

export function categoryName(draft: PlanDraft, id: string): string {
  const index = draft.categories.findIndex((c) => c.id === id);
  const category = draft.categories[index];
  return category?.name.trim() || `Category ${index + 1}`;
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
    case "tooFewPairs":
      return `Needs at least ${error.minimum} pairs`;
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
