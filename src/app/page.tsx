import { ArrowRightIcon } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";

const CHECKS = [
  {
    question: "Does it fit?",
    detail: "Court time needed against the time and courts you have, typical and worst case.",
    chips: [
      { label: "Fits", className: "bg-brand text-brand-foreground" },
      { label: "Tight", className: "bg-warning text-warning-foreground" },
      { label: "Doesn't fit", className: "bg-destructive text-destructive-foreground" },
    ],
  },
  {
    question: "Does it pay for itself?",
    detail: "Entry fees against shuttles, prizes and costs, with every sum shown.",
    chips: [],
  },
  {
    question: "Where does it break even?",
    detail: "Profit at every entry count, as the format changes with it.",
    chips: [],
  },
] as const;

export default function Home() {
  return (
    <main className="mx-auto grid min-h-[100dvh] w-full max-w-6xl grid-cols-1 content-center items-center gap-12 px-4 py-16 md:grid-cols-[1.2fr_1fr] md:gap-16 md:py-24">
      <div className="flex flex-col items-start gap-6">
        <h1 className="text-4xl leading-[1.05] md:text-5xl lg:text-[3.5rem]">
          Plan a tournament that fits and pays
        </h1>
        <p className="max-w-[44ch] text-lg leading-relaxed text-muted-foreground">
          For badminton organisers: check courts and time, see what it costs, and find the entries you need to break even.
        </p>
        <Link
          href="/plan"
          className={buttonVariants({ variant: "brand", size: "lg", className: "h-11 px-5 text-base" })}
        >
          Plan a tournament
          <ArrowRightIcon weight="bold" />
        </Link>
      </div>

      <ol className="flex flex-col divide-y divide-border rounded-2xl bg-card">
        {CHECKS.map((check, i) => (
          <li key={check.question} className="flex gap-4 p-5 md:p-6">
            <span className="font-mono text-sm text-muted-foreground tabular-nums">{i + 1}</span>
            <div className="flex flex-col gap-2">
              <h2 className="text-lg">{check.question}</h2>
              <p className="text-sm text-muted-foreground">{check.detail}</p>
              {check.chips.length > 0 ? (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {check.chips.map((chip) => (
                    <Badge key={chip.label} className={chip.className}>
                      {chip.label}
                    </Badge>
                  ))}
                </div>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
    </main>
  );
}
