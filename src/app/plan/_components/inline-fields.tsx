"use client";

import { CaretDownIcon, CaretUpIcon } from "@phosphor-icons/react";
import { useContext, useId, type KeyboardEvent } from "react";
import { IssuesContext, pathKey, type Path } from "./fields";

// Fields set in a line of text (a hall's heading row): a label in secondary
// text and the value after it, with no box. A soft fill on hover, the focus
// ring on focus; a wrong value is underlined in red with the reason in its
// tooltip. The same text style as every other field: 14px, an empty value in
// secondary text.

const VALUE =
  "rounded-sm bg-transparent px-1 text-sm tabular-nums outline-none transition-colors hover:bg-inset focus-visible:bg-inset focus-visible:ring-2 focus-visible:ring-ring aria-invalid:shadow-[inset_0_-2px_0_var(--destructive)]";
const STEP =
  "grid h-3.5 w-5 place-items-center rounded-sm text-muted-foreground outline-none hover:bg-inset hover:text-foreground disabled:opacity-30";

function useIssue(path: Path, filled: boolean): string | undefined {
  const issues = useContext(IssuesContext);
  return filled ? issues.get(pathKey(path)) : undefined;
}

/**
 * A time in a line: typed, or stepped with the chevrons (and the arrow keys
 * with Alt, which otherwise move within the time). The steps are worked out
 * by the caller; null means it can't move that way.
 */
export function InlineTime({
  label,
  path,
  value,
  onChange,
  earlier,
  later,
}: {
  label: string;
  path: Path;
  value: string;
  onChange: (value: string) => void;
  earlier: string | null;
  later: string | null;
}) {
  const id = useId();
  const issue = useIssue(path, value !== "");
  function onKeyDown(event: KeyboardEvent) {
    if (!event.altKey || (event.key !== "ArrowUp" && event.key !== "ArrowDown")) return;
    event.preventDefault();
    const next = event.key === "ArrowUp" ? later : earlier;
    if (next) onChange(next);
  }
  return (
    <span className="flex items-center gap-1" data-path={pathKey(path)}>
      <label htmlFor={id} className="text-sm text-muted-foreground">
        {label}
      </label>
      <input
        id={id}
        type="time"
        value={value}
        data-empty={value === "" || undefined}
        title={issue ? `${label}: ${issue}` : label}
        aria-invalid={issue !== undefined || undefined}
        onKeyDown={onKeyDown}
        onChange={(e) => onChange(e.target.value)}
        className={`${VALUE} [&::-webkit-calendar-picker-indicator]:hidden`}
      />
      <span className="flex flex-col">
        <button type="button" tabIndex={-1} aria-label={`${label} later`} disabled={!later} onClick={() => later && onChange(later)} className={STEP}>
          <CaretUpIcon weight="bold" className="size-3" />
        </button>
        <button
          type="button"
          tabIndex={-1}
          aria-label={`${label} earlier`}
          disabled={!earlier}
          onClick={() => earlier && onChange(earlier)}
          className={STEP}
        >
          <CaretDownIcon weight="bold" className="size-3" />
        </button>
      </span>
    </span>
  );
}

/** A number in a line, with what it's in before or after it ("£", "min"). */
export function InlineNumber({
  label,
  path,
  value,
  onChange,
  before,
  after,
  min = 0,
  whole = false,
}: {
  label: string;
  path: Path;
  value: number | null;
  onChange: (value: number | null) => void;
  before?: string;
  after?: string;
  min?: number;
  /** Whole numbers only. */
  whole?: boolean;
}) {
  const id = useId();
  const issue = useIssue(path, value !== null);
  return (
    <span className="flex items-center gap-1" data-path={pathKey(path)}>
      <label htmlFor={id} className="text-sm text-muted-foreground">
        {label}
      </label>
      <span className="flex items-center text-sm">
        {before ? <span className={value === null ? "text-muted-foreground" : undefined}>{before}</span> : null}
        <input
          id={id}
          type="number"
          inputMode={whole ? "numeric" : "decimal"}
          step={whole ? 1 : "any"}
          min={min}
          value={value ?? ""}
          placeholder="–"
          title={issue ? `${label}: ${issue}` : label}
          aria-invalid={issue !== undefined || undefined}
          onChange={(e) => {
            const raw = e.target.value;
            const parsed = raw === "" ? null : Number(raw);
            onChange(parsed === null || Number.isNaN(parsed) ? null : parsed);
          }}
          className={`${VALUE} field-sizing-content min-w-[3ch] [appearance:textfield] placeholder:text-muted-foreground [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none`}
        />
        {after ? <span className={value === null ? "text-muted-foreground" : undefined}>{after}</span> : null}
      </span>
    </span>
  );
}
