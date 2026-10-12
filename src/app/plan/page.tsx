import type { Metadata } from "next";
import { PlanEditor } from "./_components/plan-editor";

export const metadata: Metadata = {
  title: "Plan a tournament",
};

export default function PlanPage() {
  return <PlanEditor />;
}
