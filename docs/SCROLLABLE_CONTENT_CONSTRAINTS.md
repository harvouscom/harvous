# Scrollable Content Constraints Guide

## Problem Statement

When content exceeds the available viewport height, it can push elements off-screen instead of scrolling within its container. This document explains how to properly constrain content to scroll within a fixed-height container.

## Core Principle: The Height Constraint Chain

For content to scroll properly in a flexbox layout, **every parent in the chain** must have proper height constraints. If any parent in the chain allows expansion, the content will expand instead of scrolling.

## Required Properties for Each Level

Each container in the chain needs:

1. **Height constraint**: `h-full` (100% of parent) OR `flex-1` (fill available space in flex container)
2. **Minimum height override**: `min-h-0` (allows flex items to shrink below their content size)
3. **Overflow control**: `overflow-hidden` (prevents content from expanding beyond container)

### Why `min-h-0` is Critical

By default, flex items have `min-height: auto`, which means they won't shrink below their content size. Setting `min-h-0` allows the flex item to shrink, enabling scrolling.

## Complete Height Constraint Chain

For content to scroll properly, the chain from root to scrollable element must be:

```
Root Container (section/div)
  ├─ h-full (or flex-1)
  ├─ min-h-0
  └─ overflow-hidden
    │
    └─ Parent Container
      ├─ h-full (or flex-1)
      ├─ min-h-0
      └─ overflow-hidden
        │
        └─ Content Wrapper
          ├─ flex-1
          ├─ min-h-0
          └─ overflow-hidden
            │
            └─ Card/Content Container
              ├─ flex-1 (or h-full)
              ├─ min-h-0
              └─ overflow-hidden
                │
                └─ Scrollable Content Area
                  ├─ flex-1
                  ├─ min-h-0
                  └─ overflow-auto (or overflow-y: auto)
```

## Step-by-Step Implementation

### 1. Root Container (Layout Level)

```astro
<section class="h-full min-h-0 overflow-hidden">
  <div class="h-full min-h-0 overflow-hidden">
    <!-- Content -->
  </div>
</section>
```

**Key**: Both the section AND the inner div need constraints.

### 2. Component Wrapper (DesktopPanelManager)

```tsx
<div className="h-full hidden min-[1160px]:block" 
     style={{ 
       height: '100%', 
       maxHeight: '100%', 
       minHeight: 0, 
       overflow: 'hidden', 
       display: 'flex', 
       flexDirection: 'column' 
     }}>
  <YourComponent />
</div>
```

**Key**: Inline styles ensure constraints are applied even if CSS classes are overridden.

### 3. Component Root

```tsx
<div className="h-full flex flex-col" 
     style={{ height: '100%', maxHeight: '100%', minHeight: 0 }}>
  {/* Content */}
</div>
```

**Key**: Root uses `h-full` to fill parent, with explicit height constraints in style.

### 4. Content Wrapper

```tsx
<div className="flex-1 flex flex-col min-h-0 mb-3.5 overflow-hidden">
  {/* Card/Content */}
</div>
```

**Key**: Uses `flex-1` to fill available space, `min-h-0` to allow shrinking, `overflow-hidden` to prevent expansion.

### 5. Card Container

```tsx
<div className="bg-white box-border flex flex-col flex-1 min-h-0 items-start overflow-hidden pb-3 pt-6 px-3 relative rounded-[24px] shadow-[...]" 
     style={{ maxHeight: '100%', height: '100%' }}>
  {/* Header */}
  {/* Content Area */}
</div>
```

**Key**: Card uses `flex-1` (or `h-full flex-1`) to fill space, with both `maxHeight` and `height` in style for maximum constraint.

### 6. Content Area Wrapper

```tsx
<div className="flex-1 flex flex-col min-h-0 w-full" 
     style={{ maxHeight: '100%', overflow: 'hidden', marginBottom: '-12px' }}>
  <div className="flex-1 flex flex-col min-h-0" style={{ maxHeight: '100%' }}>
    <div className="flex-1 flex flex-col min-h-0 px-3" 
         style={{ height: 0, maxHeight: '100%', overflow: 'hidden' }}>
      {/* Scrollable content */}
    </div>
  </div>
</div>
```

**Key**: Multiple wrapper layers with `height: 0` on the innermost wrapper forces the flex constraint chain to work.

### 7. Scrollable Content Element

```tsx
<div 
  className="flex-1 overflow-auto inbox-note-detail-content"
  style={{ 
    lineHeight: '1.6', 
    minHeight: 0, 
    paddingBottom: '12px' 
  }}
  dangerouslySetInnerHTML={{ __html: content }}
/>
```

**Key**: Uses `flex-1 overflow-auto` with `minHeight: 0`. The `overflow-auto` enables scrolling when content exceeds available space.

## Common Patterns

### Pattern 1: Simple Scrollable Container

```tsx
// Parent must have: h-full min-h-0 overflow-hidden
<div className="flex-1 flex flex-col min-h-0 overflow-hidden">
  <div className="flex-1 overflow-auto">
    {/* Scrollable content */}
  </div>
</div>
```

### Pattern 2: Card with Scrollable Content

