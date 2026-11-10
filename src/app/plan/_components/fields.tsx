"use client";

import { CheckCircleIcon, CircleIcon, InfoIcon, MinusIcon, PlusIcon } from "@phosphor-icons/react";
import { createContext, useContext, useId, type ComponentProps, type KeyboardEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { PlanIssue } from "@/lib/tournament/schema";
import { cn } from "@/lib/utils";

export type Path = PropertyKey[];

export function pathKey(path: Path): string {
  return path.map(String).join(".");
}

/** Validation messages keyed by field path. */
export const IssuesContext = createContext<Map<string, string>>(new Map());

export function issueMap(issues: PlanIssue[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const issue of issues) {
    const key = pathKey(issue.path);
    if (!map.has(key)) map.set(key, issue.message);
  }
  return map;
}

/**
 * An icon-only button named by its tooltip; the label is also its accessible
 * name. A square hugging its icon, with no fill until hovered.
 */
export function IconButton({
  label,
  side = "top",
  className,
  children,
  ...props
}: Omit<ComponentProps<typeof Button>, "aria-label"> & { label: string; side?: "top" | "bottom" | "left" | "right" }) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button variant="ghost" size="icon" aria-label={label} className={className} {...props} />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipContent side={side}>{label}</TooltipContent>
    </Tooltip>
  );
}

/**
 * Inputs that can't be changed right now (the structure once the draw is
 * locked): every field, button and choice inside is disabled. Info tips stay
 * readable.
 */
export function ReadOnly({ when, children }: { when: boolean; children: ReactNode }) {
  return (
    <fieldset disabled={when} className="contents">
      {children}
    </fieldset>
  );
}

/**
 * Help text behind an ⓘ beside a label or title, so it doesn't crowd the
 * workbench. Shown on hover and on keyboard focus; screen readers get it as
 * the button's description.
 */
export function InfoTip({ about, children }: { about: string; children: ReactNode }) {
  const id = useId();
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          // Not a form button, so it stays usable inside a read-only (disabled) fieldset.
          <span
            role="button"
            tabIndex={0}
            aria-label={`About ${about}`}
            aria-describedby={id}
            className="inline-grid size-4 shrink-0 place-items-center rounded-full text-muted-foreground outline-none hover:text-foreground focus-visible:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          />
        }
      >
        <InfoIcon className="size-3.5" />
        <span id={id} className="sr-only">
          {children}
        </span>
      </TooltipTrigger>
      <TooltipContent className="block max-w-64 text-left leading-snug font-normal">{children}</TooltipContent>
    </Tooltip>
  );
}

/**
 * Wraps a control with its help. The control shows its label inside (as
 * placeholder, with the same text as its accessible name and tooltip), so
 * there's no label above it. A value that's wrong outlines the control in
 * red and puts the reason in its tooltip (and, for screen readers, its
 * description); nothing is printed under it, so rows keep their shape.
 * Missing values are listed on the workbench.
 */
function Field({
  id,
  label,
  path,
  filled,
  hint,
  children,
}: {
  id: string;
  label: string;
  path: Path;
  filled: boolean;
  hint?: string;
  children: ReactNode;
}) {
  const issues = useContext(IssuesContext);
  const message = filled ? issues.get(pathKey(path)) : undefined;
  return (
    <div className="flex min-w-0 items-center gap-1" data-path={pathKey(path)}>
      <div className="min-w-0 flex-1">{children}</div>
      {hint ? <InfoTip about={label}>{hint}</InfoTip> : null}
      {message ? (
        <p id={`${id}-message`} className="sr-only">
          {message}
        </p>
      ) : null}
    </div>
  );
}

/** What's wrong with a field's value, once it has one. */
function useIssue(path: Path, filled: boolean): string | undefined {
  const issues = useContext(IssuesContext);
  return filled ? issues.get(pathKey(path)) : undefined;
}

export function NumberField({
  label,
  path,
  value,
  onChange,
  hint,
  step = "any",
}: {
  label: string;
  path: Path;
  value: number | null;
  onChange: (value: number | null) => void;
  hint?: string;
  step?: string;
}) {
  const id = useId();
  const filled = value !== null;
  const issue = useIssue(path, filled);
  const invalid = issue !== undefined;
  return (
    <Field id={id} label={label} path={path} filled={filled} hint={hint}>
      <Input
        id={id}
        type="number"
        inputMode="decimal"
        step={step}
        min={0}
        value={value ?? ""}
        placeholder={label}
        aria-label={label}
        title={issue ? `${label}: ${issue}` : label}
        aria-invalid={invalid || undefined}
        aria-describedby={invalid ? `${id}-message` : undefined}
        onChange={(e) => {
          const raw = e.target.value;
          const parsed = raw === "" ? null : Number(raw);
          onChange(parsed === null || Number.isNaN(parsed) ? null : parsed);
        }}
      />
    </Field>
  );
}

