---
name: Navigation Performance Optimization
overview: Optimize navigation performance by implementing prefetching, reducing server-side work, optimizing React component loading, and improving View Transitions handling to make page navigation feel instant.
todos: []
---

# Navigation Performance Optimization Plan

## Problem Analysis

Navigation is slow when clicking navigation items, **especially on first-time navigation** (clicking a thread/space/note for the first time), because:

1. **No prefetching** - Pages are only fetched after click, so first-time navigation has no cache benefits
2. **Heavy server-side rendering** - Database queries run on every navigation, with no pre-computed data for first-time visits
3. **React hydration delays** - Multiple `client:load` components hydrate sequentially on first load
4. **NavigationContext overhead** - Validation and refresh logic runs on every page load, including first-time
5. **View Transitions module loading** - Dynamic import of `astro:transitions/client` adds delay on first navigation
6. **No optimistic UI** - Users wait for full page load before seeing feedback, making first-time navigation feel especially slow

## Optimization Strategy

### 1. Implement Link Prefetching

**Files**: `src/components/react/navigation/NavigationColumn.tsx`, `src/components/react/navigation/PersistentNavigation.tsx`, `src/components/react/navigation/MobileNavigation.tsx`

- Add `prefetch` attribute to navigation links using Astro's prefetch API
- Prefetch on hover/focus for desktop navigation items (threads, spaces, notes)
- Prefetch visible navigation items on mobile
- **Include "New Space" and "Find" buttons** - prefetch `/new-space` and `/find` routes on hover/focus
- Use `<link rel="prefetch">` for critical navigation paths (dashboard, new-space, find)

### 2. Optimize Server-Side Rendering

**Files**: `src/pages/[id].astro`, `src/pages/index.astro`

- Cache database query results more aggressively
- Reduce parallel queries where possible
- Use database indexes for common queries
- Consider streaming SSR for faster initial paint

### 3. Optimize React Component Loading

**Files**: `src/layouts/Layout.astro`, `src/components/NavigationColumnReact.astro`

- Review all `client:load` components - move non-critical to `client:visible` or `client:idle`
- Ensure NavigationColumn uses optimal loading strategy
- Consider code splitting for large components
- Lazy load DesktopPanelManager if not immediately visible

### 4. Improve NavigationContext Performance

**Files**: `src/components/react/navigation/NavigationContext.tsx`

- Reduce validation calls on navigation (only validate when needed)
- Cache validation results more aggressively
- Debounce navigation history updates
- Skip unnecessary refreshes when navigating between pages

### 5. Add Optimistic Navigation Feedback

**Files**: `src/components/react/navigation/NavigationColumn.tsx`, `src/components/react/navigation/PersistentNavigation.tsx`

- Show loading state immediately on click (all navigation links including New Space and Find)
- Use View Transitions loading states
- Add visual feedback (spinner, opacity change) during navigation
- Apply to all navigation buttons: threads, spaces, notes, dashboard, new-space, find, profile
- Optimize first-time navigation experience with immediate visual feedback

### 6. Optimize View Transitions

**Files**: `src/utils/safe-navigate.ts`, navigation components

- Ensure View Transitions are used consistently (not falling back to full page loads)
- Preload View Transitions module to avoid import delay
- Add transition animations that feel instant

### 7. Service Worker Caching

**Files**: `public/sw.js`

- Cache navigation API responses more aggressively
- Pre-cache likely next pages
- Use stale-while-revalidate for navigation data

## Implementation Priority

1. **High Impact, Low Effort**: Link prefetching, optimistic UI feedback
2. **High Impact, Medium Effort**: Optimize React component loading, NavigationContext performance
3. **Medium Impact, High Effort**: Server-side rendering optimization, Service Worker improvements

## Success Metrics

- Navigation click to content visible: < 200ms (currently likely 1-3 seconds)
- Time to Interactive after navigation: < 500ms
- Reduced server-side query time: 30-50% faster
- Better perceived performance with optimistic UI

