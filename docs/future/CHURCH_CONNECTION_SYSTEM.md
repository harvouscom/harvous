# Church Connection System Design

## Overview

This system allows users to set their church, churches to create Clerk Organizations, and automatically connects them when a church joins Harvous.

## User Flow

### 1. User Sets Their Church (Already Implemented ✅)
- User goes to Profile → My Church
- Enters: Church Name, City, State/Province, Country
- Stored in `UserMetadata` table

### 2. Church Creates Organization
- Church admin signs up for Harvous
- Creates a Clerk Organization
- Enters matching church info (name, city, state, country)
- System matches existing users and invites them

### 3. Automatic Connection
- System finds users with matching church info
- Sends invitation to join organization
- User accepts → becomes org member
- Church content automatically appears in their inbox

## Database Schema Updates

### New Tables

```typescript
// db/config.ts additions

// Churches table - tracks churches that have created organizations
const Churches = defineTable({
  columns: {
    id: column.text({ primaryKey: true }),
    orgId: column.text({ unique: true }), // Clerk organization ID
    churchName: column.text(),
    churchCity: column.text({ optional: true }),
    churchState: column.text({ optional: true }),
    churchCountry: column.text({ optional: true }),
    adminUserId: column.text(), // User who created the church org
    subscriptionTier: column.text({ optional: true }), // 'starter' | 'growth' | 'enterprise'
    isActive: column.boolean({ default: true }),
    createdAt: column.date(),
    updatedAt: column.date({ optional: true }),
  }
});

// Church connection requests - tracks pending connections
const ChurchConnectionRequests = defineTable({
  columns: {
    id: column.text({ primaryKey: true }),
    churchId: column.text(), // Reference to Churches
    userId: column.text(), // User who might be a member
    status: column.text(), // 'pending' | 'accepted' | 'declined' | 'auto_joined'
    matchedBy: column.text(), // 'name_city_state' | 'name_city' | 'name_only' | 'manual'
    createdAt: column.date(),
    respondedAt: column.date({ optional: true }),
  }
});
```

### Updated UserMetadata

```typescript
// Add to UserMetadata (already exists, just documenting usage)
const UserMetadata = defineTable({
  columns: {
    // ... existing fields ...
    churchName: column.text({ optional: true }), // ✅ Already exists
    churchCity: column.text({ optional: true }), // ✅ Already exists
    churchState: column.text({ optional: true }), // ✅ Already exists
    churchCountry: column.text({ optional: true }), // ✅ Already exists
    connectedChurchId: column.text({ optional: true }), // NEW: Reference to Churches table
    connectedOrgId: column.text({ optional: true }), // NEW: Clerk org ID (for quick lookup)
  }
});
```

## Matching Algorithm

### Matching Logic

When a church creates an organization, the system searches for matching users:

