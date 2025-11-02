# Components Needing Harvous Design Treatment

## 🎯 Overview

This document tracks all React components and UI elements that were functionally implemented but haven't received the full "Harvous design treatment" yet. These components currently use generic Tailwind classes instead of Harvous CSS variables and design patterns.

**Status**: Components are functional but need design system consistency updates  
**Priority**: Design polish for V1 release  
**Estimated Time**: 3-4 days total

---

## 🔴 HIGH PRIORITY Components

### 1. AddToSection.tsx
**Location**: `src/components/react/AddToSection.tsx`  
**Used In**: NoteDetailsPanel (thread management interface)

#### Current Issues
- ❌ Generic Tailwind classes: `border-gray-200`, `hover:bg-gray-50`, `text-gray-500`, `text-gray-700`, `text-gray-900`
- ❌ Container: `bg-white` instead of Harvous surface colors
- ❌ Missing Harvous shadow patterns
- ❌ Generic hover states don't match Harvous design system

#### Required Changes
```tsx
// Replace generic classes with Harvous CSS variables
- `bg-white` → `bg-[var(--color-snow-white)]` or `bg-[var(--color-fog-white)]`
- `border-gray-200` → `border-[var(--color-gray)]` or Harvous border color
- `text-gray-500` → `text-[var(--color-pebble-grey)]`
- `text-gray-700` → `text-[var(--color-stone-grey)]`
- `text-gray-900` → `text-[var(--color-deep-grey)]`
- `hover:bg-gray-50` → Custom hover state using Harvous colors
- `shadow-sm` → Apply `--shadow-small` or Harvous shadow pattern
- Add proper rounded corners: `rounded-xl` (matches existing)
```

#### Specific Lines to Update
- Line 72: Item container hover states
- Line 84-95: Text color classes
- Line 121: Container background and border
- Line 122: Title text color
- Line 137, 153, 163: Empty states and loading text colors

#### Design Pattern Reference
- Match existing panel styling from `NewNotePanel.tsx`
- Use same border and shadow patterns as `SearchInput.tsx`
- Follow hover state patterns from `SpaceButton.astro`

---

### 2. ThreadCombobox.tsx
**Location**: `src/components/react/ThreadCombobox.tsx`  
**Used In**: NewNotePanel (thread selection dropdown)

#### Current Issues
- ❌ Dropdown: `bg-white`, `border-gray-200`, `shadow-lg`
- ❌ Search input: Generic `border-gray-200` with `focus:ring-blue-500` (should use Harvous colors)
- ❌ Dropdown items: `hover:bg-gray-50` instead of Harvous hover states
- ❌ Empty state: `text-gray-500`

#### Required Changes
```tsx
// Dropdown container (line 62)
- `bg-white` → `bg-[var(--color-snow-white)]`
- `border-gray-200` → `border-[var(--color-gray)]` or appropriate Harvous border
- `shadow-lg` → Harvous shadow pattern (match existing dropdowns)

// Search input container (line 64)
- `border-gray-100` → Harvous border color
- Search input itself (line 70):
  - `border-gray-200` → Harvous border color
  - `focus:ring-blue-500` → `focus:ring-[var(--color-bold-blue)]` or Harvous focus color
  - `focus:border-transparent` → Keep but ensure Harvous color

// Dropdown items (line 87)
- `hover:bg-gray-50` → Harvous hover state (subtle background change)

// Empty state (line 108)
- `text-gray-500` → `text-[var(--color-pebble-grey)]`
```

