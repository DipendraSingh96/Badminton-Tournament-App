"use client";

import { CartesianGrid, Line, LineChart, ReferenceLine, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import type { ProfitPoint } from "@/engine";
import { formatMoney } from "./labels";

const config = {
  profit: { label: "Profit", color: "var(--chart-3)" },
} satisfies ChartConfig;

const compactMoney = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  notation: "compact",
});

export function ProfitChart({
  points,
  breakEven,
  expected,
}: {
  points: ProfitPoint[];
  breakEven: number | null;
  expected: number;
}) {
  return (
    <ChartContainer config={config} className="aspect-[16/10] w-full">
      <LineChart data={points} margin={{ top: 8, right: 8, bottom: 16, left: 8 }}>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="pairs"
          type="number"
          domain={["dataMin", "dataMax"]}
          allowDecimals={false}
          tickLine={false}
          label={{ value: "Pairs entered", position: "insideBottom", offset: -8 }}
        />
        <YAxis tickFormatter={(v: number) => compactMoney.format(v)} tickLine={false} width={56} />
        <ReferenceLine y={0} stroke="var(--border)" strokeWidth={2} />
        <ReferenceLine
          x={expected}
          stroke="var(--muted-foreground)"
          strokeDasharray="4 4"
          label={{ value: "Expected", position: "insideTopLeft", fill: "var(--muted-foreground)", fontSize: 12 }}
        />
        {breakEven !== null ? (
          <ReferenceLine
            x={breakEven}
            stroke="var(--brand-strong)"
            label={{ value: "Break-even", position: "insideTopRight", fill: "var(--brand-strong)", fontSize: 12 }}
          />
        ) : null}
        <ChartTooltip
          content={
            <ChartTooltipContent
              labelFormatter={(_, payload) => `${payload[0]?.payload.pairs} pairs`}
              formatter={(value) => formatMoney(Number(value))}
            />
          }
        />
        <Line dataKey="profit" type="stepAfter" stroke="var(--color-profit)" strokeWidth={2} dot={false} isAnimationActive={false} />
      </LineChart>
    </ChartContainer>
  );
}
