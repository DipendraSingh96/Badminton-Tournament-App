"use client";

import { ArrowRightIcon, CheckCircleIcon, CircleIcon, CopyIcon, EyeIcon, PlusIcon, PrinterIcon, TrashIcon } from "@phosphor-icons/react";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FormDialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { newId, type PlanDraft } from "@/lib/tournament/draft";
import { autoChecklist, daysText, daysToGo, kitList, playerMessage, rulebook, type FixAt } from "@/lib/tournament/resources";
import { clock } from "@/lib/tournament/time";
import { cn } from "@/lib/utils";
import { ProgrammeDocument, RulebookDocument, usePrint } from "./documents";
import { IconButton } from "./fields";
import { categoryName } from "./labels";
import type { Update } from "./plan-editor";
import { ScoreSheet, ScoreSheetsButton } from "./score-sheets";
import type { LocalSegment } from "./timeline";

/** Where each kind of open item is put right, in words for its link. */
const FIX_LABELS: Record<FixAt, string> = { plan: "Plan", budget: "Budget", entries: "Entries", draw: "Draw", schedule: "Schedule" };

/** Things organisers often have to do before the day: offered, never added for them. */
const SUGGESTIONS = [
  "Send the programme and rulebook to players",
  "Print the score sheets",
  "Buy the shuttles",
  "Confirm the hall booking",
  "Brief the umpires",
  "Book a first aider",
];

const AREA =
  "w-full rounded-md border px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring";

function Block({ title, about, children }: { title: string; about: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="flex flex-col gap-3 border-t pt-4">
      <div className="flex flex-col gap-1">
        <h3 className="text-xl font-semibold">{title}</h3>
        <p className="text-sm text-muted-foreground">{about}</p>
      </div>
      {children}
    </section>
  );
}

