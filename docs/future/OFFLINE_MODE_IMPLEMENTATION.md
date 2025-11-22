# Offline Mode Implementation Guide

## Overview

This document outlines the complete architecture and implementation plan for full offline mode support in Harvous. This includes offline reading AND writing capabilities, with data synchronization when connectivity is restored.

**Status**: Post-V1 feature - Enhanced caching (24-hour TTL + pre-caching) is implemented in V1. Full offline mode with write support is planned for future release.

---

## Current State Assessment

### What We Have (V1 Enhanced Caching)

✅ **Service Worker with Caching**
- 24-hour cache TTL for user data (pages and API responses)
- Cache-first strategy for navigation routes
- Background cache refresh
- Offline fallback to cached dashboard

✅ **Pre-Caching System**
- Pre-caches 50 recent notes/threads on login
- Caches individual note/thread/space pages
- Caches API responses for offline access
- Non-blocking, uses idle time

✅ **Basic Offline Reading**
- Users can read cached content offline
- Cached dashboard available when offline
- Navigation API cached for 24 hours

### What's Missing for Full Offline Mode

❌ **Client-Side Database**
- No IndexedDB for structured data storage
- No offline-first data layer
- Data only available via service worker cache

❌ **Offline Write Support**
- Cannot create/edit notes offline
- Cannot create/edit threads offline
- Changes are lost if made offline

❌ **Sync Queue System**
- No queue for offline mutations
- No background sync when connectivity restored
- No conflict resolution

❌ **Offline UI Indicators**
- No visual indicator when offline
- No sync status display
- No conflict resolution UI

---

## Architecture Options

### Option 1: Dexie.js (Recommended)

**Technology**: Dexie.js wrapper around IndexedDB

**Pros:**
- Simple, clean API
- Excellent TypeScript support
- Good performance
- Active maintenance
- Easy to learn and use

**Cons:**
- Additional dependency (~50KB)
- Still need to build sync logic

**Implementation Complexity**: Medium

**Best For**: Most use cases, recommended starting point

### Option 2: Workbox Background Sync

**Technology**: Workbox library with Background Sync API

**Pros:**
- Built into service worker
- Automatic retry on connectivity
- Good for simple sync scenarios

**Cons:**
- Less control over sync logic
- Harder to implement conflict resolution
- Limited to service worker context
- May not work on all browsers

**Implementation Complexity**: Medium-High

**Best For**: Simple sync scenarios without complex conflict resolution

### Option 3: Custom IndexedDB + Sync Manager

**Technology**: Native IndexedDB API + custom sync layer

**Pros:**
- Full control over implementation
- No external dependencies
- Can optimize for specific use cases

**Cons:**
- More code to write and maintain
- Need to handle all edge cases
- IndexedDB API is verbose

**Implementation Complexity**: High

**Best For**: When you need maximum control or have specific requirements

---

## Recommended Architecture: Dexie.js + Custom Sync

### Data Layer Design

```typescript
// src/utils/offline-db.ts
import Dexie, { Table } from 'dexie';

interface OfflineNote {
  id: string;
  title: string;
  content: string;
  threadId: string;
  spaceId: string | null;
  simpleNoteId: number;
  noteType: 'default' | 'scripture' | 'resource';
  syncStatus: 'synced' | 'pending' | 'conflict';
  lastModified: number;
  serverVersion?: number; // For conflict detection
  createdAt: Date;
  updatedAt: Date;
}

interface OfflineThread {
  id: string;
  title: string;
  subtitle: string | null;
  color: string;
  spaceId: string | null;
  syncStatus: 'synced' | 'pending' | 'conflict';
  lastModified: number;
  serverVersion?: number;
  createdAt: Date;
  updatedAt: Date;
}

interface OfflineSpace {
  id: string;
  title: string;
  color: string;
  isPublic: boolean;
  syncStatus: 'synced' | 'pending' | 'conflict';
  lastModified: number;
  serverVersion?: number;
  createdAt: Date;
  updatedAt: Date;
}

interface SyncOperation {
  id?: number;
  operation: 'create' | 'update' | 'delete';
  entityType: 'note' | 'thread' | 'space';
  entityId: string;
  data: any;
  timestamp: number;
  retryCount: number;
  lastError?: string;
}

class OfflineDatabase extends Dexie {
  notes!: Table<OfflineNote>;
  threads!: Table<OfflineThread>;
  spaces!: Table<OfflineSpace>;
  syncQueue!: Table<SyncOperation>;

  constructor() {
    super('HarvousOfflineDB');
    this.version(1).stores({
      notes: 'id, threadId, spaceId, syncStatus, lastModified',
      threads: 'id, spaceId, syncStatus, lastModified',
      spaces: 'id, syncStatus, lastModified',
      syncQueue: '++id, operation, entityType, entityId, timestamp'
    });
  }
}

export const offlineDB = new OfflineDatabase();
```

