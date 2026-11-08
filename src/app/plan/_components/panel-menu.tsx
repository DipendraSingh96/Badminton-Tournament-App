"use client";

import { CaretDownIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/**
 * The workbench's title: the part being shown (Tournament setup, Schedule
 * structure or Finance), which opens a menu to show another.
 */
export function PanelMenu<T extends string>({
  value,
  options,
  onChoose,
}: {
  value: T;
  options: readonly { value: T; label: string }[];
  onChoose: (value: T) => void;
}) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value) ?? options[0]!;
  const optionClass =
    "flex items-center rounded-md px-2 py-2 text-left text-sm font-medium outline-none hover:bg-inset focus-visible:bg-inset focus-visible:ring-2 focus-visible:ring-ring aria-pressed:bg-accent";
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <button
            type="button"
            aria-label={`${current.label}. Show another part of the workbench`}
            className="-mx-2 flex min-w-0 items-center gap-2 rounded-md px-2 py-1 outline-none hover:bg-inset focus-visible:ring-2 focus-visible:ring-ring"
          />
        }
      >
        <span className="heading-card truncate text-xl">{current.label}</span>
        <CaretDownIcon weight="bold" className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56 gap-1 p-2">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            aria-pressed={o.value === value}
            className={optionClass}
            onClick={() => {
              onChoose(o.value);
              setOpen(false);
            }}
          >
            {o.label}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}