/** One document: what it is, what it holds, and its actions. */
function DocumentCard({ title, about, count, notes, children }: { title: string; about: string; count: string; notes: string[]; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 rounded-lg bg-card-system p-3">
      <div className="flex flex-col gap-1">
        <h4 className="text-sm font-semibold">{title}</h4>
        <p className="text-xs text-muted-foreground">{about}</p>
      </div>
      <p className="text-xs font-semibold tabular-nums">{count}</p>
      {notes.length > 0 ? (
        <ul className="flex flex-col gap-1 text-xs text-tight-text">
          {notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      ) : null}
      <div className="mt-auto flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

/**
 * The Draw stage's Resources page: everything to get ready before the day.
 * How ready the tournament is; the documents to print or send (score sheets,
 * the rulebook, the programme); what to carry, counted from the plan; a
 * checklist the app ticks where it can, with the organiser's own items; and
 * a message for the players. It stays usable when the draw is locked and
 * while Live: it prepares the day, it doesn't change the tournament.
 */
export function ResourcesView({
  draft,
  update,
  segments,
  shuttles,
  fits,
  onFix,
}: {
  draft: PlanDraft;
  update: Update;
  segments: LocalSegment[];
  /** The plan's shuttle count; null until the plan can be worked out. */
  shuttles: number | null;
  /** Whether the plan fits the day; null until it can be worked out. */
  fits: boolean | null;
  /** Opens where an open item is put right. */
  onFix: (at: FixAt) => void;
}) {
  const { resources } = draft;
  const { print, portal } = usePrint();
  const [preview, setPreview] = useState<"sheets" | "rulebook" | "programme" | null>(null);
  const [newItem, setNewItem] = useState("");
  const [newKit, setNewKit] = useState("");
  // Today in the tournament's time zone, read once when the page opens.
  const [today] = useState(() => {
    try {
      return new Intl.DateTimeFormat("en-CA", { timeZone: draft.frame.timeZone || undefined }).format(new Date());
    } catch {
      return new Intl.DateTimeFormat("en-CA").format(new Date());
    }
  });

  const auto = autoChecklist(draft, { scheduled: segments.length, fits });
  const done = auto.filter((i) => i.done).length + resources.checklist.filter((i) => i.done).length;
  const total = auto.length + resources.checklist.length;
  const open = auto.filter((i) => !i.done);
  const kit = kitList(draft, { sheets: segments.length, shuttles });
  const rules = rulebook(draft, resources.houseRules);
  const undrawn = draft.categories.filter((c) => !draft.draw[c.id]).map((c) => `${categoryName(draft, c.id)} isn't drawn: its groups are left out`);
  const firstGame = segments.length > 0 ? clock(Math.min(...segments.map((s) => s.from))) : null;
  const message = playerMessage(draft, firstGame);
  const sheetPages = Math.ceil(segments.length / 2);
  const ordered = [...segments].sort((a, b) => a.from - b.from);

  const addItem = (text: string) => {
    const clean = text.trim();
    if (clean) update((d) => void d.resources.checklist.push({ id: newId(), text: clean, done: false }));
  };
  const fixButton = (at: FixAt) => (
    <Button variant="ghost" size="sm" className="shrink-0" onClick={() => onFix(at)}>
      {FIX_LABELS[at]} <ArrowRightIcon />
    </Button>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <h2 className="heading-card">Resources</h2>
          <p className="text-sm tabular-nums" aria-live="polite">
            <span className="font-semibold">
              {done} of {total}
            </span>{" "}
            <span className="text-muted-foreground">done · {daysText(daysToGo(draft.frame.date, today))}</span>
          </p>
        </div>
        <div role="img" aria-label={`${done} of ${total} done`} className="flex h-2 overflow-hidden rounded-full bg-border">
          <span className="bg-fits" style={{ width: `${(done / Math.max(1, total)) * 100}%` }} />
        </div>
        {open.length > 0 ? (
          <ul aria-label="Still to do" className="flex flex-col">
            {open.map((item) => (
              <li key={item.key} className="flex items-center justify-between gap-3 text-sm">
                <span className="min-w-0 truncate">{item.open}</span>
                {fixButton(item.fix)}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">Everything the app can check is ready.</p>
        )}
      </div>

      <Block title="Documents" about="Print them, or choose “Save as PDF” in the print dialog to get a file to send. None carries a phone number or any money.">
        <div className="grid grid-cols-1 gap-3 @[640px]:grid-cols-3">
          <DocumentCard
            title="Score sheets"
            about="One for each game, for umpires to fill in on court."
            count={segments.length === 0 ? "No games on the schedule yet" : `${segments.length} sheets · ${sheetPages} A4 ${sheetPages === 1 ? "page" : "pages"}`}
            notes={[]}
          >
            <Button variant="outline" size="sm" disabled={segments.length === 0} onClick={() => setPreview("sheets")}>
              <EyeIcon /> Preview
            </Button>
            <ScoreSheetsButton draft={draft} segments={segments} label="Print" />
          </DocumentCard>
          <DocumentCard
            title="Rulebook"
            about="For players: the format, scoring, how groups are ranked, walkovers and withdrawals, and your own rules."
            count={`${rules.sections.length} ${rules.sections.length === 1 ? "section" : "sections"}`}
            notes={rules.missing}
          >
            <Button variant="outline" size="sm" onClick={() => setPreview("rulebook")}>
              <EyeIcon /> Preview
            </Button>
            <Button size="sm" onClick={() => print(<RulebookDocument draft={draft} />)}>
              <PrinterIcon /> Print
            </Button>
          </DocumentCard>
          <DocumentCard
            title="Programme"
            about="For players: the venue and its hours, every group, the knockout, and each court's order of play."
            count={`${draft.categories.length} ${draft.categories.length === 1 ? "category" : "categories"} · ${segments.length} games`}
            notes={[...undrawn, ...(segments.length === 0 ? ["No schedule yet: the order of play is left out"] : [])]}
          >
            <Button variant="outline" size="sm" onClick={() => setPreview("programme")}>
              <EyeIcon /> Preview
            </Button>
            <Button size="sm" onClick={() => print(<ProgrammeDocument draft={draft} segments={segments} />)}>
              <PrinterIcon /> Print
            </Button>
          </DocumentCard>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="house-rules" className="text-xs leading-4 text-muted-foreground">
            Your own rules, a line each: printed as the rulebook&apos;s last section
          </label>
          <textarea
            id="house-rules"
            rows={4}
            data-slot="field-box"
            className={AREA}
            placeholder={"Feather shuttles only\nNon-marking shoes\nThe losing side umpires the next game on that court"}
            value={resources.houseRules}
            onChange={(e) => update((d) => void (d.resources.houseRules = e.target.value))}
          />
        </div>
      </Block>

      <Block title="Kit list" about="What to carry, counted from the plan. Tick each off as it's packed.">
        <ul className="flex flex-col gap-1">
          {kit.map((row) => {
            const packed = resources.packed.includes(row.key);
            return (
              <li key={row.key} className="flex items-center gap-3 rounded-lg bg-card-system px-3 py-2">
                <Checkbox
                  aria-label={`${row.label} packed`}
                  checked={packed}
                  onCheckedChange={(on) =>
                    update((d) => void (d.resources.packed = on ? [...d.resources.packed.filter((k) => k !== row.key), row.key] : d.resources.packed.filter((k) => k !== row.key)))
                  }
                />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className={cn("text-sm font-semibold", packed && "text-muted-foreground line-through")}>{row.label}</span>
                  {row.detail ? <span className={cn("text-xs", row.fix ? "text-tight-text" : "text-muted-foreground")}>{row.detail}</span> : null}
                </span>
                {row.fix ? fixButton(row.fix) : null}
                <span className="w-12 shrink-0 text-right font-display text-xl leading-none font-bold tabular-nums">{row.quantity ?? "–"}</span>
              </li>
            );
          })}
          {resources.kit.map((row, i) => (
            <li key={row.id} className="flex items-center gap-3 rounded-lg bg-card-system px-3 py-2">
              <Checkbox
                aria-label={`${row.text || "Item"} packed`}
                checked={row.packed}
                onCheckedChange={(on) => update((d) => void (d.resources.kit[i]!.packed = Boolean(on)))}
              />
              <Input
                aria-label="Item to carry"
                className={cn("min-w-0 flex-1", row.packed && "text-muted-foreground line-through")}
                value={row.text}
                onChange={(e) => update((d) => void (d.resources.kit[i]!.text = e.target.value))}
              />
              <Input
                type="number"
                inputMode="numeric"
                min={0}
                aria-label={`How many: ${row.text || "item"}`}
                placeholder="How many"
                className="w-24 text-right tabular-nums"
                value={row.quantity ?? ""}
                onChange={(e) => {
                  const n = e.target.value === "" ? null : Number(e.target.value);
                  update((d) => void (d.resources.kit[i]!.quantity = n !== null && Number.isNaN(n) ? null : n));
                }}
              />
              <IconButton label={`Remove ${row.text || "this item"}`} side="left" onClick={() => update((d) => void d.resources.kit.splice(i, 1))}>
                <TrashIcon />
              </IconButton>
            </li>
          ))}
        </ul>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const clean = newKit.trim();
            if (!clean) return;
            update((d) => void d.resources.kit.push({ id: newId(), text: clean, quantity: 1, packed: false }));
            setNewKit("");
          }}
        >
          <Input aria-label="Something else to carry" placeholder="Something else to carry: first aid kit, spare nets…" value={newKit} onChange={(e) => setNewKit(e.target.value)} />
          <Button type="submit" variant="outline" disabled={!newKit.trim()}>
            <PlusIcon /> Add
          </Button>
        </form>
      </Block>

      <Block title="Checklist" about="The first items tick themselves from the tournament. Add your own below them.">
        <ul className="flex flex-col gap-1">
          {auto.map((item) => (
            <li key={item.key} className="flex items-center gap-3 rounded-lg bg-card-system px-3 py-2">
              {item.done ? (
                <CheckCircleIcon weight="fill" className="size-5 shrink-0 text-fits-text" aria-label="Done" />
              ) : (
                <CircleIcon className="size-5 shrink-0 text-muted-foreground" aria-label="Not done" />
              )}
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-sm font-semibold">{item.text}</span>
                {item.open ? <span className="text-xs text-tight-text">{item.open}</span> : null}
              </span>
              {item.done ? <span className="shrink-0 text-xs text-muted-foreground">Checked by the app</span> : fixButton(item.fix)}
            </li>
          ))}
          {resources.checklist.map((item, i) => (
            <li key={item.id} className="flex items-center gap-3 rounded-lg bg-card-system px-3 py-2">
              <Checkbox
                aria-label={`${item.text || "Item"} done`}
                checked={item.done}
                onCheckedChange={(on) => update((d) => void (d.resources.checklist[i]!.done = Boolean(on)))}
              />
              <Input
                aria-label="To do"
                className={cn("min-w-0 flex-1", item.done && "text-muted-foreground line-through")}
                value={item.text}
                onChange={(e) => update((d) => void (d.resources.checklist[i]!.text = e.target.value))}
              />
              <IconButton label={`Remove ${item.text || "this item"}`} side="left" onClick={() => update((d) => void d.resources.checklist.splice(i, 1))}>
                <TrashIcon />
              </IconButton>
            </li>
          ))}
        </ul>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            addItem(newItem);
            setNewItem("");
          }}
        >
          <Input aria-label="Something to do before the day" placeholder="Something to do before the day" value={newItem} onChange={(e) => setNewItem(e.target.value)} />
          <Button type="submit" variant="outline" disabled={!newItem.trim()}>
            <PlusIcon /> Add
          </Button>
        </form>
        {SUGGESTIONS.some((s) => !resources.checklist.some((i) => i.text === s)) ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">Often needed:</span>
            {SUGGESTIONS.filter((s) => !resources.checklist.some((i) => i.text === s)).map((s) => (
              <Button key={s} variant="outline" size="sm" onClick={() => addItem(s)}>
                <PlusIcon /> {s}
              </Button>
            ))}
          </div>
        ) : null}
      </Block>

      <Block title="Message to players" about="Written from the tournament. Change it here before copying; it isn't saved.">
        {/* Keyed by the generated text: when the tournament changes, the message is written afresh. */}
        <MessageBox key={message} message={message} />
      </Block>

      {preview ? (
        <FormDialog
          wide
          open
          onOpenChange={(on) => (on ? undefined : setPreview(null))}
          title={preview === "sheets" ? "Score sheets" : preview === "rulebook" ? "Rulebook" : "Programme"}
          description={
            preview === "sheets"
              ? `The first two of ${segments.length}, as they print: two to an A4 page.`
              : "As it prints. “Save as PDF” in the print dialog gives a file to send."
          }
          footer={
            <>
              <Button variant="secondary" onClick={() => setPreview(null)}>
                Close
              </Button>
              {preview === "sheets" ? null : (
                <Button
                  onClick={() => {
                    print(preview === "rulebook" ? <RulebookDocument draft={draft} /> : <ProgrammeDocument draft={draft} segments={segments} />);
                    setPreview(null);
                  }}
                >
                  <PrinterIcon /> Print
                </Button>
              )}
            </>
          }
        >
          {/* Paper: white with black text in either theme. */}
          <div data-slot="paper" className="rounded-md bg-white p-6 text-black">
            {preview === "sheets" ? (
              ordered.slice(0, 2).map((s) => <ScoreSheet key={s.id} draft={draft} segment={s} />)
            ) : preview === "rulebook" ? (
              <RulebookDocument draft={draft} />
            ) : (
              <ProgrammeDocument draft={draft} segments={segments} />
            )}
          </div>
        </FormDialog>
      ) : null}
      {portal}
    </div>
  );
}

function MessageBox({ message }: { message: string }) {
  const [text, setText] = useState(message);
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-col gap-2">
      <textarea
        aria-label="Message to players"
        rows={9}
        data-slot="field-box"
        className={AREA}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setCopied(false);
        }}
      />
      <div className="flex items-center gap-3">
        <Button
          variant="outline"
          size="sm"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(text);
              setCopied(true);
            } catch {
              setCopied(false);
            }
          }}
        >
          <CopyIcon /> Copy message
        </Button>
        <span className="text-xs text-muted-foreground" aria-live="polite">
          {copied ? "Copied." : ""}
        </span>
      </div>
    </div>
  );
}