```typescript
// src/utils/church-matching.ts

export interface ChurchMatch {
  userId: string;
  matchScore: number; // 0-100, higher = better match
  matchType: 'exact' | 'high' | 'medium' | 'low';
  matchedFields: string[]; // Which fields matched
}

/**
 * Find users who might belong to this church
 */
export async function findMatchingUsers(
  churchName: string,
  churchCity?: string,
  churchState?: string,
  churchCountry?: string
): Promise<ChurchMatch[]> {
  const matches: ChurchMatch[] = [];
  
  // Get all users with church info
  const users = await db
    .select()
    .from(UserMetadata)
    .where(
      and(
        isNotNull(UserMetadata.churchName),
        // Don't include users already connected to a church
        or(
          isNull(UserMetadata.connectedChurchId),
          eq(UserMetadata.connectedChurchId, '')
        )
      )
    )
    .all();

  for (const user of users) {
    const match = calculateMatchScore(
      {
        name: churchName,
        city: churchCity,
        state: churchState,
        country: churchCountry
      },
      {
        name: user.churchName || '',
        city: user.churchCity || '',
        state: user.churchState || '',
        country: user.churchCountry || ''
      }
    );

    if (match.matchScore >= 50) { // Only include medium+ confidence matches
      matches.push({
        userId: user.userId,
        ...match
      });
    }
  }

  // Sort by match score (highest first)
  return matches.sort((a, b) => b.matchScore - a.matchScore);
}

/**
 * Calculate match score between church and user church info
 */
function calculateMatchScore(
  church: { name: string; city?: string; state?: string; country?: string },
  user: { name: string; city?: string; state?: string; country?: string }
): { matchScore: number; matchType: 'exact' | 'high' | 'medium' | 'low'; matchedFields: string[] } {
  const matchedFields: string[] = [];
  let score = 0;

  // Normalize strings for comparison
  const normalize = (str: string) => str.toLowerCase().trim();

  // Name match (required, 40 points)
  if (normalize(church.name) === normalize(user.name)) {
    score += 40;
    matchedFields.push('name');
  } else {
    // Partial name match (20 points)
    const churchWords = normalize(church.name).split(/\s+/);
    const userWords = normalize(user.name).split(/\s+/);
    const commonWords = churchWords.filter(w => userWords.includes(w));
    if (commonWords.length >= 2) {
      score += 20;
      matchedFields.push('name_partial');
    }
  }

  // City match (30 points)
  if (church.city && user.city && normalize(church.city) === normalize(user.city)) {
    score += 30;
    matchedFields.push('city');
  }

  // State match (20 points)
  if (church.state && user.state && normalize(church.state) === normalize(user.state)) {
    score += 20;
    matchedFields.push('state');
  }

  // Country match (10 points)
  if (church.country && user.country && normalize(church.country) === normalize(user.country)) {
    score += 10;
    matchedFields.push('country');
  }

  // Determine match type
  let matchType: 'exact' | 'high' | 'medium' | 'low';
  if (score >= 90) matchType = 'exact';
  else if (score >= 70) matchType = 'high';
  else if (score >= 50) matchType = 'medium';
  else matchType = 'low';

  return { matchScore: score, matchType, matchedFields };
}
```

## Implementation Flow

### 1. Church Creates Organization

```typescript
// src/pages/api/churches/create.ts
import type { APIRoute } from 'astro';
import { db, Churches, ChurchConnectionRequests, UserMetadata, eq, and } from 'astro:db';
import { findMatchingUsers } from '@/utils/church-matching';

export const POST: APIRoute = async ({ request, locals }) => {
  const { userId, orgId } = await locals.auth();
  
  if (!orgId) {
    return new Response(JSON.stringify({ 
      error: 'Organization ID required' 
    }), { status: 400 });
  }

  const { churchName, churchCity, churchState, churchCountry } = await request.json();

  // 1. Create church record
  const church = await db.insert(Churches).values({
    id: `church_${Date.now()}`,
    orgId,
    churchName,
    churchCity: churchCity || null,
    churchState: churchState || null,
    churchCountry: churchCountry || null,
    adminUserId: userId,
    isActive: true,
    createdAt: new Date()
  }).returning().get();

  // 2. Find matching users
  const matches = await findMatchingUsers(
    churchName,
    churchCity,
    churchState,
    churchCountry
  );

  // 3. Create connection requests for high-confidence matches
  const connectionRequests = matches
    .filter(m => m.matchType === 'exact' || m.matchType === 'high')
    .map(match => ({
      id: `connection_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      churchId: church.id,
      userId: match.userId,
      status: 'pending' as const,
      matchedBy: match.matchType === 'exact' ? 'name_city_state' : 'name_city',
      createdAt: new Date()
    }));

  if (connectionRequests.length > 0) {
    await db.insert(ChurchConnectionRequests).values(connectionRequests);
  }

  // 4. Auto-join exact matches (optional - or require user confirmation)
  // For now, we'll create pending requests and let users accept

  return new Response(JSON.stringify({ 
    success: true,
    churchId: church.id,
    matchesFound: matches.length,
    connectionRequestsCreated: connectionRequests.length
  }), { status: 200 });
};
```

### 2. User Accepts Connection

```typescript
// src/pages/api/churches/accept-connection.ts
import type { APIRoute } from 'astro';
import { db, ChurchConnectionRequests, Churches, UserMetadata, eq } from 'astro:db';

