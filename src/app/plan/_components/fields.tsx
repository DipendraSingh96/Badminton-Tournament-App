"use client";

import { CheckCircleIcon, CircleIcon, InfoIcon, MinusIcon, PlusIcon } from "@phosphor-icons/react";
import { createContext, useContext, useId, type KeyboardEvent, type ReactNode } from "react";
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
          <button
            type="button"
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
 * Wraps a control with its label and message. Missing values are listed on
 * the dashboard, so a field only shows its message once something is entered.
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
    <div className="flex min-w-0 flex-col gap-1.5" data-path={pathKey(path)}>
      <div className="flex items-center gap-1">
        <Label htmlFor={id}>{label}</Label>
        {hint ? <InfoTip about={label}>{hint}</InfoTip> : null}
      </div>
      {children}
      {message ? (
        <p id={`${id}-message`} className="text-xs text-over-text">
          {message}
        </p>
      ) : null}
    </div>
  );
}

function useInvalid(path: Path, filled: boolean) {
  const issues = useContext(IssuesContext);
  return filled && issues.has(pathKey(path));
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
  const invalid = useInvalid(path, filled);
  return (
    <Field id={id} label={label} path={path} filled={filled} hint={hint}>
      <Input
        id={id}
        type="number"
        inputMode="decimal"
        step={step}
        min={0}
        value={value ?? ""}
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
  const invalid = useInvalid(path, filled);
  const step = (delta: number) => onChange(Math.max(min, (value ?? min) + (value === null ? 0 : delta)));
  return (
    <Field id={id} label={label} path={path} filled={filled} hint={hint}>
      <div className="flex items-stretch overflow-hidden rounded-md border border-input bg-card focus-within:ring-2 focus-within:ring-ring">
        <button
          type="button"
          aria-label={`Decrease ${label.toLowerCase()}`}
          className="grid size-11 shrink-0 place-items-center text-primary transition-colors outline-none hover:bg-inset focus-visible:bg-inset disabled:opacity-40 [&_svg]:size-5"
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
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? `${id}-message` : undefined}
          className="h-11 w-full min-w-0 [appearance:textfield] bg-transparent text-center font-display text-xl font-semibold tabular-nums outline-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          onChange={(e) => {
            const raw = e.target.value;
            const parsed = raw === "" ? null : Number(raw);
            onChange(parsed === null || Number.isNaN(parsed) ? null : parsed);
          }}
        />
        <button
          type="button"
          aria-label={`Increase ${label.toLowerCase()}`}
          className="grid size-11 shrink-0 place-items-center text-primary transition-colors outline-none hover:bg-inset focus-visible:bg-inset [&_svg]:size-5"
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
}: {
  label: string;
  path: Path;
  value: string;
  onChange: (value: string) => void;
  type?: "text" | "date" | "time";
  placeholder?: string;
}) {
  const id = useId();
  const filled = value !== "";
  const invalid = useInvalid(path, filled);
  return (
    <Field id={id} label={label} path={path} filled={filled}>
      <Input
        id={id}
        type={type}
        value={value}
        placeholder={placeholder}
        aria-invalid={invalid || undefined}
        aria-describedby={invalid ? `${id}-message` : undefined}
        onChange={(e) => onChange(e.target.value)}
      />
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
        value={value === null ? "" : String(value)}
        onChange={(e) => {
          const option = options.find((o) => String(o.value) === e.target.value);
          if (option) onChange(option.value);
        }}
      >
        <NativeSelectOption value="" disabled>
          Choose…
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
    <div className="flex min-w-0 flex-col gap-1.5" data-path={pathKey(path)}>
      <div className="flex items-center gap-1">
        <span id={id} className="text-sm leading-none font-semibold text-muted-foreground">
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
                  "min-h-[34px] flex-1 rounded-sm px-3 py-1 text-[15px] font-semibold transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  selected
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-card hover:text-foreground",
                )}
              >
                {option.label}
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
          className="grid grid-cols-1 gap-2 @md:grid-cols-3"
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
                  selected ? "border-primary bg-accent ring-1 ring-primary" : "border-input bg-card hover:bg-inset",
                )}
              >
                <span className={cn("flex items-center gap-1.5 text-[15px] font-semibold", selected && "text-primary")}>
                  <Icon weight={selected ? "fill" : "regular"} className="size-[18px] shrink-0" />
                  <span id={`${id}-${i}`}>{option.label}</span>
                </span>
                <span id={`${id}-${i}-description`} className="text-[13px] text-muted-foreground">
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
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5">
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
  return <div className="grid grid-cols-1 gap-3 @md:grid-cols-2">{children}</div>;
}
