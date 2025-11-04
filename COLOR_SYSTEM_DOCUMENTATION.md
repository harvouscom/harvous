# Color System Documentation

This document tracks the thread color system changes between pastel and vibrant colors, and provides a complete guide for switching between them.

## Current Color System: Pastel Colors

**Status**: ✅ Active  
**Date**: January 2025  
**Text Color**: Dark grey (`var(--color-deep-grey)`) for all thread colors

### Pastel Color Values

| Color | Hex Value | CSS Variable |
|-------|-----------|--------------|
| Blue | `#C3E4FF` | `--color-blue` |
| Yellow | `#F9DE78` | `--color-yellow` |
| Green | `#C7ECBB` | `--color-green` |
| Pink | `#F7CEEE` | `--color-pink` |
| Orange | `#FCD8A0` | `--color-orange` |
| Purple | `#E8C9FF` | `--color-purple` |

**Text Color**: All pastel colors use dark text (`var(--color-deep-grey)`) for optimal readability.

## Previous Color System: Vibrant Colors

**Status**: ⚠️ Inactive (replaced)  
**Text Color**: White for all thread colors (except paper)

### Vibrant Color Values

| Color | Hex Value | CSS Variable |
|-------|-----------|--------------|
| Blue | `#20a9ff` | `--color-blue` |
| Yellow | `#f5a824` | `--color-yellow` |
| Green | `#44a024` | `--color-green` |
| Pink | `#ff279e` | `--color-pink` |
| Orange | `#ff5c26` | `--color-orange` |
| Purple | `#ba27ff` | `--color-purple` |

**Text Color**: Vibrant colors require white text for optimal contrast and readability.

## Switching Between Color Systems

### To Switch from Pastel to Vibrant Colors

Follow these steps in order:

#### 1. Update Color Variables in `src/styles/global.css`

**Location**: Lines 36-41 in `:root` section

**Change from:**
```css
--color-blue: #C3E4FF;
--color-yellow: #F9DE78;
--color-green: #C7ECBB;
--color-pink: #F7CEEE;
--color-orange: #FCD8A0;
--color-purple: #E8C9FF;
```

**Change to:**
```css
--color-blue: #20a9ff;
--color-yellow: #f5a824;
--color-green: #44a024;
--color-pink: #ff279e;
--color-orange: #ff5c26;
--color-purple: #ba27ff;
```

#### 2. Restore White Text CSS Rules in `src/styles/global.css`

**Location**: Lines 345-371 (currently commented out)

**Uncomment the CSS rules:**
```css
/* White text for space-button with colored thread backgrounds */
/* Match buttons with linear-gradient containing thread color variables */
.space-button[style*="--color-blue"]:not([style*="var(--color-gradient-gray)"]):not([style*="var(--color-paper)"]),
.space-button[style*="--color-yellow"]:not([style*="var(--color-gradient-gray)"]):not([style*="var(--color-paper)"]),
.space-button[style*="--color-green"]:not([style*="var(--color-gradient-gray)"]):not([style*="var(--color-paper)"]),
.space-button[style*="--color-pink"]:not([style*="var(--color-gradient-gray)"]):not([style*="var(--color-paper)"]),
.space-button[style*="--color-orange"]:not([style*="var(--color-gradient-gray)"]):not([style*="var(--color-paper)"]),
.space-button[style*="--color-purple"]:not([style*="var(--color-gradient-gray)"]):not([style*="var(--color-paper)"]) {
  color: white !important;
}

.space-button[style*="--color-blue"]:not([style*="var(--color-gradient-gray)"]):not([style*="var(--color-paper)"]) span,
.space-button[style*="--color-yellow"]:not([style*="var(--color-gradient-gray)"]):not([style*="var(--color-paper)"]) span,
.space-button[style*="--color-green"]:not([style*="var(--color-gradient-gray)"]):not([style*="var(--color-paper)"]) span,
.space-button[style*="--color-pink"]:not([style*="var(--color-gradient-gray)"]):not([style*="var(--color-paper)"]) span,
.space-button[style*="--color-orange"]:not([style*="var(--color-gradient-gray)"]):not([style*="var(--color-paper)"]) span,
.space-button[style*="--color-purple"]:not([style*="var(--color-gradient-gray)"]):not([style*="var(--color-paper)"]) span,
.space-button[style*="--color-blue"]:not([style*="var(--color-gradient-gray)"]):not([style*="var(--color-paper)"]) *,
.space-button[style*="--color-yellow"]:not([style*="var(--color-gradient-gray)"]):not([style*="var(--color-paper)"]) *,
.space-button[style*="--color-green"]:not([style*="var(--color-gradient-gray)"]):not([style*="var(--color-paper)"]) *,
.space-button[style*="--color-pink"]:not([style*="var(--color-gradient-gray)"]):not([style*="var(--color-paper)"]) *,
.space-button[style*="--color-orange"]:not([style*="var(--color-gradient-gray)"]):not([style*="var(--color-paper)"]) *,
.space-button[style*="--color-purple"]:not([style*="var(--color-gradient-gray)"]):not([style*="var(--color-paper)"]) * {
  color: white !important;
}
```

