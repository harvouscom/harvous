# Profile Update Persistence Issue - Analysis & Attempted Solutions

## Problem Summary

**Issue**: Profile updates (first name, last name, user color) work temporarily but don't persist across page refreshes in production. Changes appear to save but revert back after a few seconds.

**Status**: ❌ **UNRESOLVED** - Multiple approaches attempted, issue persists

## Root Cause Analysis

The core issue is a **data synchronization conflict** between:
1. **Clerk** (authentication service) - stores user data
2. **Local Database** (Astro DB) - caches user data
3. **Client-side state** - React components and UI

### The Conflict Cycle

1. User updates profile → Data saves to Clerk ✅
2. Page refreshes → `getCachedUserData()` overwrites database with Clerk data ❌
3. Database contains stale/conflicting data → Profile reverts ❌

## Attempted Solutions

### Solution 1: Clerk Metadata Approach (Original Plan)
**Goal**: Use Clerk's `public_metadata` for custom fields, database as cache only

**Implementation**:
- Modified `src/pages/api/user/update-profile.ts` to store `userColor` in Clerk's `public_metadata`
- Updated `src/utils/user-cache.ts` to read from Clerk's `public_metadata`
- Added 5-minute cache freshness check

**Result**: ❌ **FAILED** - Still reverting, cache invalidation not working properly

### Solution 2: Cache Invalidation Approach
**Goal**: Invalidate cache after profile updates to force fresh Clerk fetch

**Implementation**:
- Set `clerkDataUpdatedAt` to epoch time after profile updates
- Force cache miss on next page load
- Simplified cache logic

**Result**: ❌ **FAILED** - Cache invalidation race conditions, still reverting

### Solution 3: Always Fetch from Clerk (Simplified)
**Goal**: Remove cache complexity, always fetch fresh data from Clerk

**Implementation**:
- Removed all cache freshness checks
- Always fetch from Clerk on every page load
- Database used only for caching, never as source of truth

**Result**: ❌ **FAILED** - Still reverting, fundamental issue persists

## Technical Details

### Files Modified

#### `src/pages/api/user/update-profile.ts`
```typescript
// Current implementation stores in Clerk's public_metadata
const clerkResponse = await fetch(`https://api.clerk.com/v1/users/${userId}`, {
  method: 'PATCH',
  headers: {
    'Authorization': `Bearer ${clerkSecretKey}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    first_name: firstName,
    last_name: lastName,
    public_metadata: {
      userColor: color
    }
  })
});
```

#### `src/utils/user-cache.ts`
```typescript
// Current implementation always fetches from Clerk
console.log('User cache - fetching from Clerk (always fresh)');
const userData = await response.json();

// Extract from Clerk's public_metadata
const userColor = userData?.public_metadata?.userColor || 'paper';
```

### Development vs Production Behavior

**Development (localhost)**:
- ✅ Profile updates work correctly
- ✅ Changes persist across page refreshes
- ✅ Avatar updates work

**Production**:
- ❌ Profile updates appear to save but revert
- ❌ Changes don't persist across page refreshes
- ❌ Avatar updates inconsistent

## Debugging Evidence

### Terminal Logs Analysis
```
User cache - userMetadata: {
  firstName: 'ProductionTest',
  lastName: 'User',
  userColor: 'paper',
  clerkDataUpdatedAt: 2025-10-20T01:36:56.046Z
}
User cache - using database as source of truth
```

**Key Observations**:
1. Cache is still showing "using database as source of truth" instead of fetching from Clerk
2. Multiple dev servers running simultaneously causing conflicts
3. Changes not being applied to running development server

### Build Process Issues
- Multiple `astro dev` processes running on different ports (4321, 4322, 4323, etc.)
- Changes not being picked up by running development server
- Cache invalidation logic not executing properly

## Potential Root Causes (Unresolved)

### 1. Development Server Conflicts
- Multiple dev servers running simultaneously
- Changes not being applied to active server
- Port conflicts causing inconsistent behavior

### 2. Clerk API Integration Issues
- `public_metadata` not being properly stored/retrieved
- Clerk API rate limiting or caching
- Authentication token issues in production

### 3. Database Synchronization Race Conditions
- Database updates happening before Clerk updates complete
- Concurrent requests causing data conflicts
- Transaction isolation issues

### 4. Client-Side State Management
- React component state not syncing with server state
- View Transitions causing state conflicts
- Event listener attachment issues

## Next Steps (For Future Investigation)

### Immediate Actions Needed
1. **Kill all development servers** and start fresh
2. **Verify Clerk API integration** - check if `public_metadata` is actually being stored
3. **Add comprehensive logging** to trace the exact data flow
4. **Test in production environment** with proper debugging

### Investigation Areas
1. **Clerk Dashboard Verification** - Check if custom metadata is visible in Clerk dashboard
2. **Network Request Analysis** - Verify API calls are reaching Clerk successfully
3. **Database State Inspection** - Check actual database contents after updates
4. **Client-Side Debugging** - Add browser console logging to trace state changes

### Alternative Approaches to Consider
1. **Remove database caching entirely** - Always fetch from Clerk
2. **Use Clerk's webhooks** - Listen for user updates from Clerk
3. **Implement optimistic updates** - Update UI immediately, sync in background
4. **Switch to different data storage** - Use Clerk's private metadata or external database

## Files Created/Modified

### New Files
- `PROFILE_UPDATE_ISSUE_ANALYSIS.md` (this file)

### Modified Files
- `src/pages/api/user/update-profile.ts` - Clerk metadata integration
- `src/utils/user-cache.ts` - Cache logic and Clerk fetching
- `src/components/react/EditNameColorPanel.tsx` - Always load fresh data
- `src/pages/profile.astro` - Event handling and page refresh
- `public/scripts/avatar-manager-global.js` - Avatar update system

### Deleted Files
- Multiple avatar manager files (consolidated into single approach)

## Conclusion

Despite multiple attempts using different approaches (Clerk metadata, cache invalidation, always-fetch-from-Clerk), the profile update persistence issue remains unresolved. The problem appears to be deeper than initially thought, potentially involving:

1. **Development environment conflicts** (multiple servers)
2. **Clerk API integration issues** (metadata not persisting)
3. **Fundamental architecture problems** (conflicting data sources)

**Recommendation**: This issue requires a fresh investigation with proper debugging tools and a clean development environment to identify the true root cause.

---

**Last Updated**: October 20, 2025  
**Status**: ❌ Unresolved  
**Priority**: High (affects core user functionality)
