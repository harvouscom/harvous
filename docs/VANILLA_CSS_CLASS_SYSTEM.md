# Vanilla CSS Class System

## Overview

Harvous has migrated from Tailwind CSS to a **vanilla CSS class system** following 37signals' #nobuild patterns. This document explains our current approach and the path forward.

## Current State: Hybrid System

### ✅ What We've Achieved

1. **Removed Tailwind CSS** - No longer using Tailwind's build process or utility generation
2. **Semantic CSS Files** - Created focused CSS files for specific purposes:
   - `colors.css` - OKLCH color system with semantic variables
   - `typography.css` - Font system and text styles
   - `buttons.css` - Button variants and styles
   - `cards.css` - Card components
   - `navigation.css` - Navigation components
   - `panels.css` - Panel/bottom-sheet structure
   - `forms.css` - Form elements

3. **Semantic Classes** - Created meaningful class names:
   - `.btn-cta` - Primary call-to-action buttons
   - `.space-button` - Space navigation buttons
   - `.menu-item` - Menu items in dropdowns
   - `.menu-item__label` - Menu item text labels
   - `.card-note-container` - Note card containers
   - `.text-title`, `.text-subtitle` - Typography classes
   - `.text-metadata` - Metadata text (12px, stone-grey)
   - `.empty-state` - Empty state containers (80px top/bottom padding, centered)

### ⚠️ Transitional State: `utilities.css`

**Status**: Still in use, but being phased out

The `utilities.css` file contains ~966 lines of utility classes that replicate Tailwind's utility system. This is a **temporary bridge** during migration.

#### Why We Still Have It

1. **Gradual Migration** - Components are being migrated one by one
2. **Backward Compatibility** - Existing components still use utility classes
3. **Common Patterns** - Some utilities (like `flex`, `grid`, `hidden`) are still widely used

#### What's in `utilities.css`

- **Layout utilities**: `flex`, `grid`, `block`, `hidden`, `relative`, `absolute`
- **Spacing utilities**: `p-*`, `m-*`, `gap-*`, `px-*`, `py-*`
- **Sizing utilities**: `w-*`, `h-*`, `min-w-*`, `max-w-*`
- **Typography utilities**: `font-*`, `text-*`, `leading-*`
- **Visual utilities**: `rounded-*`, `border-*`, `opacity-*`
- **Interaction utilities**: `cursor-*`, `transition-*`, `hover:*`, `active:*`

## Target State: Semantic Classes Only

### Goal

Replace utility classes with **semantic, purpose-driven class names** that describe **what** an element is, not **how** it looks.

### Principles

1. **Semantic Over Utility** - Use `.menu-item` instead of `.flex items-center gap-3 py-[18px] px-4`
2. **Component-Scoped** - Styles belong in component-specific CSS files
3. **Meaningful Names** - Class names should describe purpose, not appearance
4. **Reusable Patterns** - Extract common patterns into semantic classes

### Examples

#### ❌ Before (Utility Classes)
```html
<button class="flex items-center gap-3 py-[18px] px-4 hover:bg-gray-50 transition-colors duration-150 cursor-pointer w-full text-left rounded-[3px]">
  <span class="font-sans font-semibold text-[18px] text-[var(--color-deep-grey)] whitespace-nowrap">
    New Thread
  </span>
</button>
```

#### ✅ After (Semantic Classes)
```html
<button class="menu-item">
  <span class="menu-item__label">New Thread</span>
</button>
```

```css
/* In appropriate CSS file (e.g., navigation.css or global.css) */
.menu-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 18px 1rem 20px 1rem;
  width: 100%;
  text-align: left;
  border-radius: 3px;
  cursor: pointer;
  transition: background-color 150ms;
}

.menu-item:hover {
  background-color: rgb(249 250 251);
}

.menu-item__label {
  font-family: var(--font-sans);
  font-weight: 600;
  font-size: 18px;
  color: var(--color-deep-grey);
  white-space: nowrap;
}
```

## When to Use What

### ✅ Use Semantic Classes When:

1. **Repeated Patterns** - Same combination of utilities used multiple times
2. **Component-Specific** - Styles that belong to a specific component
3. **Maintainability** - When you want to change styling in one place
4. **Readability** - When utility classes make HTML hard to read

### ⚠️ Use Utility Classes (Temporarily) When:

1. **One-Off Styling** - Unique styling that won't be reused
2. **During Migration** - While transitioning components
3. **Layout Helpers** - Simple layout utilities like `flex`, `grid`, `hidden`
4. **Spacing Helpers** - Simple spacing like `gap-3`, `mb-4` (but prefer semantic spacing)

### ❌ Avoid Utility Classes For:

1. **Complex Combinations** - Multiple utilities that form a pattern
2. **Component Styles** - Styles that define a component's appearance
3. **Theme-Dependent Styles** - Colors, fonts, sizes that should use CSS variables

## Migration Strategy

### Phase 1: Identify Patterns ✅ (In Progress)

Look for repeated utility combinations:
```bash
# Find common patterns
grep -r "flex items-center gap-3" src/components
grep -r "font-sans font-semibold text-\[18px\]" src/components
```

### Phase 2: Create Semantic Classes ✅ (In Progress)

Extract patterns into semantic classes:
- `.menu-item` - Menu items
- `.space-button` - Space buttons
- `.btn-cta` - Primary buttons
- `.card-note-container` - Note cards

### Phase 3: Migrate Components 🔄 (Ongoing)

Replace utility classes with semantic classes component by component.

### Phase 4: Remove `utilities.css` ⏳ (Future)

