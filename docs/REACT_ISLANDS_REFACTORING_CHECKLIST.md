# React Islands Refactoring Checklist

This document tracks components that need refactoring to follow React Islands best practices. See [REACT_ISLANDS_BEST_PRACTICES.md](./REACT_ISLANDS_BEST_PRACTICES.md) for guidelines.

## Priority: High - Data Fetching Violations

These components fetch data in React instead of receiving it as props from Astro. This violates the "Data Down" principle.

### 1. MySpacesPanel.tsx

**Current Issue:**
- Fetches spaces data in `useEffect` (lines 33-76)
- Makes API call to `/api/navigation/data` on mount
- No SSR benefits, slower initial render

**Location:** `src/components/react/MySpacesPanel.tsx`

**Refactoring Plan:**
1. ✅ Add `spaces` prop to component interface
2. ✅ Remove `fetchSpaces` function and `useEffect` data fetching
3. ✅ Update `profile.astro` to fetch spaces and pass as prop
4. ✅ Keep client-side refetch only for user-triggered refresh actions
5. ✅ Update any other pages that use this component

**Files to Modify:**
- `src/components/react/MySpacesPanel.tsx`
- `src/pages/profile.astro` (or wherever this component is used)

**Estimated Effort:** 1-2 hours

---

### 2. MyChurchPanel.tsx

**Current Issue:**
- Fetches profile data in `useEffect` (lines 79-125)
- Makes API call to `/api/user/get-profile` on mount
- Uses cache as fallback, but still fetches if cache missing

**Location:** `src/components/react/MyChurchPanel.tsx`

**Refactoring Plan:**
1. ✅ Add `churchData` prop to component interface (churchName, churchCity, churchState)
2. ✅ Remove `loadChurchData` function and `useEffect` data fetching
3. ✅ Update `profile.astro` to fetch church data and pass as prop
4. ✅ Keep cache check for optimistic updates, but don't fetch on mount
5. ✅ Update any other pages that use this component

**Files to Modify:**
- `src/components/react/MyChurchPanel.tsx`
- `src/pages/profile.astro` (or wherever this component is used)

**Estimated Effort:** 1-2 hours

---

### 3. NewThreadPanel.tsx

**Current Issue:**
- Fetches all notes in `useEffect` (lines 126-155)
- Makes API call to `/api/spaces/items` on mount (create mode only)
- Used for searching/adding notes to new threads

**Location:** `src/components/react/NewThreadPanel.tsx`

**Refactoring Plan:**
1. ✅ Add `initialNotes` prop to component interface (optional, for create mode)
2. ✅ Remove `fetchItems` function and `useEffect` data fetching
3. ✅ Determine which pages use this component and fetch notes there
4. ✅ Pass notes as prop from Astro page
5. ✅ Keep client-side fetching only for search/filter actions

**Files to Modify:**
- `src/components/react/NewThreadPanel.tsx`
- Pages that render NewThreadPanel (likely in Layout.astro or similar)

**Estimated Effort:** 2-3 hours (more complex, needs to find all usage)

---

## Priority: Medium - Hydration Directive Optimization

These components use `client:only="react"` but could potentially use better hydration strategies.

### Components Using `client:only="react"` - ✅ **COMPLETED**