/** A whole-number input with − and + buttons, for small counts. */
export function StepperField({
  label,
  path,
  value,
  onChange,
  hint,
  min = 0,
}: {
  label: string;
  path: Path;
  value: number | null;
  onChange: (value: number | null) => void;
  hint?: string;
  min?: number;
}) {
  const id = useId();
  const filled = value !== null;
  const issue = useIssue(path, filled);
  const invalid = issue !== undefined;
  const step = (delta: number) => onChange(Math.max(min, (value ?? min) + (value === null ? 0 : delta)));
  return (
    <Field id={id} label={label} path={path} filled={filled} hint={hint}>
      <div
        data-slot="field-box"
        className="flex h-(--control-h) items-stretch overflow-hidden rounded-md border transition-colors focus-within:ring-2 focus-within:ring-ring"
      >
        <button
          type="button"
          aria-label={`Decrease ${label.toLowerCase()}`}
          className="grid w-8 shrink-0 place-items-center text-foreground transition-colors outline-none hover:bg-inset focus-visible:bg-inset disabled:opacity-40 [&_svg]:size-4"
          disabled={value === null || value <= min}
          onClick={() => step(-1)}
        >
          <MinusIcon />
        </button>
        <input
          id={id}
          type="number"
          inputMode="numeric"
          step={1}
          min={min}
          value={value ?? ""}
          placeholder={label}
          aria-label={label}
          title={issue ? `${label}: ${issue}` : label}
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? `${id}-message` : undefined}
          className="w-full min-w-0 [appearance:textfield] bg-transparent text-center text-sm tabular-nums outline-none placeholder:text-muted-foreground [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          onChange={(e) => {
            const raw = e.target.value;
            const parsed = raw === "" ? null : Number(raw);
            onChange(parsed === null || Number.isNaN(parsed) ? null : parsed);
          }}
        />
        <button
          type="button"
          aria-label={`Increase ${label.toLowerCase()}`}
          className="grid w-8 shrink-0 place-items-center text-foreground transition-colors outline-none hover:bg-inset focus-visible:bg-inset [&_svg]:size-4"
          onClick={() => step(1)}
        >
          <PlusIcon />
        </button>
      </div>
    </Field>
  );
}

export function TextField({
  label,
  path,
  value,
  onChange,
  type = "text",
  placeholder,
  strong = false,
}: {
  label: string;
  path: Path;
  value: string;
  onChange: (value: string) => void;
  type?: "text" | "date" | "time";
  placeholder?: string;
  /** A title rather than a value (the tournament's name): semibold once filled. */
  strong?: boolean;
}) {
  const id = useId();
  const filled = value !== "";
  const issue = useIssue(path, filled);
  const invalid = issue !== undefined;
  return (
    <Field id={id} label={label} path={path} filled={filled}>
      {type === "time" ? (
        // A time box always shows "--:--" and can't show a placeholder: its label sits inside, at the left.
        <div
          data-slot="field-box"
          className="flex h-(--control-h) items-center gap-2 rounded-md border px-3 transition-colors focus-within:ring-2 focus-within:ring-ring"
          title={issue ? `${label}: ${issue}` : label}
        >
          <span className="shrink-0 text-sm text-muted-foreground" aria-hidden="true">
            {label}
          </span>
          <input
            id={id}
            type="time"
            value={value}
            aria-label={label}
            data-empty={!filled || undefined}
            aria-invalid={invalid || undefined}
            aria-describedby={invalid ? `${id}-message` : undefined}
            className="min-w-0 flex-1 bg-transparent text-sm tabular-nums outline-none"
            onChange={(e) => onChange(e.target.value)}
          />
        </div>
      ) : (
        <Input
          id={id}
          type={type}
          value={value}
          placeholder={placeholder ?? label}
          data-empty={!filled || undefined}
          className={strong ? "font-semibold placeholder:font-normal" : undefined}
          aria-label={label}
          title={issue ? `${label}: ${issue}` : label}
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? `${id}-message` : undefined}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </Field>
  );
}

export function SelectField<T extends string | number>({
  label,
  path,
  value,
  options,
  onChange,
  hint,
}: {
  label: string;
  path: Path;
  value: T | null;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
  hint?: string;
}) {
  const id = useId();
  return (
    <Field id={id} label={label} path={path} filled={value !== null} hint={hint}>
      <NativeSelect
        id={id}
        className="w-full"
        aria-label={label}
        title={label}
        data-empty={value === null || undefined}
        value={value === null ? "" : String(value)}
        onChange={(e) => {
          const option = options.find((o) => String(o.value) === e.target.value);
          if (option) onChange(option.value);
        }}
      >
        <NativeSelectOption value="" disabled>
          {label}
        </NativeSelectOption>
        {options.map((option) => (
          <NativeSelectOption key={String(option.value)} value={String(option.value)}>
            {option.label}
          </NativeSelectOption>
        ))}
      </NativeSelect>
    </Field>
  );
}

/**
 * A choice between a few options, with its label and message. Missing
 * choices are listed on the summary, so the message only shows once chosen.
 */
function ChoiceGroup({
  label,
  path,
  filled,
  hint,
  children,
}: {
  label: string;
  path: Path;
  filled: boolean;
  hint?: ReactNode;
  children: (labelId: string) => ReactNode;
}) {
  const id = useId();
  const issues = useContext(IssuesContext);
  const message = filled ? issues.get(pathKey(path)) : undefined;
  return (
    <div className="flex min-w-0 flex-col gap-2" data-path={pathKey(path)}>
      <div className="flex min-w-0 items-center gap-1">
        <span id={id} title={label} className="min-w-0 truncate text-sm leading-none font-semibold text-muted-foreground">
          {label}
        </span>
        {hint ? <InfoTip about={label}>{hint}</InfoTip> : null}
      </div>
      {children(id)}
      {message ? <p className="text-xs text-over-text">{message}</p> : null}
    </div>
  );
}

/** Arrow keys move between the options of a radio group, as in a native one. */
function onRadioKeyDown(event: KeyboardEvent<HTMLElement>) {
  const keys = ["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp"];
  if (!keys.includes(event.key)) return;
  const radios = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("[role=radio]")];
  const index = radios.indexOf(document.activeElement as HTMLButtonElement);
  if (index === -1) return;
  event.preventDefault();
  const delta = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : -1;
  const next = radios[(index + delta + radios.length) % radios.length]!;
  next.focus();
  next.click();
}