### Data Access Layer

```typescript
// src/utils/offline-data-layer.ts

/**
 * Create note offline - saves to IndexedDB and queues for sync
 */
export async function createNoteOffline(noteData: CreateNoteData): Promise<string> {
  // 1. Generate local ID
  const localId = `local_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  // 2. Save to IndexedDB
  await offlineDB.notes.add({
    ...noteData,
    id: localId,
    syncStatus: 'pending',
    lastModified: Date.now(),
    createdAt: new Date(),
    updatedAt: new Date()
  });
  
  // 3. Queue sync operation
  await offlineDB.syncQueue.add({
    operation: 'create',
    entityType: 'note',
    entityId: localId,
    data: noteData,
    timestamp: Date.now(),
    retryCount: 0
  });
  
  // 4. Try immediate sync if online
  if (navigator.onLine) {
    syncPendingOperations();
  }
  
  return localId;
}

/**
 * Update note offline
 */
export async function updateNoteOffline(noteId: string, updates: Partial<NoteData>): Promise<void> {
  const note = await offlineDB.notes.get(noteId);
  if (!note) throw new Error('Note not found');
  
  // Update in IndexedDB
  await offlineDB.notes.update(noteId, {
    ...updates,
    syncStatus: 'pending',
    lastModified: Date.now(),
    updatedAt: new Date()
  });
  
  // Queue sync operation
  await offlineDB.syncQueue.add({
    operation: 'update',
    entityType: 'note',
    entityId: noteId,
    data: updates,
    timestamp: Date.now(),
    retryCount: 0
  });
  
  // Try immediate sync if online
  if (navigator.onLine) {
    syncPendingOperations();
  }
}

/**
 * Get notes from offline database
 */
export async function getNotesOffline(filters?: {
  threadId?: string;
  spaceId?: string;
  limit?: number;
}): Promise<OfflineNote[]> {
  let query = offlineDB.notes.toCollection();
  
  if (filters?.threadId) {
    query = query.filter(note => note.threadId === filters.threadId);
  }
  
  if (filters?.spaceId !== undefined) {
    query = query.filter(note => note.spaceId === filters.spaceId);
  }
  
  const notes = await query.sortBy('lastModified');
  
  if (filters?.limit) {
    return notes.slice(0, filters.limit);
  }
  
  return notes;
}
```

### Sync Queue System

```typescript
// src/utils/sync-manager.ts

/**
 * Sync pending operations to server
 */
export async function syncPendingOperations(): Promise<SyncResult> {
  if (!navigator.onLine) {
    return { success: false, error: 'Offline' };
  }
  
  const pendingOps = await offlineDB.syncQueue
    .where('retryCount')
    .below(5) // Max 5 retries
    .toArray();
  
  const results: SyncResult[] = [];
  
  for (const op of pendingOps) {
    try {
      let response: Response;
      
      switch (op.operation) {
        case 'create':
          response = await fetch(`/api/${op.entityType}s/create`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(op.data),
            credentials: 'include'
          });
          break;
          
        case 'update':
          response = await fetch(`/api/${op.entityType}s/${op.entityId}/update`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(op.data),
            credentials: 'include'
          });
          break;
          
        case 'delete':
          response = await fetch(`/api/${op.entityType}s/${op.entityId}/delete`, {
            method: 'POST',
            credentials: 'include'
          });
          break;
      }
      
      if (response.ok) {
        const serverData = await response.json();
        
        // Update local record with server ID and mark as synced
        await offlineDB[`${op.entityType}s` as keyof OfflineDatabase].update(op.entityId, {
          id: serverData.id, // Replace local ID with server ID
          syncStatus: 'synced',
          serverVersion: serverData.version || Date.now()
        });
        
        // Remove from sync queue
        await offlineDB.syncQueue.delete(op.id!);
        
        results.push({ success: true, operationId: op.id! });
      } else {
        // Increment retry count
        await offlineDB.syncQueue.update(op.id!, {
          retryCount: op.retryCount + 1,
          lastError: await response.text()
        });
        
        results.push({ success: false, error: `HTTP ${response.status}` });
      }
    } catch (error) {
      // Network error - increment retry count
      await offlineDB.syncQueue.update(op.id!, {
        retryCount: op.retryCount + 1,
        lastError: error instanceof Error ? error.message : String(error)
      });
      
      results.push({ success: false, error: error instanceof Error ? error.message : String(error) });
    }
  }
  
  return {
    success: results.every(r => r.success),
    results
  };
}

