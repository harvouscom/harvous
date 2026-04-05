"use client"

import * as React from "react"
import { Drawer } from "vaul"

import { cn } from "@/lib/utils"

const DrawerOverlay = React.forwardRef<
  React.ElementRef<typeof Drawer.Overlay>,
  React.ComponentPropsWithoutRef<typeof Drawer.Overlay> & {
    /** Backdrop tap — same pattern as SheetContent’s onOverlayClick in sheet.tsx */
    onOverlayClick?: () => void
  }
>(({ className, onOverlayClick, onClick, ...props }, ref) => (
  <Drawer.Overlay
    ref={ref}
    className={cn("sheet-overlay", className)}
    onClick={(e) => {
      onClick?.(e)
      if (e.defaultPrevented) return
      onOverlayClick?.()
    }}
    {...props}
  />
))
DrawerOverlay.displayName = "DrawerOverlay"

/** Matches bottom `sheetVariants` in sheet.tsx; global.css handles z-index / shadow via `[data-side="bottom"]` + `.bottom-sheet-content`. */
const bottomDrawerContentBase =
  "fixed z-50 bg-background shadow-lg inset-x-0 bottom-0 p-0 outline-none"

export type DrawerContentProps = React.ComponentPropsWithoutRef<typeof Drawer.Content> & {
  onOverlayClick?: () => void
  /** Optional class on the overlay (e.g. z-index above other fixed UI). */
  overlayClassName?: string
}

const DrawerContent = React.forwardRef<
  React.ElementRef<typeof Drawer.Content>,
  DrawerContentProps
>(({ className, children, onOverlayClick, overlayClassName, ...props }, ref) => (
  <Drawer.Portal>
    <DrawerOverlay onOverlayClick={onOverlayClick} className={overlayClassName} />
    <Drawer.Content
      ref={ref}
      data-side="bottom"
      className={cn(bottomDrawerContentBase, className)}
      {...props}
    >
      {children}
    </Drawer.Content>
  </Drawer.Portal>
))
DrawerContent.displayName = "DrawerContent"

export { Drawer, DrawerContent, DrawerOverlay }
