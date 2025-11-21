# Performance Optimization Lessons Learned

This document captures the key lessons learned from optimizing navigation performance and fixing View Transitions slot update issues in the Harvous application.

## Overview

During a comprehensive performance optimization session, we identified and fixed several bottlenecks that were causing slow navigation and incomplete page loads. The optimizations focused on:

1. **Navigation Context Performance** - Reducing redundant timeouts and API calls
2. **React Component Loading Strategy** - Optimizing client directives
3. **Navigation Cache Strategy** - Better use of server-rendered data
4. **View Transitions Slot Updates** - Ensuring all Layout slots update correctly

## Key Performance Issues Identified

### 1. Excessive setTimeout Calls

**Problem:**
- NavigationContext had multiple redundant timeouts (50ms, 200ms, 500ms, 5s)
- Each timeout triggered navigation history refreshes and validations
- This caused unnecessary JavaScript execution and delayed operations

**Solution:**
- Removed all redundant timeouts
- Kept only immediate refresh on mount
- Used `requestIdleCallback` (with fallback) for non-critical validation
- Added debouncing to prevent multiple rapid calls

**Lesson Learned:**
> **Multiple timeouts are a code smell.** If you need multiple timeouts, you probably need a better strategy. Use `requestIdleCallback` for non-critical work, and debounce operations that might be called multiple times.

### 2. Aggressive Validation Strategy

**Problem:**
- `validateNavigationHistory` ran on every page load
- Made API calls even when validation wasn't needed
- No caching, causing redundant network requests

**Solution:**
- Added validation cache (1-minute duration)
- Only validate when necessary (after deletions, not every page load)
- Debounced validation to prevent multiple rapid calls
- Use cached thread IDs when available

**Lesson Learned:**
> **Cache validation results.** If you're validating the same data multiple times, cache the results. Only validate when data actually changes (after deletions, creations, etc.), not on every page load.

### 3. All Components Using client:load

**Problem:**
- Many non-critical components used `client:load` (loads immediately)
- This blocked initial render and increased Time to Interactive (TTI)
- Components below the fold loaded unnecessarily early

**Solution:**
- Changed analytics components to `client:idle` (PostHogUserInit)
- Changed below-the-fold components to `client:visible` (RecentSearches, CardFeat, ProfilePage)
- Kept only critical components (navigation, toast, keyboard shortcuts) as `client:load`

**Lesson Learned:**
> **Choose the right client directive for each component:**
> - `client:load` - Critical interactive components (navigation, auth, forms in view)
> - `client:visible` - Components below the fold (load when scrolled into view)
> - `client:idle` - Non-critical features (analytics, widgets) - load when browser is idle

### 4. Navigation Cache Strategy

**Problem:**
- Cache was refreshing too frequently (when >20 seconds old, even if still valid)
- Immediate refresh after init, even though server data was fresh
- Unnecessary API calls on every page load

**Solution:**
- Only refresh in background when cache is about to expire (within 5 seconds)
- Removed immediate refresh after init (server data is fresh)
- Better use of server-rendered data without unnecessary API calls

**Lesson Learned:**
> **Trust server-rendered data.** If you're rendering data on the server, don't immediately fetch it again on the client. Only refresh when the cache is truly stale or about to expire.

### 5. View Transitions Slot Updates

**Problem:**
- When navigating from `/new-space` to `/`, only the main column loaded
- Navigation column and other slots didn't appear until manual refresh
- View Transitions wasn't properly updating all Layout slots

**Solution:**
- Added `requestAnimationFrame` before navigation to ensure current page is fully rendered
- Added `astro:after-swap` handler to ensure React islands re-hydrate
- Enhanced NavigationColumn to listen for both `astro:page-load` and `astro:after-swap`
- Force re-render after View Transitions to ensure components update

**Lesson Learned:**
> **View Transitions require explicit handling for React islands.** React components in Astro islands need to:
> - Listen for both `astro:page-load` and `astro:after-swap` events
> - Force re-renders after View Transitions to ensure state updates
> - Use `requestAnimationFrame` before navigation to ensure proper timing

## Performance Optimization Patterns

### Pattern 1: Debouncing Event Handlers

**When to use:**
- Event handlers that might be called multiple times rapidly
- `astro:page-load` handlers that update state
- Validation or refresh operations

**Example:**
```javascript
let timeoutRef = null;
document.addEventListener('astro:page-load', () => {
  if (timeoutRef) clearTimeout(timeoutRef);
  timeoutRef = setTimeout(() => {
    // Your operation here
  }, 50);
});
```

### Pattern 2: Validation Caching

**When to use:**
- Validations that check against API data
- Operations that might run multiple times with the same data
- When validation results don't change frequently

**Example:**
```typescript
const validationCache = useRef<{ timestamp: number; data: any } | null>(null);
const CACHE_DURATION = 60 * 1000; // 1 minute

const validate = async (force = false) => {
  const now = Date.now();
  if (!force && validationCache.current && 
      (now - validationCache.current.timestamp) < CACHE_DURATION) {
    // Use cached data
    return;
  }
  // Fetch and cache fresh data
};
```

