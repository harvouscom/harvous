# Harvous Design Updates

This document tracks all design improvements and updates needed across the Harvous application to maintain consistency and improve user experience.

## Pending Updates

### Edit Thread Panel Implementation
**Status**: ❌ Failed Attempt  
**Date**: Jan 26, 2025  
**Priority**: HIGH  
**Issue**: "Edit Thread" menu option exists but has no functionality

**Problem**:
- Users cannot edit thread names, colors, or properties
- Menu option exists but clicking it does nothing
- Missing Edit Thread Panel component
- Missing API endpoint for thread updates
- Delete actions don't show toast notifications

**Attempted Solution**:
- Created `EditThreadPanel.tsx` and `ConfirmationDialog.tsx` components
- Added complex event handling between Astro, Alpine.js, and React
- Over-engineered solution that didn't follow existing patterns
- All changes reverted due to complexity and unreliability

**Next Steps**:
1. Study existing `EditNameColorPanel.tsx` pattern
2. Create simple Edit Thread Panel following existing patterns
3. Implement incrementally with testing at each step
4. Use existing event system instead of creating new ones
5. Focus on making it work first, then making it pretty

**Documentation**: See `EDIT_THREAD_ATTEMPT.md` for detailed analysis

## Completed Updates

### Icon Button Redesign (NoteDetailsPanel)
**Status**: ✅ Completed  
**Date**: Current  
**Files**: `src/components/react/AddToSection.tsx`, `src/components/react/NoteDetailsPanel.tsx`

**Changes Made**:
- Replaced text-based "Add" and "Remove" buttons with icon-only buttons
- Used plus (+) and minus (−) SVG icons
- Applied stone gray color (`--color-stone-grey`) for consistency
- Increased button size to 32px (w-8 h-8) with 20px icons (w-5 h-5)
- Maintained simple opacity transition on hover
- Removed excessive animations for cleaner UX

**Design Rationale**:
- Icons are more intuitive than text labels
- Stone gray provides subtle, non-distracting appearance
- Larger size improves accessibility and click targets
- Simple hover effects maintain focus on content

## Pending Design Updates

### Components Needing Harvous Design Treatment
**Status**: 🔴 HIGH PRIORITY  
**Priority**: Design polish for V1 release  
**Estimated Time**: 3-4 days total

These React components were functionally implemented but haven't received the full "Harvous design treatment" yet. They currently use generic Tailwind classes instead of Harvous CSS variables and design patterns.

#### 1. AddToSection.tsx
**Location**: `src/components/react/AddToSection.tsx`  
**Used In**: NoteDetailsPanel (thread management interface)

**Current Issues**:
- Generic Tailwind classes: `border-gray-200`, `hover:bg-gray-50`, `text-gray-500`, `text-gray-700`, `text-gray-900`
- Container: `bg-white` instead of Harvous surface colors
- Missing Harvous shadow patterns
- Generic hover states don't match Harvous design system

**Required Changes**:
- Replace `bg-white` → `bg-[var(--color-snow-white)]`
- Replace `border-gray-200` → `border-[var(--color-gray)]`
- Replace `text-gray-*` → Harvous text color variables
- Replace `hover:bg-gray-50` → Custom hover state using Harvous colors
- Apply Harvous shadow patterns
- Lines to update: 72, 84-95, 121, 122, 137, 153, 163

#### 2. ThreadCombobox.tsx
**Location**: `src/components/react/ThreadCombobox.tsx`  
**Used In**: NewNotePanel (thread selection dropdown)

**Current Issues**:
- Dropdown: `bg-white`, `border-gray-200`, `shadow-lg`
- Search input: Generic `border-gray-200` with `focus:ring-blue-500` (should use Harvous colors)
- Dropdown items: `hover:bg-gray-50` instead of Harvous hover states
- Empty state: `text-gray-500`

**Required Changes**:
- Update dropdown container (line 62): Use Harvous surface colors and shadows
- Update search input (line 70): Use Harvous colors and match SearchInput pattern
- Update dropdown items (line 87): Use Harvous hover states
- Update empty state (line 108): Use Harvous text colors

#### 3. MobileNavigation.tsx (Dropdown Menu)
**Location**: `src/components/react/navigation/MobileNavigation.tsx`  
**Used In**: Mobile navigation dropdown