**Remove the comment block wrapper** and restore the original comment.

#### 3. Update `getThreadTextColorCSS()` in `src/utils/colors.ts`

**Location**: Lines 31-37

**Change from:**
```typescript
// Get appropriate text color for thread color backgrounds
// Returns dark grey for all thread colors (pastel colors need dark text)
// Returns dark grey for paper color
export function getThreadTextColorCSS(color: ThreadColor | string | null | undefined): string {
  // All thread colors use dark text (pastel colors)
  return "var(--color-deep-grey)";
}
```

**Change to:**
```typescript
// Get appropriate text color for thread color backgrounds
// Returns white for thread colors (blue, yellow, green, pink, orange, purple)
// Returns dark grey for paper color
export function getThreadTextColorCSS(color: ThreadColor | string | null | undefined): string {
  if (!color || color === "paper") {
    return "var(--color-deep-grey)";
  }
  
  // All other thread colors should have white text
  return "white";
}
```

#### 4. Update `getTextColor()` in `src/components/SpaceButton.astro`

**Location**: Lines 38-43

**Change from:**
```typescript
// Determine text color based on background
// Pastel colors use dark text for visibility
function getTextColor(gradient: string, active: boolean): string {
    // All thread colors use dark text (pastel colors)
    return "var(--color-deep-grey)";
}
```

**Change to:**
```typescript
// Determine text color based on background
// Only use white text when active AND background is colored
function getTextColor(gradient: string, active: boolean): string {
    if (active && isColoredBackground(gradient)) {
        return "white";
    }
    return "var(--color-deep-grey)";
}
```

#### 5. Update `getTextColor()` in `public/scripts/navigation/persistent-navigation.js`

**Location**: Lines 127-132

**Change from:**
```javascript
// Determine text color based on background
// Pastel colors use dark text for visibility
function getTextColor(gradient) {
  // All thread colors use dark text (pastel colors)
  return 'var(--color-deep-grey)';
}
```

**Change to:**
```javascript
// Determine text color based on background
function getTextColor(gradient) {
  return isColoredBackground(gradient) ? 'white' : 'var(--color-deep-grey)';
}
```

#### 6. Update Close Icon Color in `public/scripts/navigation/persistent-navigation.js`

**Location**: Lines 206-207

**Change from:**
```javascript
// Determine close icon color - pastel colors use dark text
const closeIconColor = 'var(--color-deep-grey)';
```

**Change to:**
```javascript
// Determine close icon color - white only when active AND background is colored
const closeIconColor = (isCurrentPage && isColoredBackground(backgroundGradient))
  ? 'white'
  : 'var(--color-deep-grey)';
```

#### 7. Update Close Icon Color in `src/components/react/navigation/SpaceButton.tsx`

**Location**: Lines 115-116

**Change from:**
```typescript
// Determine close icon color - pastel colors use dark text
const closeIconColor = 'var(--color-deep-grey)';
```

