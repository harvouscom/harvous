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

### Thread Combobox Redesign
**Status**: 🔄 In Progress  
**Reference**: `THREAD_COMBOBOX_REDESIGN.md`

**Planned Changes**:
- Improve search functionality in thread selection
- Better visual hierarchy for thread options
- Enhanced filtering and sorting capabilities
- Consistent styling with Harvous design system

### Color System Consistency
**Status**: 📋 Planned

**Issues to Address**:
- Replace any remaining hardcoded colors with CSS variables
- Ensure all interactive elements use Harvous color palette
- Standardize hover states across components
- Review and update button variants for consistency

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
--color-blue: #006EFF        /* Primary actions */
--color-red: #E4062E         /* Destructive actions */
--color-stone-grey: #78766F  /* Secondary actions, icons */
--color-deep-grey: #4A473D  /* Text, headings */
--color-pebble-grey: #888680 /* Subtle text, disabled states */
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

**Last Updated**: Current  
**Next Review**: After Thread Combobox completion