**Current Issues**:
- Dropdown menu: `bg-white`, `border-gray-200`, `shadow-lg` (line 227)
- Dividers: `border-gray-200` (multiple lines: 256, 377, 416, 446)
- Disabled button: `hover:bg-gray-50`, `opacity-60` (line 448)

**Required Changes**:
- Update dropdown container to use Harvous surface colors
- Replace all dividers with Harvous border colors
- Update disabled button states to match Harvous patterns

#### 4. NoteDetailsPanel.tsx
**Location**: `src/components/react/NoteDetailsPanel.tsx`  
**Status**: 🟡 MEDIUM PRIORITY

**Current Issues**:
- Modal dialogs: `bg-white`, `shadow-lg`, `text-gray-900`, `text-gray-600`, `bg-gray-100` (line 333)
- Empty states: `text-gray-500`, `bg-gray-100` (lines 470, 477, 548)
- Buttons: `bg-gray-100`, `hover:bg-gray-200` (lines 343, 586)
- Coming soon section: Multiple generic gray colors (lines 529-540)

**Required Changes**:
- Replace modal dialog styling with Harvous colors
- Replace generic buttons with `ButtonSmall` component
- Update all empty states to use Harvous text colors
- Update coming soon section colors

#### Implementation Plan
**Week 2.5: Design Polish Sprint (3-4 days)**
- **Day 1**: AddToSection.tsx & ThreadCombobox.tsx
- **Day 2**: MobileNavigation.tsx dropdown
- **Day 3**: NoteDetailsPanel.tsx polish
- **Day 4**: Final review & consistency check

**Finding Generic Tailwind Classes**:
```bash
grep -r "border-gray\|bg-gray\|text-gray\|shadow-lg" src/components/react --include="*.tsx"
```

**Common Replacements**:
- `bg-white` → `bg-[var(--color-snow-white)]`
- `bg-gray-50` → `bg-[var(--color-fog-white)]`
- `border-gray-200` → `border-[var(--color-gray)]`
- `text-gray-500` → `text-[var(--color-pebble-grey)]`
- `text-gray-700` → `text-[var(--color-stone-grey)]`
- `text-gray-900` → `text-[var(--color-deep-grey)]`
- `shadow-lg` → Custom Harvous shadow pattern
- `hover:bg-gray-50` → Custom hover state with Harvous colors

### Note Types Design
**Status**: ⚠️ BLOCKED - Waiting for Design Specifications  
**Priority**: HIGH - Blocking V1 Note Types Foundation completion  
**Date**: January 26, 2025  
**Reference**: `NOTE_TYPES_DESIGN_PENDING.md`

**Current Implementation Status**:
- ✅ Database schema supports note types (`noteType` column exists)
- ✅ API integration handles noteType validation and storage
- ✅ Icon cycling system implemented (temporarily disabled)
- ✅ Type-specific validation rules
- ✅ Form submission handles type-specific data

**Current Layout (Temporary)**:
- **Default Notes**: Title input + content editor ✅ **ACTIVE**
- **Scripture Notes**: Reference input + content editor - **DISABLED**
- **Resource Notes**: URL input + content editor - **DISABLED**

**Current Status**:
- Note type switching is DISABLED until designs are ready
- Users can only create default notes
- Note type icons are visible but non-functional (opacity-50)
- Code is ready to re-enable when designs are complete

**Design Work Needed**:

1. **Scripture Note Design**
   - **Current**: Simple reference input + content editor
   - **Needed**: Specialized layout for scripture study workflow
   - **Considerations**:
     - Scripture reference formatting
     - Bible verse display
     - Study notes organization
     - Cross-reference capabilities

2. **Resource Note Design**
   - **Current**: Simple URL input + content editor
   - **Needed**: Specialized layout for resource capture and organization
   - **Considerations**:
     - URL preview/validation
     - Resource metadata capture
     - Media attachment support
     - Source attribution

3. **Default Note Design**
   - **Current**: Title + content editor (working well)
   - **Status**: May need minor refinements based on other types

**User Feedback**: "hmmm ill come back to this later with designs for each note type for the new note panel of each type"

**Next Steps (When Designs Ready)**:
1. Re-enable functionality: Change `{false && noteType === 'scripture' && (` back to `{noteType === 'scripture' && (`
2. Restore click handlers: Add back `onClick={cycleNoteType}` to note type icons
3. Update `cycleNoteType()`: Restore proper note type cycling functionality
4. Layout Implementation: Implement specialized layouts based on designs
5. Testing: Test each note type workflow
6. Integration: Ensure seamless switching between types