#### Design Pattern Reference
- Match dropdown styling from `MobileNavigation.tsx` dropdown (after it's updated)
- Use `SearchInput.tsx` as reference for search input styling
- Follow Harvous rounded corner patterns: `rounded-xl`

---

### 3. MobileNavigation.tsx (Dropdown Menu)
**Location**: `src/components/react/navigation/MobileNavigation.tsx`  
**Used In**: Mobile navigation dropdown

#### Current Issues
- ❌ Dropdown menu: `bg-white`, `border-gray-200`, `shadow-lg` (line 227)
- ❌ Dividers: `border-gray-200` (multiple lines)
- ❌ Disabled button: `hover:bg-gray-50`, `opacity-60`

#### Required Changes
```tsx
// Dropdown container (line 227)
- `bg-white` → `bg-[var(--color-snow-white)]`
- `border-gray-200` → `border-[var(--color-gray)]`
- `shadow-lg` → Harvous shadow pattern

// Dividers (lines 256, 377, 416, 446)
- `border-gray-200` → `border-[var(--color-gray)]` or appropriate Harvous divider color

// Disabled button (line 448)
- `hover:bg-gray-50` → Remove or use Harvous hover state
- Review opacity values - ensure they match Harvous disabled state patterns
```

#### Design Pattern Reference
- Match dropdown styling patterns from desktop navigation
- Use Harvous surface colors for backgrounds
- Follow divider patterns from existing Harvous components

---

## 🟡 MEDIUM PRIORITY Components

### 4. NoteDetailsPanel.tsx
**Location**: `src/components/react/NoteDetailsPanel.tsx`  
**Used In**: Note details view with tabs

#### Current Issues
- ❌ Modal dialogs: `bg-white`, `shadow-lg`, `text-gray-900`, `text-gray-600`, `bg-gray-100` (line 333)
- ❌ Empty states: `text-gray-500`, `bg-gray-100` (lines 470, 477, 548)
- ❌ Buttons: `bg-gray-100`, `hover:bg-gray-200` (lines 343, 586)
- ❌ Coming soon section: `bg-gray-100`, `text-gray-400`, `text-gray-900`, `text-gray-500` (lines 529-540)

#### Required Changes
```tsx
// Modal dialog (line 333)
- `bg-white` → `bg-[var(--color-snow-white)]`
- `text-gray-900` → `text-[var(--color-deep-grey)]`
- `text-gray-600` → `text-[var(--color-stone-grey)]`
- `bg-gray-100` → Use ButtonSmall component or Harvous button styling

// Empty states (lines 470, 477, 548)
- `text-gray-500` → `text-[var(--color-pebble-grey)]`

// Buttons (lines 343, 586)
- Replace with `ButtonSmall` component
- Or use Harvous button styling patterns

// Coming soon section (lines 529-540)
- `bg-gray-100` → `bg-[var(--color-fog-white)]` or appropriate Harvous color
- `text-gray-400` → `text-[var(--color-pebble-grey)]`
- `text-gray-900` → `text-[var(--color-deep-grey)]`
- `text-gray-500` → `text-[var(--color-pebble-grey)]`
```

#### Design Pattern Reference
- Use `ButtonSmall.tsx` component for all buttons
- Match modal styling from other panels
- Follow empty state patterns from existing components

---

## 🟢 LOW PRIORITY Components

### 5. NewNotePanel.tsx & NewThreadPanel.tsx
**Location**: `src/components/react/NewNotePanel.tsx`, `src/components/react/NewThreadPanel.tsx`

#### Current Issues
- ⚠️ Some modal dialogs still use generic Tailwind (`bg-white`, `shadow-lg`, `hover:bg-gray-100`)
- ⚠️ Mostly good, but needs final consistency review

#### Required Changes
```tsx
// Review and replace any remaining generic Tailwind classes
// Ensure all components use Harvous CSS variables
// Verify button components are used consistently
```

#### Design Pattern Reference
- These components are mostly done, just need final polish pass

---

## 📋 Harvous Design System Reference

### CSS Variables (from `src/styles/global.css`)
```css
/* Surface Colors */
--color-snow-white: #FAFAFA;      /* Primary backgrounds */
--color-fog-white: #F7F7F6;        /* Subtle backgrounds */
--color-paper: #EBE7DB;             /* Alternative background */

/* Text Colors */
--color-deep-grey: #4A473D;         /* Primary text */
--color-stone-grey: #78766F;        /* Secondary text */
--color-pebble-grey: #888680;        /* Tertiary text */

/* Border & Divider Colors */
--color-gray: #E9E9E9;               /* Borders and dividers */

/* Shadows */
--shadow-small: inset 0px -3px 0px rgba(120, 118, 111, 0.2);
```

### Design Patterns
- **Rounded Corners**: `rounded-xl` (16px) for panels, `rounded-3xl` (24px) for buttons
- **Shadows**: Use `--shadow-small` for inputs, custom shadows for panels
- **Borders**: Always use Harvous color variables, never `border-gray-*`
- **Hover States**: Subtle background changes using Harvous colors
- **Transitions**: `duration-300` for most interactions, `duration-125` for button presses

### Component References
- ✅ **ButtonSmall.tsx**: Standard button component (use this for all buttons)
- ✅ **SearchInput.tsx**: Properly styled search input (use as reference)
- ✅ **SpaceButton.astro**: Button styling patterns
- ✅ **SquareButton.tsx**: Square button component

---

## 🎯 Implementation Priority

### Week 2.5: Design Polish Sprint (3-4 days)

**Day 1: High Priority Core Components**
- [ ] AddToSection.tsx - Complete redesign with Harvous variables
- [ ] ThreadCombobox.tsx - Dropdown and search input styling

**Day 2: Navigation Components**
- [ ] MobileNavigation.tsx - Dropdown menu styling
- [ ] Test mobile navigation dropdown

**Day 3: Panel Polish**
- [ ] NoteDetailsPanel.tsx - Modal dialogs and empty states
- [ ] Review NewNotePanel.tsx & NewThreadPanel.tsx for consistency

**Day 4: Final Review & Testing**
- [ ] Cross-component consistency check
- [ ] Mobile/desktop responsive testing
- [ ] Visual comparison with existing Harvous components
- [ ] Fix any remaining inconsistencies

---

## 🔍 Finding Generic Tailwind Classes

Use this grep pattern to find components with generic Tailwind classes:
```bash
grep -r "border-gray\|bg-gray\|text-gray\|shadow-lg" src/components/react --include="*.tsx"
```

Common replacements:
- `bg-white` → `bg-[var(--color-snow-white)]`
- `bg-gray-50` → `bg-[var(--color-fog-white)]`
- `bg-gray-100` → `bg-[var(--color-paper)]` or appropriate Harvous color
- `border-gray-200` → `border-[var(--color-gray)]`
- `text-gray-500` → `text-[var(--color-pebble-grey)]`
- `text-gray-700` → `text-[var(--color-stone-grey)]`
- `text-gray-900` → `text-[var(--color-deep-grey)]`
- `shadow-lg` → Custom Harvous shadow pattern
- `hover:bg-gray-50` → Custom hover state with Harvous colors

---

## ✅ Completion Checklist

### AddToSection.tsx
- [ ] Replace all `border-gray-*` classes
- [ ] Replace all `bg-gray-*` classes
- [ ] Replace all `text-gray-*` classes
- [ ] Update hover states to use Harvous colors
- [ ] Apply Harvous shadow patterns
- [ ] Test in NoteDetailsPanel context

### ThreadCombobox.tsx
- [ ] Update dropdown container styling
- [ ] Update search input to use SearchInput pattern
- [ ] Update dropdown items hover states
- [ ] Update empty state text color
- [ ] Test dropdown functionality

### MobileNavigation.tsx
- [ ] Update dropdown menu container
- [ ] Update all dividers
- [ ] Update disabled button states
- [ ] Test mobile navigation dropdown

### NoteDetailsPanel.tsx
- [ ] Update modal dialog styling
- [ ] Replace generic buttons with ButtonSmall
- [ ] Update empty states
- [ ] Update coming soon section
- [ ] Test all panel interactions

### Final Review
- [ ] All components use Harvous CSS variables
- [ ] No generic Tailwind color classes remaining
- [ ] Consistent styling across all components
- [ ] Mobile/desktop responsive testing
- [ ] Visual consistency with existing Harvous components

---

**Last Updated**: January 2025  
**Status**: Ready for implementation  
**Next Steps**: Begin Day 1 of Design Polish Sprint