### Pattern 3: RequestIdleCallback for Non-Critical Work

**When to use:**
- Non-critical operations that don't need to run immediately
- Validations, background refreshes, analytics
- Operations that can wait until the browser is idle

**Example:**
```javascript
const scheduleWork = () => {
  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(() => {
      // Non-critical work here
    }, { timeout: 3000 });
  } else {
    setTimeout(() => {
      // Fallback for browsers without requestIdleCallback
    }, 2000);
  }
};
```

### Pattern 4: View Transitions React Island Re-hydration

**When to use:**
- React components that need to update after View Transitions
- Components that depend on URL or page state
- Navigation components that need to reflect current page

**Example:**
```typescript
useEffect(() => {
  const handlePageLoad = () => {
    // Update state based on new page
    setCurrentPath(window.location.pathname);
    // Force re-render to ensure component updates
    forceUpdate();
  };

  document.addEventListener('astro:page-load', handlePageLoad);
  document.addEventListener('astro:after-swap', handlePageLoad);
  
  return () => {
    document.removeEventListener('astro:page-load', handlePageLoad);
    document.removeEventListener('astro:after-swap', handlePageLoad);
  };
}, []);
```

### Pattern 5: Navigation Timing with requestAnimationFrame

**When to use:**
- Before triggering View Transitions navigation
- When you need to ensure current page is fully rendered
- To prevent race conditions with component cleanup

**Example:**
```javascript
window.addEventListener('closePanel', () => {
  requestAnimationFrame(() => {
    if (window.astroNavigate) {
      window.astroNavigate('/');
    }
  });
});
```

## Anti-Patterns to Avoid

### ❌ Multiple Redundant Timeouts

**Bad:**
```javascript
setTimeout(() => refresh(), 50);
setTimeout(() => refresh(), 200);
setTimeout(() => refresh(), 500);
```

**Good:**
```javascript
// Single immediate refresh, or debounced if needed
refresh();
// Or debounced:
debounce(refresh, 100);
```

### ❌ Validating on Every Page Load

**Bad:**
```javascript
useEffect(() => {
  validateNavigationHistory(); // Runs on every page load
}, []);
```

**Good:**
```javascript
useEffect(() => {
  // Only validate when necessary (after deletions, etc.)
  // Use cached results when available
  debouncedValidate();
}, []);
```

### ❌ client:load for Everything

**Bad:**
```astro
<AnalyticsComponent client:load />
<BelowFoldComponent client:load />
<NonCriticalWidget client:load />
```

**Good:**
```astro
<AnalyticsComponent client:idle />
<BelowFoldComponent client:visible />
<CriticalNavigation client:load />
```

### ❌ Immediate Cache Refresh After Init

**Bad:**
```javascript
initNavigationCache(data);
// Immediately refresh even though data is fresh
refreshNavigationCache();
```

**Good:**
```javascript
initNavigationCache(data);
// Don't refresh - server data is fresh
// Background refresh will happen automatically when cache expires
```

### ❌ Not Handling View Transitions for React Islands

**Bad:**
```typescript
useEffect(() => {
  // Only listens to initial load
  updateState();
}, []);
```

**Good:**
```typescript
useEffect(() => {
  const handleUpdate = () => updateState();
  
  // Handle both initial load and View Transitions
  document.addEventListener('astro:page-load', handleUpdate);
  document.addEventListener('astro:after-swap', handleUpdate);
  
  return () => {
    document.removeEventListener('astro:page-load', handleUpdate);
    document.removeEventListener('astro:after-swap', handleUpdate);
  };
}, []);
```

## Performance Metrics Improved

After implementing these optimizations:

- **Faster initial page load**: Reduced JavaScript execution on mount
- **Smoother navigation**: Fewer API calls and timeouts
- **Better perceived performance**: Critical components load first, non-critical load later
- **Reduced server load**: Fewer redundant API calls
- **Better mobile performance**: Less JavaScript blocking on slower devices

## Testing Checklist

When optimizing performance, always test:

1. ✅ **Initial page load** - All critical components appear
2. ✅ **Navigation between pages** - All slots update correctly
3. ✅ **View Transitions** - Smooth transitions, all content loads
4. ✅ **Mobile devices** - Performance on slower connections
5. ✅ **Console errors** - No new errors introduced
6. ✅ **Network tab** - Reduced API calls, proper caching
7. ✅ **React DevTools** - Components re-hydrate correctly

## Key Takeaways

1. **Remove redundant operations** - Multiple timeouts, validations, and refreshes are usually unnecessary
2. **Cache aggressively** - Cache validation results, API responses, and computed values
3. **Choose the right client directive** - Not everything needs `client:load`
4. **Trust server-rendered data** - Don't immediately refetch what the server already provided
5. **Handle View Transitions explicitly** - React islands need special handling for View Transitions
6. **Use browser APIs wisely** - `requestIdleCallback`, `requestAnimationFrame` for better timing
7. **Debounce operations** - Prevent multiple rapid calls to the same function

