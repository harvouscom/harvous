"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

interface ButtonGroupProps {
  value: string;
  onValueChange: (value: string) => void;
  options: Array<{
    value: string;
    label: string;
  }>;
  className?: string;
}

const ButtonGroup = React.forwardRef<HTMLDivElement, ButtonGroupProps>(
  ({ className, value, onValueChange, options, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          "inline-flex items-center rounded-lg border border-[var(--color-fog-white)] bg-[var(--color-snow-white)] p-1",
          className
        )}
        {...props}
      >
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onValueChange(option.value);
            }}
            className={cn(
              "px-4 py-2 text-sm font-medium rounded-md transition-all duration-200",
              value === option.value
                ? "bg-[var(--color-bold-blue)] text-[var(--color-fog-white)] shadow-sm"
                : "text-[var(--color-deep-grey)] hover:text-[var(--color-bold-blue)] hover:bg-[var(--color-paper)]"
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
    )
  }
)
ButtonGroup.displayName = "ButtonGroup"

export { ButtonGroup }