/**
 * Background sync - runs periodically when online
 */
export function startBackgroundSync(intervalMs: number = 30000): void {
  if (!navigator.onLine) return;
  
  const syncInterval = setInterval(async () => {
    if (navigator.onLine) {
      await syncPendingOperations();
    } else {
      clearInterval(syncInterval);
    }
  }, intervalMs);
  
  // Also sync on online event
  window.addEventListener('online', () => {
    syncPendingOperations();
    startBackgroundSync(intervalMs);
  });
}
```

---

## Conflict Resolution Strategies

### Scenario 1: Last-Write-Wins (Simplest)

**How it works:**
- When syncing, compare `lastModified` timestamps
- Server version wins if server timestamp is newer
- Client version wins if client timestamp is newer

**Pros:**
- Simple to implement
- No user interaction needed
- Fast resolution

**Cons:**
- Can lose data if user edited offline
- No merging of changes

**Best For**: MVP, simple use cases

### Scenario 2: Timestamp-Based Merging (Medium Complexity)

**How it works:**
- Compare field-level timestamps
- Merge non-conflicting fields automatically
- Flag conflicting fields for user resolution

**Pros:**
- Preserves more data
- Automatic for non-conflicts
- Better user experience

**Cons:**
- More complex implementation
- Requires field-level versioning
- Still needs user input for conflicts

**Best For**: Production-ready solution

### Scenario 3: Operational Transforms (Complex)

**How it works:**
- Track operations (insert, delete, update) not just final state
- Transform operations to resolve conflicts
- Automatic resolution for most cases

**Pros:**
- Most sophisticated
- Handles complex conflicts well
- Used by Google Docs, etc.

**Cons:**
- Very complex to implement
- Overkill for most use cases
- Significant development time

**Best For**: Real-time collaboration features (future)

---

## UI/UX Considerations

### 1. Offline Indicator Component

```typescript
// src/components/react/OfflineIndicator.tsx

export default function OfflineIndicator() {
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  
  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    // Check pending sync count
    const checkPending = async () => {
      const count = await offlineDB.syncQueue.count();
      setPendingSyncCount(count);
    };
    checkPending();
    const interval = setInterval(checkPending, 5000);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(interval);
    };
  }, []);
  
  if (!isOffline && pendingSyncCount === 0) return null;
  
  return (
    <div className="offline-indicator">
      {isOffline ? (
        <div className="offline-banner">
          <Icon name="wifi-off" />
          <span>You're offline. Changes will sync when you reconnect.</span>
        </div>
      ) : (
        <div className="sync-status">
          <Icon name="sync" className="spinning" />
          <span>Syncing {pendingSyncCount} changes...</span>
        </div>
      )}
    </div>
  );
}
```

### 2. Sync Status Badge

```typescript
// Show in navigation or header
<SyncStatusBadge>
  {pendingCount > 0 && (
    <Badge variant="warning">
      {pendingCount} pending
    </Badge>
  )}
  {conflictCount > 0 && (
    <Badge variant="error">
      {conflictCount} conflicts
    </Badge>
  )}
</SyncStatusBadge>
```

### 3. Conflict Resolution UI

```typescript
// src/components/react/ConflictResolver.tsx