## Related Documentation

- `ARCHITECTURE.md` - Core functionality and View Transitions integration
- `REACT_ISLANDS_STRATEGY.md` - React islands patterns and best practices
- `REFACTORING_PLAN.md` - Component development guidelines
- `NAVIGATION_ISSUES_POST_MORTEM.md` - Previous navigation issues and solutions

## Future Optimization Opportunities

1. **Code splitting** - Further optimize bundle sizes
2. **Image optimization** - Lazy loading, responsive images
3. **Service Worker caching** - Better offline support and caching strategies
4. **Database query optimization** - Reduce query complexity, add indexes
5. **Component lazy loading** - More aggressive use of `client:visible` and `client:idle`

---

## Build Configuration Lessons (January 2025)

### Issue: Performance Optimizations Caused Build Failures

**Context:**
After implementing comprehensive performance optimizations (lazy loading, React.memo, bundle splitting), the build started failing with cryptic errors:
- `Cannot access 'ASTRO_VERSION' before initialization` (temporal dead zone error)
- `Uncaught ReferenceError: __DEFINES__ is not defined` (runtime error)

**Root Causes Identified:**

#### 1. Complex `manualChunks` Function Breaks Astro's Internal Bundling

**Problem:**
- Implemented a complex `manualChunks` function with route-based splitting
- Function included conditional logic for React, Tiptap, Clerk, Font Awesome, and route-based chunks
- This interfered with how Astro bundles its own internal code

**Error:**
```
Cannot access 'ASTRO_VERSION' before initialization
```

**Solution:**
- Reverted to simple `manualChunks` object: `{ editor: ['isomorphic-dompurify'] }`
- Removed all route-based and complex vendor splitting logic

**Lesson Learned:**
> **Be cautious with complex bundle splitting in Astro.** Astro's internal code needs to be bundled correctly, and overly complex `manualChunks` functions can interfere with how Astro bundles itself. Start simple and only add complexity if needed and tested.

#### 2. Vite `define` Section Conflicts with Astro's Environment Variables

**Problem:**
- Added a `define` section in `astro.config.mjs` to "fix MIME type issues"
- Included `_DEFINES_: JSON.stringify({})` and environment variable overrides
- This conflicted with Astro's internal environment variable handling

**Error:**
```
Uncaught ReferenceError: __DEFINES__ is not defined
at env.mjs:12:17
```

**Solution:**
- Removed the entire `define` section from `astro.config.mjs`
- Let Astro handle environment variables internally (it does this automatically)

**Lesson Learned:**
> **Don't override Astro's internal mechanisms.** Astro handles environment variables and defines automatically. Adding manual `define` overrides can break Astro's internal code that expects specific patterns. Only add `define` if you have a specific, tested need.

#### 3. When to Revert vs. Debug

**Problem:**
- Multiple build errors after performance optimizations
- Errors were cryptic and hard to debug
- Time spent debugging could have been better used

**Solution:**
- Reverted to a known working commit (`9f357da`)
- Selectively preserved improvements (toast styles) that didn't cause issues
- Documented what broke so we can avoid it in the future

**Lesson Learned:**
> **Sometimes reverting is the right call.** If optimizations introduce build-breaking errors and debugging is taking too long, revert to a working state. You can always re-implement optimizations more carefully later. It's better to have a working app than a broken one with great performance.

#### 4. Selective Preservation When Reverting

**What We Did:**
- Reverted all files to working commit `9f357da`
- Preserved toast style improvements from commit `48ee0ec` (min-width: 0, width: 75% for mobile)
- This gave us a working state with the improvements we wanted to keep

**Lesson Learned:**
> **Cherry-pick improvements when reverting.** Not all changes in a problematic commit are bad. When reverting, identify what works and preserve it. Use `git show <commit>:<file>` to extract specific changes.

### Build Configuration Best Practices

1. **Test builds after every optimization** - Run `npm run build` before committing
2. **Start simple with bundle splitting** - Use simple `manualChunks` objects before complex functions
3. **Don't override Astro internals** - Avoid `define` sections unless absolutely necessary
4. **Version compatibility matters** - Ensure Astro and adapter versions are compatible
5. **Keep optimizations incremental** - Make one optimization at a time, test, then move on

### What We Reverted

The following optimizations were reverted because they caused build errors:
- Complex `manualChunks` function with route-based splitting
- Vite `define` section for environment variables
- Lazy loading components (TiptapEditorLazy, etc.)
- React.memo optimizations
- Error Boundaries
- Performance monitoring utilities
- Hydration tracking hooks

**Note:** These optimizations may be re-implemented in the future, but with more careful testing and simpler approaches.

### What We Preserved

- Toast style improvements (mobile responsiveness)
- All other working functionality from the base commit

### Key Takeaway

> **Performance optimizations are great, but a working build is essential.** Always test builds after configuration changes, and be prepared to revert if optimizations break core functionality. It's better to have a slightly slower working app than a fast broken one.