/** Two to four short options side by side. */
export function SegmentedField<T extends string | number>({
  label,
  path,
  value,
  options,
  onChange,
  hint,
}: {
  label: string;
  path: Path;
  value: T | null;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
  hint?: ReactNode;
}) {
  return (
    <ChoiceGroup label={label} path={path} filled={value !== null} hint={hint}>
      {(labelId) => (
        <div
          role="radiogroup"
          aria-labelledby={labelId}
          onKeyDown={onRadioKeyDown}
          data-slot="segmented"
          className="flex gap-1 rounded-md bg-inset p-1"
        >
          {options.map((option, i) => {
            const selected = option.value === value;
            return (
              <button
                key={String(option.value)}
                type="button"
                role="radio"
                aria-checked={selected}
                tabIndex={selected || (value === null && i === 0) ? 0 : -1}
                onClick={() => onChange(option.value)}
                className={cn(
                  "min-h-6 min-w-0 flex-1 truncate rounded-sm px-3 text-sm font-semibold transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  selected
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-card hover:text-foreground",
                )}
              >
                <span title={option.label}>{option.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </ChoiceGroup>
  );
}

/** Larger options, each with a line on what it means. */
export function OptionCards<T extends string>({
  label,
  path,
  value,
  options,
  onChange,
}: {
  label: string;
  path: Path;
  value: T | null;
  options: readonly { value: T; label: string; description: string }[];
  onChange: (value: T) => void;
}) {
  const id = useId();
  return (
    <ChoiceGroup label={label} path={path} filled={value !== null}>
      {(labelId) => (
        <div
          role="radiogroup"
          aria-labelledby={labelId}
          onKeyDown={onRadioKeyDown}
          className="grid grid-cols-1 gap-2 @2xl:grid-cols-3"
        >
          {options.map((option, i) => {
            const selected = option.value === value;
            const Icon = selected ? CheckCircleIcon : CircleIcon;
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={selected}
                aria-labelledby={`${id}-${i}`}
                aria-describedby={`${id}-${i}-description`}
                tabIndex={selected || (value === null && i === 0) ? 0 : -1}
                onClick={() => onChange(option.value)}
                className={cn(
                  "flex flex-col gap-1 rounded-lg border p-3 text-left transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                  selected ? "border-primary bg-card-selected ring-1 ring-primary" : "border-border bg-card hover:bg-inset",
                )}
              >
                <span className="flex min-w-0 items-center gap-2 text-sm font-semibold">
                  <Icon weight={selected ? "fill" : "regular"} className={cn("size-[18px] shrink-0", selected && "text-primary")} />
                  <span id={`${id}-${i}`} className="truncate" title={option.label}>
                    {option.label}
                  </span>
                </span>
                <span id={`${id}-${i}-description`} className="text-xs text-muted-foreground">
                  {option.description}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </ChoiceGroup>
  );
}

export function SwitchField({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  const id = useId();
  return (
    <div className="flex items-center gap-2">
      <Switch id={id} checked={checked} onCheckedChange={(next) => onChange(next)} />
      <Label htmlFor={id} className="font-medium text-foreground">
        {label}
      </Label>
    </div>
  );
}

export function Section({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card size="flat">
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            {title}
            {description ? <InfoTip about={title}>{description}</InfoTip> : null}
          </span>
          {action}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">{children}</CardContent>
    </Card>
  );
}

/** Two columns on wider screens, one on phones. */
export function FieldGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-1 gap-3 @sm:grid-cols-2">{children}</div>;
}
