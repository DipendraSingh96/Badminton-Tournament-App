"use client";

import { ListChecksIcon, ShuffleIcon, TreeStructureIcon, UsersIcon } from "@phosphor-icons/react";
import type { PlanDraft } from "@/lib/tournament/draft";

const COMING = [
  { icon: UsersIcon, title: "Entries", text: "Teams and players for each category: typed, pasted or imported from CSV, with each team's line-up." },
  { icon: ShuffleIcon, title: "Draw", text: "Seeds spread across the groups, the rest drawn at random; swap any two before locking." },
  {
    icon: ListChecksIcon,
    title: "Courts and teams",
    text: "Who plays on each court now and next, and every team's day, with check-in.",
  },
  { icon: TreeStructureIcon, title: "Groups and bracket", text: "Standings with the qualifying line, and the knockout tree." },
];

/** The Draw stage: entries, the draw, and the post-draw views (built step by step). */
export function DrawStage({ draft }: { draft: PlanDraft }) {
  const count = draft.entries.length;
  return (
    <main className="scroll-pane min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex max-w-3xl flex-col gap-6 px-(--pane-x) py-6">
        <div className="flex flex-col gap-2">
          <h1 className="heading-screen">Draw</h1>
          <p className="text-sm text-muted-foreground">
            Entries are closed: the plan now uses the {count} {count === 1 ? "entry" : "entries"} entered. The views
            below arrive next.
          </p>
        </div>
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {COMING.map(({ icon: Icon, title, text }) => (
            <li key={title} className="flex gap-3 rounded-lg bg-inset p-4">
              <Icon weight="bold" className="mt-0.5 size-5 shrink-0 text-turf" aria-hidden="true" />
              <div className="flex flex-col gap-1">
                <h2 className="text-base font-semibold">{title}</h2>
                <p className="text-sm text-muted-foreground">{text}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
