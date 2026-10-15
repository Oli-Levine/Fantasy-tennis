"use client";

import { cn } from "@/lib/utils";

/** A row of mutually exclusive options (radio buttons styled as a pill). */
export function Segmented<T extends string>({
  name,
  value,
  onChange,
  options,
  className,
}: {
  name: string;
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string }[];
  className?: string;
}) {
  return (
    <div role="radiogroup" className={cn("grid gap-1 rounded-xl bg-muted p-1", className)} style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((option) => (
        <label
          key={option.value}
          className={cn(
            "flex h-10 cursor-pointer items-center justify-center rounded-lg text-sm font-medium transition-colors has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/40",
            value === option.value ? "bg-surface shadow-soft" : "text-muted-foreground",
          )}
        >
          <input
            type="radio"
            name={name}
            value={option.value}
            checked={value === option.value}
            onChange={() => onChange(option.value)}
            className="sr-only"
          />
          {option.label}
        </label>
      ))}
    </div>
  );
}
