import type { Metadata } from "next";
import Link from "next/link";
import { PlanEditor } from "./_components/plan-editor";

export const metadata: Metadata = {
  title: "Plan a tournament",
};

export default function PlanPage() {
  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-6">
      <div className="flex flex-col gap-1">
        <Link href="/" className="text-sm text-muted-foreground hover:underline">
          Badminton Tournament App
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Plan a tournament</h1>
        <p className="text-sm text-muted-foreground">
          Check whether it fits the time and courts, and whether it pays for itself.
          Your plan is saved in this browser.
        </p>
      </div>
      <PlanEditor />
    </main>
  );
}
