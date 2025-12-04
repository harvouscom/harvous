# Component CSS Migration Plan

## Overview
Migrating from Tailwind CSS to vanilla CSS following 37signals' #nobuild patterns.

## Current Status (Dec 4, 2025)

### ✅ Foundation Complete
- `colors.css` - OKLCH color system with semantic variables
- `spacing.css` - ch/rem based spacing tokens
- `typography.css` - Font system
- `utilities.css` - ~700 lines of Tailwind utility replacements
- `buttons.css` - Button variants
- `cards.css` - Card components
- `forms.css` - Form elements
- `navigation.css` - Nav components
- `panels.css` - Panel/bottom-sheet structure

### 📊 Files Needing Migration (by Tailwind class count)

#### React Components (Priority Order)
| File | Count | Status |
|------|-------|--------|
| NewThreadPanel.tsx | 36 | 🔄 Partial |
| NoteDetailsPanel.tsx | 32 | 🔄 Partial |
| NewSpacePanel.tsx | 27 | 🔄 Partial |
| MyChurchPanel.tsx | 27 | ⏳ Pending |
| InboxItemPreviewPanel.tsx | 27 | ⏳ Pending |
| EditThreadPanel.tsx | 27 | 🔄 Partial |
| EditSpacePanel.tsx | 22 | 🔄 Partial |
| AddToSpaceSection.tsx | 20 | ⏳ Pending |
| AddToSection.tsx | 17 | ⏳ Pending |
| EmailPasswordPanel.tsx | 16 | ⏳ Pending |
| BottomSheet.tsx | 15 | ⏳ Pending |
| MySpacesPanel.tsx | 13 | ⏳ Pending |
| InboxItemPreview.tsx | 13 | ⏳ Pending |
| MyDataPanel.tsx | 12 | ⏳ Pending |
| EditNameColorPanel.tsx | 12 | ⏳ Pending |
| CardFullEditable.tsx | 12 | ⏳ Pending |

#### Astro Components
| File | Count | Status |
|------|-------|--------|
| CardNote.astro | 19 | ⏳ Pending |
| CardImageLink.astro | 11 | ⏳ Pending |
| SpaceButton.astro | 9 | ⏳ Pending |
| DashboardSkeleton.astro | 9 | ⏳ Pending |
| CardThread.astro | 9 | ⏳ Pending |
| Layout.astro | 8 | ⏳ Pending |
| CardFull.astro | 7 | ⏳ Pending |

## Common Patterns to Extract

### 1. Primary Button (Blue CTA)
Used in: NewThreadPanel, InboxItemPreviewPanel, NoteDetailsPanel, etc.
```css
.btn-primary-lg {
  /* Full blue button with inset shadow effect */
}
```

### 2. Space Button (Gray Gradient)
Used in: NewThreadPanel, AddToSpaceSection, etc.
```css
.space-btn-lg {
  /* Gray gradient button with 64px height */
}
```

### 3. Form Panel Card
Used in: NewNotePanel, CardFullEditable
```css
.form-card {
  /* White card with shadow, rounded corners */
}
```

### 4. Thread Color Header
Used in: CardStack, InboxItemPreviewPanel
```css
.thread-header {
  /* Colored header section */
}
```

### 5. Dialog/Modal
Used in: NewThreadPanel (unsaved dialog), NoteDetailsPanel (delete confirm)
```css
.modal-overlay { }
.modal-dialog { }
```

## Migration Strategy

### Phase 1: Add Missing Utilities
Add any utilities still needed in `utilities.css`:
- `flex` and `hidden` display classes
- Additional spacing values
- Missing arbitrary values

### Phase 2: Create Semantic Classes
Extract repeated patterns into semantic CSS:
- `.btn-primary-lg` for main CTAs
- `.form-card` for editable cards
- `.dialog-*` for modals

### Phase 3: Migrate Components (Batch 1)
Focus on highest-usage components first:
1. NewThreadPanel.tsx
2. NoteDetailsPanel.tsx
3. InboxItemPreviewPanel.tsx
4. MyChurchPanel.tsx

### Phase 4: Migrate Components (Batch 2)
Continue with medium-usage:
5. EditThreadPanel.tsx
6. NewSpacePanel.tsx
7. EditSpacePanel.tsx
8. AddToSpaceSection.tsx

### Phase 5: Migrate Astro Components
9. CardNote.astro
10. CardThread.astro
11. Layout.astro

### Phase 6: Cleanup
- Remove Tailwind from `astro.config.mjs`
- Remove Tailwind dependencies from `package.json`
- Simplify `cn()` function
- Enable CSS Layers

## Notes
- Keep Tailwind running until ALL components migrated
- Test each component after migration
- Commit after each successful batch