export default function ConflictResolver({ conflict }: { conflict: Conflict }) {
  return (
    <Modal>
      <h3>Conflict detected for "{conflict.entityType}"</h3>
      <div className="conflict-comparison">
        <div className="local-version">
          <h4>Your version (offline)</h4>
          <pre>{JSON.stringify(conflict.localData, null, 2)}</pre>
        </div>
        <div className="server-version">
          <h4>Server version</h4>
          <pre>{JSON.stringify(conflict.serverData, null, 2)}</pre>
        </div>
      </div>
      <div className="conflict-actions">
        <button onClick={useLocal}>Use my version</button>
        <button onClick={useServer}>Use server version</button>
        <button onClick={merge}>Merge both</button>
      </div>
    </Modal>
  );
}
```

### 4. Progressive Enhancement

**Graceful Degradation:**
- App works fully offline
- Server features disabled with clear messaging
- Auto-tagging: "Will be applied when synced"
- XP: "Will be calculated on sync"
- Scripture detection: "Available when online"

---

## Implementation Phases

### Phase 1: Foundation (Week 1)

**Tasks:**
1. Install Dexie.js: `npm install dexie`
2. Set up IndexedDB schema
3. Create offline data models matching server schema
4. Implement basic CRUD operations in IndexedDB
5. Add offline detection utilities

**Deliverables:**
- `src/utils/offline-db.ts` - Database setup
- `src/utils/offline-data-layer.ts` - Data access layer
- Basic offline read support

### Phase 2: Data Layer (Week 2)

**Tasks:**
1. Build offline-first data access layer
2. Implement sync queue system
3. Create sync manager for background operations
4. Add conflict detection (basic last-write-wins)
5. Test sync with various scenarios

**Deliverables:**
- `src/utils/sync-manager.ts` - Sync logic
- `src/utils/offline-data-layer.ts` - Complete implementation
- Basic conflict resolution

### Phase 3: UI Integration (Week 3)

**Tasks:**
1. Add offline indicator component
2. Update create/edit flows to use offline layer
3. Add sync status UI
4. Implement offline search
5. Add conflict resolution UI

**Deliverables:**
- `src/components/react/OfflineIndicator.tsx`
- `src/components/react/ConflictResolver.tsx`
- Updated note/thread creation flows
- Sync status display

### Phase 4: Polish & Testing (Week 4)

**Tasks:**
1. Handle edge cases (quota exceeded, etc.)
2. Add sync conflict resolution UI
3. Test on various devices/browsers
4. Performance optimization
5. Documentation and user guides

**Deliverables:**
- Complete offline mode
- Error handling
- Performance optimizations
- User documentation

---

## Storage Limits & Data Pruning

### IndexedDB Limits

- **Desktop**: ~50% of disk space (usually 100s of MB to GB)
- **Mobile**: Varies by device, typically 50-200MB
- **Safari iOS**: More restrictive, ~50MB default

### Data Pruning Strategy

```typescript
// Prune old data to stay within limits
export async function pruneOldData(maxAge: number = 90 * 24 * 60 * 60 * 1000): Promise<void> {
  const cutoffDate = Date.now() - maxAge;
  
  // Delete old synced notes (keep pending)
  await offlineDB.notes
    .where('syncStatus')
    .equals('synced')
    .and(note => note.lastModified < cutoffDate)
    .delete();
  
  // Delete old synced threads
  await offlineDB.threads
    .where('syncStatus')
    .equals('synced')
    .and(thread => thread.lastModified < cutoffDate)
    .delete();
  
  // Delete old synced spaces
  await offlineDB.spaces
    .where('syncStatus')
    .equals('synced')
    .and(space => space.lastModified < cutoffDate)
    .delete();
}
```

### Quota Management

```typescript
// Check and handle quota exceeded
export async function checkQuota(): Promise<{ available: boolean; estimate?: number }> {
  if (!('storage' in navigator && 'estimate' in navigator.storage)) {
    return { available: true };
  }
  
  try {
    const estimate = await navigator.storage.estimate();
    const usagePercent = (estimate.usage || 0) / (estimate.quota || 1);
    
    if (usagePercent > 0.9) {
      // Prune old data
      await pruneOldData();
      return { available: true, estimate: usagePercent };
    }
    
    return { available: true, estimate: usagePercent };
  } catch (error) {
    console.error('Quota check failed:', error);
    return { available: true };
  }
}
```

---

## Testing Considerations

### Test Scenarios

1. **Offline Creation**
   - Create note offline
   - Verify saved to IndexedDB
   - Verify queued for sync
   - Go online, verify sync

2. **Offline Editing**
   - Edit note offline
   - Make multiple edits
   - Go online, verify all changes sync

3. **Conflict Resolution**
   - Edit note offline
   - Edit same note on another device
   - Sync both, verify conflict detected
   - Resolve conflict, verify resolution

4. **Network Interruption**
   - Start sync
   - Interrupt network mid-sync
   - Verify partial sync handled correctly
   - Resume network, verify remaining syncs

5. **Storage Limits**
   - Fill IndexedDB
   - Verify pruning works
   - Verify new data can still be saved

6. **Multi-Device Sync**
   - Create note on device A offline
   - Create note on device B offline
   - Sync both devices
   - Verify no conflicts for different notes
   - Verify both notes appear on both devices

### Browser Testing

- **Chrome/Edge**: Full support
- **Firefox**: Full support
- **Safari iOS**: Limited IndexedDB quota, test carefully
- **Safari macOS**: Full support
- **Mobile browsers**: Test on actual devices

---

## Migration Strategy

### From Enhanced Caching to Full Offline Mode

1. **Phase 1**: Keep existing service worker caching
2. **Phase 2**: Add IndexedDB alongside cache
3. **Phase 3**: Migrate data access to offline-first
4. **Phase 4**: Remove redundant service worker caching (or keep for fallback)

### Data Migration

```typescript
// Migrate cached data to IndexedDB on first load
export async function migrateCacheToIndexedDB(): Promise<void> {
  if (sessionStorage.getItem('migrated-to-indexeddb')) {
    return; // Already migrated
  }
  
  // Fetch recent notes from cache or API
  const notes = await fetch('/api/notes/recent?limit=50').then(r => r.json());
  
  // Store in IndexedDB
  for (const note of notes) {
    await offlineDB.notes.put({
      ...note,
      syncStatus: 'synced',
      lastModified: new Date(note.updatedAt).getTime()
    });
  }
  
  sessionStorage.setItem('migrated-to-indexeddb', 'true');
}
```

---

## Performance Considerations

### Indexing Strategy

- Index frequently queried fields: `threadId`, `spaceId`, `syncStatus`
- Index for sorting: `lastModified`, `createdAt`
- Avoid over-indexing (slows writes)

### Batch Operations

- Batch sync operations when possible
- Use transactions for multiple writes
- Debounce rapid updates

### Memory Management

- Limit number of items loaded at once
- Use pagination for large lists
- Clear unused data from memory

---

## Security Considerations

### Data Encryption

- Consider encrypting sensitive content in IndexedDB
- Use Web Crypto API for client-side encryption
- Store encryption keys securely (not in IndexedDB)

### Sync Security

- Verify authentication before syncing
- Validate data on server side
- Handle expired sessions gracefully

---

## Future Enhancements

### Real-Time Collaboration

- WebSocket support for live updates
- Operational transforms for conflict-free editing
- Presence indicators

### Advanced Sync

- Incremental sync (only changed data)
- Compression for large payloads
- Background sync API integration

### Offline Analytics

- Track offline usage patterns
- Measure sync success rates
- Identify common conflict scenarios

---

## Related Documentation

- **Enhanced Caching (V1)**: Current implementation with 24-hour cache
- **ARCHITECTURE.md**: Core app architecture
- **REACT_ISLANDS_STRATEGY.md**: Component architecture
- **PWA_INITIAL_LOAD_OPTIMIZATIONS.md**: Performance optimizations

---

## Summary

Full offline mode with write support is a significant feature that requires:

- **4 weeks** of development time
- **Dexie.js** for IndexedDB management
- **Custom sync layer** for conflict resolution
- **UI components** for offline indicators and conflict resolution
- **Thorough testing** across devices and scenarios

The enhanced caching implemented in V1 provides a solid foundation, allowing users to read cached content offline. Full offline mode will extend this to allow creating and editing content offline, with automatic synchronization when connectivity is restored.

**Recommended Approach**: Start with last-write-wins conflict resolution for MVP, then enhance to timestamp-based merging for production.

