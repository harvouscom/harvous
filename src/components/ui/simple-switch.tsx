"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

interface SimpleSwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  className?: string;
  disabled?: boolean;
}

const SimpleSwitch = React.forwardRef<HTMLButtonElement, SimpleSwitchProps>(
  ({ className, checked, onCheckedChange, disabled = false, ...props }, ref) => {
    return (
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        className={cn(
          "peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50",
          checked ? "bg-[var(--color-bold-blue)]" : "bg-[var(--color-stone-grey)]",
          className
        )}
        onClick={() => onCheckedChange(!checked)}
        ref={ref}
        {...props}
      >
        <span
          className={cn(
            "pointer-events-none block h-5 w-5 rounded-full bg-white shadow-lg ring-0 transition-transform",
            checked ? "translate-x-5" : "translate-x-0"
          )}
        />
      </button>
    )
  }
)
SimpleSwitch.displayName = "SimpleSwitch"

export { SimpleSwitch }