**Change to:**
```typescript
// Determine close icon color - white only when active AND background is colored
const closeIconColor = (isActive && isColoredBackground(backgroundGradient)) 
  ? 'white' 
  : 'var(--color-deep-grey)';
```

### To Switch from Vibrant to Pastel Colors

Reverse all the above steps:

1. Update color variables in `src/styles/global.css` to pastel values
2. Comment out white text CSS rules in `src/styles/global.css`
3. Update `getThreadTextColorCSS()` to return dark grey for all colors
4. Update `getTextColor()` functions to return dark grey
5. Update close icon color logic to use dark grey

## Files That Need Updates

### Core Color Definitions
- ✅ `src/styles/global.css` - Color variables and CSS rules
- ✅ `src/utils/colors.ts` - `getThreadTextColorCSS()` utility function

### Component Text Color Logic
- ✅ `src/components/SpaceButton.astro` - `getTextColor()` function
- ✅ `src/components/react/navigation/SpaceButton.tsx` - Close icon color
- ✅ `public/scripts/navigation/persistent-navigation.js` - `getTextColor()` and close icon color

### Components That Auto-Update (via `getThreadTextColorCSS()`)

These components automatically use the correct text color based on `getThreadTextColorCSS()`:

- `src/components/EditNameColorPanel.astro`
- `src/components/NewThreadPanel.astro`
- `src/components/CardStack.astro`
- `src/components/Avatar.astro`
- `src/components/react/NewThreadPanel.tsx`
- `src/components/react/navigation/Avatar.tsx`
- `src/components/react/EditNameColorPanel.tsx`
- `src/components/react/EditThreadPanel.tsx`

**No changes needed** - These will automatically use the correct text color from `getThreadTextColorCSS()`.

## Color Comparison

### Visual Comparison

**Pastel Colors** (Light, soft):
- Blue: Light sky blue (`#C3E4FF`)
- Yellow: Soft golden (`#F9DE78`)
- Green: Mint green (`#C7ECBB`)
- Pink: Soft rose (`#F7CEEE`)
- Orange: Peach (`#FCD8A0`)
- Purple: Lavender (`#E8C9FF`)

**Vibrant Colors** (Bold, saturated):
- Blue: Bright cyan (`#20a9ff`)
- Yellow: Golden yellow (`#f5a824`)
- Green: Forest green (`#44a024`)
- Pink: Magenta (`#ff279e`)
- Orange: Bright orange (`#ff5c26`)
- Purple: Deep purple (`#ba27ff`)

## Design Rationale

### Pastel Colors (Current Choice)
- **Pros**: 
  - Softer, more calming aesthetic; better for extended reading sessions
  - **Better text focus**: Light backgrounds allow users to focus better on the content/text
  - **Primary action prominence**: With softer backgrounds, primary action buttons (like "Add" buttons) stand out more prominently as the main interactive elements
  - Reduced visual noise lets content be the hero
- **Cons**: Less vibrant, may be less attention-grabbing for thread colors themselves
- **Text**: Dark grey for optimal readability on light backgrounds
- **User Experience**: Creates a more focused, content-first reading experience

### Vibrant Colors
- **Pros**: High contrast, attention-grabbing, modern look
- **Cons**: 
  - Can be visually overwhelming, may cause eye strain
  - Thread colors compete with primary actions for attention
  - Can distract from content focus
- **Text**: White for optimal contrast on dark/saturated backgrounds

## Testing Checklist

When switching color systems, verify:

- [ ] All thread color buttons display correct colors
- [ ] Text is readable on all colored backgrounds
- [ ] Navigation buttons show correct text color
- [ ] Close icons are visible on colored backgrounds
- [ ] Color selection panels show correct preview colors
- [ ] Avatar components show correct text color
- [ ] Card components display colors correctly
- [ ] Mobile navigation displays correctly

## Notes

- The color system affects thread colors only, not the base UI colors (paper, grey, etc.)
- All changes are backward-compatible with the existing component structure
- The `getThreadTextColorCSS()` utility ensures consistent text color across all components
- CSS rules in `global.css` provide fallback for components that don't use the utility function

---

**Last Updated**: January 2025  
**Current System**: Pastel Colors with Dark Text

