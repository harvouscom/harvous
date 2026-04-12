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

/** Bottom sheet shell: `[data-side="bottom"]` + `.drawer-content-bottom` in global.css (no Tailwind in SPA). */
const drawerContentBottomClass = "drawer-content-bottom"

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
      className={cn(drawerContentBottomClass, className)}
      {...props}
    >
      {children}
    </Drawer.Content>
  </Drawer.Portal>
))
DrawerContent.displayName = "DrawerContent"

export { Drawer, DrawerContent, DrawerOverlay }