export const POST: APIRoute = async ({ request, locals }) => {
  const { userId } = await locals.auth();
  const { connectionRequestId } = await request.json();

  // Get connection request
  const request = await db
    .select()
    .from(ChurchConnectionRequests)
    .where(
      and(
        eq(ChurchConnectionRequests.id, connectionRequestId),
        eq(ChurchConnectionRequests.userId, userId),
        eq(ChurchConnectionRequests.status, 'pending')
      )
    )
    .get();

  if (!request) {
    return new Response(JSON.stringify({ 
      error: 'Connection request not found' 
    }), { status: 404 });
  }

  // Get church info
  const church = await db
    .select()
    .from(Churches)
    .where(eq(Churches.id, request.churchId))
    .get();

  if (!church) {
    return new Response(JSON.stringify({ 
      error: 'Church not found' 
    }), { status: 404 });
  }

  // Update connection request
  await db
    .update(ChurchConnectionRequests)
    .set({
      status: 'accepted',
      respondedAt: new Date()
    })
    .where(eq(ChurchConnectionRequests.id, connectionRequestId));

  // Update user metadata
  await db
    .update(UserMetadata)
    .set({
      connectedChurchId: church.id,
      connectedOrgId: church.orgId
    })
    .where(eq(UserMetadata.userId, userId));

  // Add user to Clerk organization (via Clerk API)
  const clerkSecretKey = import.meta.env.CLERK_SECRET_KEY;
  await fetch(`https://api.clerk.com/v1/organizations/${church.orgId}/memberships`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${clerkSecretKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      userId,
      role: 'org:member'
    })
  });

  return new Response(JSON.stringify({ 
    success: true,
    message: 'Connected to church successfully'
  }), { status: 200 });
};
```

### 3. Inbox Integration

When church pushes content, it automatically appears in connected members' inboxes:

```typescript
// src/utils/church-inbox.ts
import { db, Churches, UserMetadata, InboxItems, UserInboxItems, eq } from 'astro:db';

/**
 * Push church content to all connected members' inboxes
 */
export async function pushChurchContentToInbox(
  orgId: string,
  inboxItemId: string
): Promise<{ success: boolean; memberCount: number }> {
  // Get church
  const church = await db
    .select()
    .from(Churches)
    .where(eq(Churches.orgId, orgId))
    .get();

  if (!church) {
    throw new Error('Church not found');
  }

  // Get all users connected to this church
  const connectedUsers = await db
    .select()
    .from(UserMetadata)
    .where(eq(UserMetadata.connectedChurchId, church.id))
    .all();

  // Create UserInboxItems for each connected user
  const memberIds = connectedUsers.map(u => u.userId);
  
  const created = await Promise.all(
    memberIds.map(async (userId) => {
      // Check if already exists
      const existing = await db
        .select()
        .from(UserInboxItems)
        .where(
          and(
            eq(UserInboxItems.userId, userId),
            eq(UserInboxItems.inboxItemId, inboxItemId)
          )
        )
        .get();

      if (existing) {
        return null; // Already exists
      }

      return db.insert(UserInboxItems).values({
        id: `user_inbox_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        userId,
        inboxItemId,
        status: 'inbox',
        createdAt: new Date()
      });
    })
  );

  return {
    success: true,
    memberCount: created.filter(Boolean).length
  };
}
```

## User Experience

### For Users Who Set Their Church

1. **User sets church** in Profile → My Church
2. **Church joins Harvous** later
3. **User sees notification**: "First Baptist Church joined Harvous! Connect?"
4. **User clicks "Connect"** → Automatically added to org
5. **Church content appears** in their "For You" inbox automatically

### For Churches

1. **Church admin signs up** for Harvous
2. **Creates organization** with church info
3. **System finds matching users** automatically
4. **Sends connection requests** to high-confidence matches
5. **Users accept** → Become org members
6. **Church can push content** → Appears in all members' inboxes

## UI Components Needed

### 1. Church Connection Notification

```typescript
// src/components/react/ChurchConnectionNotification.tsx
// Shows when a church matching user's church info joins
```

### 2. Church Connection Request Panel

```typescript
// src/components/react/ChurchConnectionRequest.tsx
// Shows pending connection requests
```

### 3. Church Dashboard (for admins)

```typescript
// src/pages/church/[orgId]/dashboard.astro
// Church admin interface for managing content and members
```

## Benefits

✅ **Automatic Discovery**: Users don't need to search for their church
✅ **Seamless Connection**: One-click to connect
✅ **Content Delivery**: Church content automatically appears in inbox
✅ **Privacy**: Users control their connection
✅ **Scalable**: Works for churches of any size

## Future Enhancements

1. **Church Search**: Let users search for their church if not auto-matched
2. **Multiple Churches**: Support users who attend multiple churches
3. **Church Verification**: Verify churches are legitimate
4. **Church Directory**: Public directory of churches on Harvous
5. **Church Analytics**: Show churches how many members are connected