**Optimized Components:**
- ✅ `src/components/MobileAdditional.astro` - MobileAdditional → `client:load`
- ✅ `src/components/BottomSheetReact.astro` - BottomSheet → `client:load`
- ✅ `src/components/NewSpacePanelReact.astro` - NewSpacePanel → `client:load`
- ✅ `src/components/MobileNavigation.astro` - MobileNavigation → `client:load`
- ✅ `src/components/SquareButton.astro` - SquareButton (2 instances) → `client:load`
- ✅ `src/components/EditSpacePanelReact.astro` - EditSpacePanel → `client:load`
- ✅ `src/components/EditNameColorPanelReact.astro` - EditNameColorPanel → `client:load`
- ✅ `src/components/MyDataPanelReact.astro` - MyDataPanel → `client:load`
- ✅ `src/components/NewNotePanelSimple.astro` - NewNotePanel → `client:load`
- ✅ `src/components/NoteDetailsPanelReact.astro` - NoteDetailsPanel → `client:load`
- ✅ `src/components/Drawer.astro` - Drawer → `client:load`
- ✅ `src/components/MyChurchPanelReact.astro` - MyChurchPanel → `client:load`
- ✅ `src/components/SearchInput.astro` - SearchInput → `client:load`
- ✅ `src/components/GetSupportPanelReact.astro` - GetSupportPanel → `client:load`
- ✅ `src/components/EmailPasswordPanelReact.astro` - EmailPasswordPanel → `client:load`

**Remaining (Justified):**
- ✅ `src/pages/find.astro` - RecentSearches → `client:idle` (uses localStorage on mount, non-critical feature)

**Refactoring Plan:**
1. ✅ Audit each component to determine if it needs browser APIs on initial render
2. ✅ Replace `client:only="react"` with `client:load` if SSR is possible
3. ✅ Replace with `client:visible` if component is below the fold
4. ✅ Replace with `client:idle` if component is non-critical
5. ✅ Keep `client:only` only when browser APIs are truly required

**Decision Criteria:**
- **Use `client:load`** if: Component is above fold, needs immediate interactivity, SSR is possible
- **Use `client:visible`** if: Component is below fold, can wait until scrolled into view
- **Use `client:idle`** if: Component is non-critical, can wait until browser is idle
- **Keep `client:only`** if: Component requires browser APIs (window, document, localStorage) on initial render

**Estimated Effort:** 3-4 hours (audit + refactoring)

---

## Priority: Low - Code Quality Improvements

### Components That Could Be Astro

These components might not need React at all - they could be converted to Astro.

**Needs Audit:**
- [ ] Review components in `src/components/react/` for static content
- [ ] Identify components with no `useState`, `useEffect`, or event handlers
- [ ] Convert static components to `.astro` files

**Estimated Effort:** 2-3 hours

---

## Refactoring Order

### Phase 1: Data Fetching (Week 1) ✅ **COMPLETED**
1. ✅ **MySpacesPanel** - Now accepts `initialSpaces` prop, fetches only if not provided
2. ✅ **MyChurchPanel** - Now accepts `initialChurchData` prop, fetches only if not provided
3. ✅ **NewThreadPanel** - Now accepts `initialNotes` prop, fetches only if not provided

### Phase 2: Hydration Optimization (Week 2) ✅ **COMPLETED**
1. ✅ Audit all `client:only="react"` components
2. ✅ Replace with appropriate directives (15 components optimized)
3. ✅ Test each change thoroughly

### Phase 3: Code Quality (Week 3)
1. Identify static components
2. Convert to Astro
3. Remove unnecessary React dependencies

---

## Testing Checklist

For each refactored component:

- [ ] Component renders correctly with props
- [ ] No console errors
- [ ] Works on desktop
- [ ] Works on mobile
- [ ] SSR works (check page source)
- [ ] No layout shift on hydration
- [ ] Performance improved (measure with Lighthouse)
- [ ] Existing functionality preserved

---

## Success Metrics

**Before Refactoring:**
- Components fetch data in React (no SSR)
- 20+ components use `client:only="react"`
- Slower initial page load

**After Refactoring:**
- All initial data fetched in Astro
- Appropriate hydration directives used
- Faster Time to Interactive
- Better SEO (SSR content)
- Improved Core Web Vitals

---

## Related Documentation

- [REACT_ISLANDS_BEST_PRACTICES.md](./REACT_ISLANDS_BEST_PRACTICES.md) - Best practices guide
- [REACT_ISLANDS_STRATEGY.md](./REACT_ISLANDS_STRATEGY.md) - Migration status
- [REFACTORING_PLAN.md](./REFACTORING_PLAN.md) - Overall refactoring plan