Once all components are migrated:
1. Remove unused utility classes
2. Keep only essential layout utilities if needed
3. Or remove `utilities.css` entirely

## File Organization

### Current Structure

```
src/styles/
├── colors.css          # Color system (OKLCH)
├── typography.css      # Typography system
├── utilities.css       # ⚠️ Transitional utility classes
├── buttons.css         # Button components
├── cards.css           # Card components
├── navigation.css      # Navigation components
├── panels.css          # Panel/bottom-sheet components
├── forms.css           # Form elements
├── global.css          # Global styles and resets
└── tiptap-editor.css   # Rich text editor styles
```

### Where to Add New Semantic Classes

1. **Component-Specific** - Add to the relevant CSS file:
   - Button styles → `buttons.css`
   - Card styles → `cards.css`
   - Navigation styles → `navigation.css`

2. **Global Patterns** - Add to `global.css`:
   - `.menu-item` - Used across multiple components
   - Base typography classes
   - Common layout patterns

3. **New Components** - Create new CSS file if needed:
   - `modals.css` - For modal/dialog components
   - `tables.css` - For table components

## Best Practices

### 1. Naming Conventions

- **Component classes**: `.component-name` (e.g., `.menu-item`)
- **Element classes**: `.component-name__element` (e.g., `.menu-item__label`)
- **Modifier classes**: `.component-name--modifier` (e.g., `.btn-cta--large`)
- **State classes**: `.component-name.is-active` or `.component-name:hover`

### 2. CSS Organization

```css
/* Component base */
.menu-item {
  /* Base styles */
}

/* Component elements */
.menu-item__label {
  /* Label-specific styles */
}

/* Component modifiers */
.menu-item--active {
  /* Active state */
}

/* Component states */
.menu-item:hover {
  /* Hover state */
}
```

### 3. Use CSS Variables

Always use CSS variables for colors, spacing, and typography:

```css
.menu-item__label {
  color: var(--color-deep-grey);  /* ✅ Good */
  font-size: 18px;                /* ⚠️ Consider: var(--font-size-menu) */
  padding: var(--spacing-4);       /* ✅ Good (if spacing tokens exist) */
}
```

### 4. Avoid Inline Styles

Prefer CSS classes over inline styles:

```html
<!-- ❌ Bad -->
<div style="color: var(--color-deep-grey); font-size: 18px;">

<!-- ✅ Good -->
<div class="menu-item__label">
```

## Examples

### Example 1: Menu Item

**Before (Utility Classes):**
```html
<button class="flex items-center gap-3 py-[18px] px-4 pb-5 hover:bg-gray-50 transition-colors duration-150 cursor-pointer w-full text-left rounded-[3px]">
  <span class="font-sans font-semibold text-[18px] text-[var(--color-deep-grey)] whitespace-nowrap">
    New Thread
  </span>
</button>
```

**After (Semantic Classes):**
```html
<button class="menu-item">
  <span class="menu-item__label">New Thread</span>
</button>
```

### Example 2: Space Button

**Before (Utility Classes):**
```html
<button class="space-button relative rounded-3xl h-[64px] cursor-pointer transition-[scale,shadow] duration-200 pl-4 pr-0 w-full" style="background-image: var(--color-gradient-gray);">
  <span class="font-sans font-semibold text-[18px] text-[var(--color-deep-grey)]">
    New Space
  </span>
</button>
```

**After (Semantic Classes):**
```html
<button class="space-button">
  <span class="space-btn__text">New Space</span>
</button>
```

## FAQ

### Q: Do we still need `utilities.css`?

**A: Yes, for now.** We're in a transitional state. Once all components are migrated to semantic classes, we can remove it.

### Q: Can I still use utility classes?

**A: Yes, but prefer semantic classes.** Use utilities for:
- Simple one-off styling
- Layout helpers (`flex`, `grid`, `hidden`)
- During component migration

### Q: How do I know if I should create a semantic class?

**A: Create a semantic class if:**
- The same utility combination appears 3+ times
- It represents a component or pattern
- You want to change styling in one place

### Q: Where should I put new semantic classes?

**A:**
- Component-specific → relevant CSS file (`buttons.css`, `cards.css`, etc.)
- Global patterns → `global.css`
- New component type → create new CSS file

### Q: What about responsive design?

**A: Use CSS media queries in semantic classes:**

```css
.menu-item {
  padding: 12px 1rem;
}

@media (min-width: 1160px) {
  .menu-item {
    padding: 18px 1rem;
  }
}
```

## Migration Checklist

When migrating a component from utilities to semantic classes:

- [ ] Identify all utility class combinations
- [ ] Group related utilities into semantic classes
- [ ] Create semantic class names (`.component-name`, `.component-name__element`)
- [ ] Add CSS to appropriate file
- [ ] Update HTML to use semantic classes
- [ ] Test component appearance and behavior
- [ ] Remove unused utility classes from component
- [ ] Document the new semantic classes

## Resources

- [37signals' #nobuild CSS Patterns](https://dev.37signals.com/modern-css-patterns-and-techniques-in-campfire/)
- [BEM Methodology](http://getbem.com/) - For naming conventions
- [Component CSS Migration Plan](./COMPONENT_CSS_MIGRATION_PLAN.md) - Detailed migration strategy

## Summary

- ✅ **Current State**: Hybrid system with both utilities and semantic classes
- 🎯 **Target State**: Semantic classes only
- ⚠️ **`utilities.css`**: Still needed during migration, will be removed eventually
- 📝 **Guideline**: Prefer semantic classes, use utilities sparingly during transition

