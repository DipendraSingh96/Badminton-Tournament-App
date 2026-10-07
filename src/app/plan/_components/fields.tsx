"use client";

import { createContext, useContext, useId, type ReactNode } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import type { PlanIssue } from "@/lib/tournament/schema";

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
    <div className="flex min-w-0 flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {message ? (
        <p id={`${id}-message`} className="text-xs text-destructive">
          {message}
        </p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
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
      <Label htmlFor={id}>{label}</Label>
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
          <span>{title}</span>
          {action}
        </CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">{children}</CardContent>
    </Card>
  );
}

/** Two columns on wider screens, one on phones. */
export function FieldGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{children}</div>;
}
