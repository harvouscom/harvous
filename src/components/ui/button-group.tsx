"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

interface ButtonGroupProps extends React.HTMLAttributes<HTMLDivElement> {
  orientation?: "horizontal" | "vertical";
  className?: string;
  children?: React.ReactNode;
}

const ButtonGroup = React.forwardRef<HTMLDivElement, ButtonGroupProps>(
  ({ className, orientation = "horizontal", children, ...props }, ref) => {
    // Use flex instead of inline-flex when w-full is passed
    const isFullWidth = className?.includes('w-full');
    return (
      <div
        ref={ref}
        role="group"
        className={cn(
          isFullWidth ? "flex items-center gap-0" : "inline-flex items-center gap-0",
          orientation === "vertical" ? "flex-col" : "flex-row",
          className
        )}
        {...props}
      >
        {children}
      </div>
    )
  }
)
ButtonGroup.displayName = "ButtonGroup"

export { ButtonGroup }