**Files to Update**:
- `src/components/react/NewNotePanel.tsx` - Main component with type-specific layouts
- Potentially new components for specialized layouts

**Impact on V1 Timeline**:
- Week 2: Note Types Foundation - **BLOCKED** waiting for design specifications
- Week 3: Selected Text Feature - Can proceed in parallel
- Week 4: Polish & Launch - May be affected if note types design takes longer

### Thread Combobox Redesign
**Status**: 🔄 Part of Components Needing Design Treatment (above)

### Color System Consistency
**Status**: 📋 Planned (Part of Components Needing Design Treatment)

### Typography Improvements
**Status**: 📋 Planned

**Areas to Review**:
- Consistent font sizing across components
- Proper text hierarchy in cards and panels
- Readability improvements for long content
- Mobile typography scaling

### Component Spacing & Layout
**Status**: 📋 Planned

**Focus Areas**:
- Consistent padding and margins
- Proper spacing in card layouts
- Mobile-responsive spacing adjustments
- Grid and flex layouts optimization

### Interactive States
**Status**: 📋 Planned

**Improvements Needed**:
- Standardize hover effects across all interactive elements
- Consistent focus states for accessibility
- Loading states for async operations
- Error state styling

### Mobile Experience
**Status**: 📋 Planned

**Areas to Improve**:
- Touch target sizes (minimum 44px)
- Mobile navigation optimization
- Responsive card layouts
- Mobile-specific interactions

## Design System Guidelines

### Color Palette
```css
/* Surface Colors */
--color-snow-white: #FAFAFA      /* Primary backgrounds */
--color-fog-white: #F7F7F6      /* Subtle backgrounds */
--color-paper: #EBE7DB          /* Alternative background */

/* Text Colors */
--color-deep-grey: #4A473D      /* Primary text, headings */
--color-stone-grey: #78766F     /* Secondary text, icons */
--color-pebble-grey: #888680    /* Tertiary text, disabled states */

/* Action Colors */
--color-bold-blue: #006EFF      /* Primary actions */
--color-navy: #0048A6           /* Active/pressed states */
--color-red: #E4062E            /* Destructive actions */

/* Border & Divider Colors */
--color-gray: #E9E9E9           /* Borders and dividers */

/* Shadows */
--shadow-small: inset 0px -3px 0px rgba(120, 118, 111, 0.2);
```

### Button Sizes
- **Large buttons**: 60px height (Button.astro)
- **Medium buttons**: 40px height (ButtonSmall.astro)
- **Icon buttons**: 32px (w-8 h-8) for better accessibility
- **Square buttons**: 40px (SquareButton.astro)

### Animation Guidelines
- **Duration**: 200ms for most transitions
- **Easing**: ease-in-out for smooth feel
- **Hover effects**: Subtle scale (1.002) and opacity changes
- **Avoid**: Excessive rotations, complex morphing

### Icon Standards
- **Size**: 20px (w-5 h-5) for standard icons
- **Color**: Use `--color-stone-grey` for secondary actions
- **Style**: Simple, clean SVG icons
- **Accessibility**: Minimum 32px click targets

## Implementation Notes

### CSS Variables Usage
Always use Harvous CSS variables instead of hardcoded colors:
```css
/* ✅ Good */
color: var(--color-stone-grey);
background-color: var(--color-blue);

/* ❌ Avoid */
color: #78766F;
background-color: #006EFF;
```

### Component Consistency
- Use existing component patterns (Button.astro, SquareButton.astro)
- Maintain consistent spacing with Tailwind classes
- Follow Harvous's rounded corner standards (rounded-xl, rounded-3xl)
- Apply proper shadow patterns for depth

### Accessibility Requirements
- Minimum 44px touch targets for mobile
- Proper focus states for keyboard navigation
- Sufficient color contrast ratios
- Clear visual hierarchy

## Future Considerations

### Design System Expansion
- Consider creating a design tokens file
- Standardize component variants
- Create reusable animation utilities
- Develop mobile-first responsive patterns

### User Experience Improvements
- Micro-interactions for better feedback
- Progressive disclosure patterns
- Contextual help and tooltips
- Performance-optimized animations

---

**Last Updated**: January 2025  
**Next Review**: After Design Polish Sprint completion (Week 2.5)
