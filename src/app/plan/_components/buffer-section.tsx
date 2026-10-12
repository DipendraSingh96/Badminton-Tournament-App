"use client";

import type { PlanDraft } from "@/lib/tournament/draft";
import { FieldGrid, NumberField, Section } from "./fields";
import type { Update } from "./plan-editor";

export function BufferSection({ draft, update }: { draft: PlanDraft; update: Update }) {
  return (
    <Section
      title="Buffer"
      description="Held back at the end of the whole day for miscellaneous activity like prize distribution. Play must end by the last hall's closing time less the buffer."
    >
      <FieldGrid>
        <NumberField
          label="Buffer (minutes)"
          step="1"
          path={["frame", "bufferMinutes"]}
          value={draft.frame.bufferMinutes}
          onChange={(v) => update((d) => void (d.frame.bufferMinutes = v))}
        />
      </FieldGrid>
    </Section>
  );
}