```tsx
// Card container
<div className="flex-1 flex flex-col min-h-0 overflow-hidden">
  {/* Fixed header */}
  <div className="shrink-0">Header</div>
  
  {/* Scrollable content */}
  <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
    <div className="flex-1 overflow-auto">
      {/* Content */}
    </div>
  </div>
  
  {/* Fixed footer */}
  <div className="shrink-0">Footer</div>
</div>
```

### Pattern 3: Multi-Layer Constraint (CardFullEditable pattern)

```tsx
// Outer wrapper
<div className="flex-1 flex flex-col min-h-0 w-full" 
     style={{ maxHeight: '100%', overflow: 'hidden' }}>
  // Middle wrapper
  <div className="flex-1 flex flex-col min-h-0" style={{ maxHeight: '100%' }}>
    // Inner wrapper with height: 0 trick
    <div className="flex-1 flex flex-col min-h-0 px-3" 
         style={{ height: 0, maxHeight: '100%', overflow: 'hidden' }}>
      // Scrollable div
      <div className="flex-1 overflow-auto">
        {/* Content */}
      </div>
    </div>
  </div>
</div>
```

**Why the `height: 0` trick?**: Setting `height: 0` on a flex container forces its children to respect the flex constraint chain. This is especially important when dealing with raw HTML content (not TiptapEditor).

## Key Differences: TiptapEditor vs Raw HTML

### TiptapEditor (NewNotePanel)

TiptapEditor handles its own internal scrolling, so you need fewer wrapper layers:

```tsx
<div className="flex-1 flex flex-col min-h-0 w-full" style={{ marginTop: '20px', maxHeight: '100%' }}>
  <div className="flex-1 flex flex-col min-h-0 px-3" style={{ height: 0, maxHeight: '100%', overflow: 'hidden' }}>
    <TiptapEditor ... />
  </div>
</div>
```

### Raw HTML Content (InboxItemPreviewPanel, CardFullEditable)

Raw HTML needs more explicit constraint layers:

```tsx
<div className="flex-1 flex flex-col min-h-0 w-full" style={{ maxHeight: '100%', overflow: 'hidden', marginBottom: '-12px' }}>
  <div className="flex-1 flex flex-col min-h-0" style={{ maxHeight: '100%' }}>
    <div className="flex-1 flex flex-col min-h-0 px-3" style={{ height: 0, maxHeight: '100%', overflow: 'hidden' }}>
      <div className="flex-1 overflow-auto">
        {/* Raw HTML content */}
      </div>
    </div>
  </div>
</div>
```

## Troubleshooting Checklist

If content is still expanding instead of scrolling:

1. ✅ **Check root container**: Does it have `h-full min-h-0 overflow-hidden`?
2. ✅ **Check every parent**: Does each parent in the chain have `flex-1` (or `h-full`), `min-h-0`, and `overflow-hidden`?
3. ✅ **Check card container**: Does it have `flex-1 min-h-0` (or `h-full flex-1 min-h-0`) with `overflow-hidden`?
4. ✅ **Check content wrapper**: Does it have `flex-1 min-h-0 overflow-hidden`?
5. ✅ **Check scrollable div**: Does it have `flex-1 overflow-auto` with `minHeight: 0` in style?
6. ✅ **Check inline styles**: Are height constraints also set in inline styles (not just classes)?
7. ✅ **Check for missing layers**: For raw HTML, do you have the extra wrapper layer with `height: 0`?

## Real-World Examples

### Working Example: InboxItemPreviewPanel

See `src/components/react/InboxItemPreviewPanel.tsx` lines 370-406 for a complete working example.

### Working Example: CardFullEditable

See `src/components/react/CardFullEditable.tsx` lines 573-586 for the display mode pattern.

### Working Example: NewNotePanel

See `src/components/react/NewNotePanel.tsx` lines 1374-1440 for the TiptapEditor pattern.

## Common Mistakes

1. **Missing `min-h-0`**: Without this, flex items won't shrink below content size
2. **Missing `overflow-hidden` on parents**: Content will expand beyond container
3. **Using `h-full` instead of `flex-1`**: In flex containers, `flex-1` is usually better
4. **Not setting inline styles**: CSS classes can be overridden; inline styles ensure constraints
5. **Skipping wrapper layers**: Raw HTML content needs more constraint layers than TiptapEditor
6. **Missing `height: 0` trick**: For raw HTML, the inner wrapper needs `height: 0` to force constraints

## Quick Reference

```tsx
// ✅ CORRECT: Complete constraint chain
<div className="h-full min-h-0 overflow-hidden">           // Root
  <div className="h-full flex flex-col min-h-0">           // Component root
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">  // Content wrapper
      <div className="flex-1 min-h-0 overflow-hidden">     // Card
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">  // Content area
          <div className="flex-1 overflow-auto min-h-0">   // Scrollable
            {/* Content */}
          </div>
        </div>
      </div>
    </div>
  </div>
</div>

// ❌ WRONG: Missing constraints
<div className="h-full">                                    // Missing min-h-0, overflow-hidden
  <div className="flex flex-col">                          // Missing h-full/flex-1, min-h-0
    <div className="overflow-auto">                         // Missing flex-1, min-h-0
      {/* Content - will expand! */}
    </div>
  </div>
</div>
```

## Summary

The golden rule: **Every parent in the flex column chain must have `flex-1` (or `h-full`), `min-h-0`, and `overflow-hidden`** for the scrollable child to work properly. Missing any of these at any level will break the constraint chain and cause content to expand instead of scroll.

