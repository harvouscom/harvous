# Clerk Monetization Architecture

## Overview

This document outlines how to implement monetization using Clerk Organizations for churches and Clerk metadata for individual user add-ons.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    Clerk Platform                       │
├─────────────────────────────────────────────────────────┤
│  Individual Users          │    Organizations (Churches)│
│  ┌──────────────────────┐  │    ┌─────────────────────┐│
│  │ User Metadata         │  │    │ Org Metadata         ││
│  │ - addons: []          │  │    │ - subscription_tier   ││
│  │ - subscription_status │  │    │ - member_count     ││
│  └──────────────────────┘  │    │ - features: []       ││
│                             │    └─────────────────────┘│
│  ┌──────────────────────┐  │    ┌─────────────────────┐│
│  │ Roles & Permissions   │  │    │ Org Roles            ││
│  │ - user (default)     │  │    │ - admin              ││
│  │ - premium_user       │  │    │ - member             ││
│  └──────────────────────┘  │    └─────────────────────┘│
└─────────────────────────────────────────────────────────┘
```

## Part 1: Individual User Add-Ons

### Storage Strategy: Clerk Public Metadata

Store add-on subscriptions in Clerk's `public_metadata` for easy access:

```typescript
// User's public_metadata structure
{
  "subscription": {
    "status": "active" | "canceled" | "past_due",
    "addons": [
      {
        "id": "group_study_suite",
        "status": "active",
        "expiresAt": "2025-12-31T23:59:59Z",
        "purchasedAt": "2025-01-15T10:00:00Z"
      },
      {
        "id": "learning_courses",
        "status": "active",
        "expiresAt": "2025-12-31T23:59:59Z",
        "purchasedAt": "2025-01-15T10:00:00Z"
      }
    ],
    "stripeCustomerId": "cus_xxx",
    "stripeSubscriptionId": "sub_xxx"
  }
}
```

### Add-On Definitions

```typescript
// src/utils/subscriptions.ts
export const ADDONS = {
  GROUP_STUDY_SUITE: {
    id: 'group_study_suite',
    name: 'Group Study Suite',
    price: 12, // $12/month
    features: [
      'shared_spaces',
      'member_management',
      'group_activity_feed',
      'comments_discussions',
      'group_templates'
    ]
  },
  LEARNING_COURSES: {
    id: 'learning_courses',
    name: 'Learning & Courses',
    price: 10, // $10/month
    features: [
      'study_courses',
      'study_plan_builder',
      'reading_plans',
      'progress_tracking',
      'course_certificates',
      'template_marketplace'
    ]
  },
  ADVANCED_STUDY_TOOLS: {
    id: 'advanced_study_tools',
    name: 'Advanced Study Tools',
    price: 8, // $8/month
    features: [
      'multiple_translations',
      'cross_references',
      'commentary_integration',
      'original_languages',
      'scripture_analysis'
    ]
  }
} as const;

export type AddonId = keyof typeof ADDONS;
```

### Feature Checking Utility

```typescript
// src/utils/subscriptions.ts
import { getAuth } from '@clerk/astro/server';
import type { AstroGlobal } from 'astro';

export interface UserSubscription {
  status: 'active' | 'canceled' | 'past_due';
  addons: Array<{
    id: string;
    status: 'active' | 'expired';
    expiresAt: string;
    purchasedAt: string;
  }>;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
}

/**
 * Get user's subscription from Clerk metadata
 */
export async function getUserSubscription(
  userId: string
): Promise<UserSubscription | null> {
  const clerkSecretKey = import.meta.env.CLERK_SECRET_KEY;
  
  if (!clerkSecretKey) {
    throw new Error('Clerk secret key not found');
  }

  const response = await fetch(`https://api.clerk.com/v1/users/${userId}`, {
    headers: {
      'Authorization': `Bearer ${clerkSecretKey}`,
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    return null;
  }

  const user = await response.json();
  return user.public_metadata?.subscription || null;
}

/**
 * Check if user has a specific add-on
 */
export async function hasAddon(
  userId: string,
  addonId: string
): Promise<boolean> {
  const subscription = await getUserSubscription(userId);
  
  if (!subscription || subscription.status !== 'active') {
    return false;
  }

  const addon = subscription.addons.find(
    a => a.id === addonId && a.status === 'active'
  );

  if (!addon) {
    return false;
  }

  // Check if expired
  const expiresAt = new Date(addon.expiresAt);
  const now = new Date();
  
  return expiresAt > now;
}

/**
 * Check if user has access to a specific feature
 */
export async function hasFeature(
  userId: string,
  feature: string
): Promise<boolean> {
  const subscription = await getUserSubscription(userId);
  
  if (!subscription || subscription.status !== 'active') {
    return false;
  }

  // Check each active addon for the feature
  for (const addon of subscription.addons) {
    if (addon.status !== 'active') continue;
    
    const expiresAt = new Date(addon.expiresAt);
    if (expiresAt <= new Date()) continue;

    const addonDef = Object.values(ADDONS).find(a => a.id === addon.id);
    if (addonDef?.features.includes(feature)) {
      return true;
    }
  }

  return false;
}

/**
 * Get all active features for a user
 */
export async function getUserFeatures(userId: string): Promise<string[]> {
  const subscription = await getUserSubscription(userId);
  
  if (!subscription || subscription.status !== 'active') {
    return [];
  }

  const features: string[] = [];
  const now = new Date();

  for (const addon of subscription.addons) {
    if (addon.status !== 'active') continue;
    
    const expiresAt = new Date(addon.expiresAt);
    if (expiresAt <= now) continue;

    const addonDef = Object.values(ADDONS).find(a => a.id === addon.id);
    if (addonDef) {
      features.push(...addonDef.features);
    }
  }

  return [...new Set(features)]; // Remove duplicates
}
```

### Middleware for Feature Gating

```typescript
// src/middleware.ts (enhanced)
import { clerkMiddleware, createRouteMatcher } from '@clerk/astro/server';
import { hasFeature } from '@/utils/subscriptions';

// Define routes that require specific features
const featureProtectedRoutes = {
  '/groups': 'shared_spaces',
  '/courses': 'study_courses',
  '/advanced-study': 'multiple_translations'
};

export const onRequest = clerkMiddleware(async (context, next) => {
  const { userId } = context.locals.auth();
  
  // Check feature-protected routes
  const pathname = new URL(context.request.url).pathname;
  
  for (const [route, feature] of Object.entries(featureProtectedRoutes)) {
    if (pathname.startsWith(route)) {
      if (!userId) {
        return new Response('Unauthorized', { status: 401 });
      }
      
      const hasAccess = await hasFeature(userId, feature);
      if (!hasAccess) {
        // Redirect to upgrade page
        return Response.redirect(new URL('/upgrade', context.request.url));
      }
    }
  }
  
  return next();
});
```

## Part 2: Church Organizations (Clerk Organizations)

### Setup: Enable Organizations in Clerk

1. **Clerk Dashboard** → **Organizations** → Enable
2. **Settings**:
   - Allow users to create organizations: `true`
   - Max members per organization: Based on subscription tier
   - Required domains: Optional (for church email verification)

### Organization Metadata Structure

```typescript
// Organization's public_metadata structure
{
  "subscription": {
    "tier": "starter" | "growth" | "enterprise",
    "status": "active" | "canceled" | "past_due",
    "memberLimit": 100, // Based on tier
    "features": [
      "content_management",
      "push_to_inbox",
      "analytics",
      "group_targeting",
      "custom_branding"
    ],
    "stripeCustomerId": "cus_xxx",
    "stripeSubscriptionId": "sub_xxx",
    "churchInfo": {
      "name": "First Baptist Church",
      "city": "Austin",
      "state": "Texas",
      "country": "USA"
    }
  }
}
```

### Organization Roles

```typescript
// Clerk Organization Roles
export const ORG_ROLES = {
  ADMIN: 'org:admin',      // Church admin - full access
  MODERATOR: 'org:moderator', // Can create content, manage members
  MEMBER: 'org:member'     // Regular member - receives content
} as const;
```

### Church Subscription Tiers

```typescript
// src/utils/church-subscriptions.ts
export const CHURCH_TIERS = {
  STARTER: {
    id: 'starter',
    name: 'Starter',
    price: 75, // $75/month
    memberLimit: 100,
    contentPushesPerMonth: 10,
    features: [
      'content_management',
      'push_to_inbox',
      'basic_analytics',
      'standard_support'
    ]
  },
  GROWTH: {
    id: 'growth',
    name: 'Growth',
    price: 125, // $125/month
    memberLimit: 500,
    contentPushesPerMonth: -1, // Unlimited
    features: [
      'content_management',
      'push_to_inbox',
      'advanced_analytics',
      'group_targeting',
      'priority_support'
    ]
  },
  ENTERPRISE: {
    id: 'enterprise',
    name: 'Enterprise',
    price: 200, // $200/month
    memberLimit: -1, // Unlimited
    contentPushesPerMonth: -1, // Unlimited
    features: [
      'content_management',
      'push_to_inbox',
      'advanced_analytics',
      'group_targeting',
      'custom_branding',
      'api_access',
      'dedicated_support',
      'white_label'
    ]
  }
} as const;
```

### Organization Utilities

```typescript
// src/utils/organizations.ts
import { getAuth } from '@clerk/astro/server';

export interface ChurchSubscription {
  tier: 'starter' | 'growth' | 'enterprise';
  status: 'active' | 'canceled' | 'past_due';
  memberLimit: number;
  features: string[];
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  churchInfo?: {
    name: string;
    city?: string;
    state?: string;
    country?: string;
  };
}

/**
 * Get organization subscription from Clerk
 */
export async function getOrgSubscription(
  orgId: string
): Promise<ChurchSubscription | null> {
  const clerkSecretKey = import.meta.env.CLERK_SECRET_KEY;
  
  if (!clerkSecretKey) {
    throw new Error('Clerk secret key not found');
  }

  const response = await fetch(
    `https://api.clerk.com/v1/organizations/${orgId}`,
    {
      headers: {
        'Authorization': `Bearer ${clerkSecretKey}`,
        'Content-Type': 'application/json'
      }
    }
  );

  if (!response.ok) {
    return null;
  }

  const org = await response.json();
  return org.public_metadata?.subscription || null;
}

/**
 * Check if organization has a specific feature
 */
export async function orgHasFeature(
  orgId: string,
  feature: string
): Promise<boolean> {
  const subscription = await getOrgSubscription(orgId);
  
  if (!subscription || subscription.status !== 'active') {
    return false;
  }

  return subscription.features.includes(feature);
}

/**
 * Get user's organization membership
 */
export async function getUserOrganizations(userId: string) {
  const clerkSecretKey = import.meta.env.CLERK_SECRET_KEY;
  
  if (!clerkSecretKey) {
    throw new Error('Clerk secret key not found');
  }

  const response = await fetch(
    `https://api.clerk.com/v1/users/${userId}/organization_memberships`,
    {
      headers: {
        'Authorization': `Bearer ${clerkSecretKey}`,
        'Content-Type': 'application/json'
      }
    }
  );

  if (!response.ok) {
    return [];
  }

  const memberships = await response.json();
  return memberships.data || [];
}

/**
 * Check if user is admin of an organization
 */
export async function isOrgAdmin(
  userId: string,
  orgId: string
): Promise<boolean> {
  const memberships = await getUserOrganizations(userId);
  
  const membership = memberships.find(
    (m: any) => m.organization.id === orgId
  );

  return membership?.role === 'org:admin';
}
```

### Inbox Targeting with Organizations

```typescript
// src/utils/inbox-targeting.ts
import { db, InboxItems, UserInboxItems, eq, and } from 'astro:db';
import { getUserOrganizations } from './organizations';

/**
 * Push content to organization members' inboxes
 */
export async function pushToOrgInbox(
  orgId: string,
  inboxItemId: string
): Promise<{ success: boolean; memberCount: number }> {
  const clerkSecretKey = import.meta.env.CLERK_SECRET_KEY;
  
  if (!clerkSecretKey) {
    throw new Error('Clerk secret key not found');
  }

  // Get all organization members
  const response = await fetch(
    `https://api.clerk.com/v1/organizations/${orgId}/memberships`,
    {
      headers: {
        'Authorization': `Bearer ${clerkSecretKey}`,
        'Content-Type': 'application/json'
      }
    }
  );

  if (!response.ok) {
    throw new Error('Failed to fetch organization members');
  }

  const memberships = await response.json();
  const memberIds = memberships.data.map((m: any) => m.public_user_data.user_id);

  // Create UserInboxItems for each member
  const created = await Promise.all(
    memberIds.map(async (userId: string) => {
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
        return; // Already exists
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

## Part 3: Stripe Integration

### Stripe Webhook Handler

```typescript
// src/pages/api/stripe/webhook.ts
import { db } from 'astro:db';
import Stripe from 'stripe';

const stripe = new Stripe(import.meta.env.STRIPE_SECRET_KEY!);

export const POST: APIRoute = async ({ request }) => {
  const body = await request.text();
  const signature = request.headers.get('stripe-signature')!;
  const webhookSecret = import.meta.env.STRIPE_WEBHOOK_SECRET!;

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err) {
    return new Response(`Webhook Error: ${err}`, { status: 400 });
  }

  // Handle subscription events
  switch (event.type) {
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
      await handleSubscriptionUpdate(event.data.object as Stripe.Subscription);
      break;
    
    case 'customer.subscription.deleted':
      await handleSubscriptionCanceled(event.data.object as Stripe.Subscription);
      break;
  }

  return new Response(JSON.stringify({ received: true }), { status: 200 });
};

async function handleSubscriptionUpdate(subscription: Stripe.Subscription) {
  const clerkSecretKey = import.meta.env.CLERK_SECRET_KEY;
  const metadata = subscription.metadata;
  
  // Determine if this is a user or organization subscription
  const userId = metadata.userId;
  const orgId = metadata.orgId;
  
  if (userId) {
    // Update user metadata
    await updateUserSubscription(userId, subscription);
  } else if (orgId) {
    // Update organization metadata
    await updateOrgSubscription(orgId, subscription);
  }
}

async function updateUserSubscription(
  userId: string,
  subscription: Stripe.Subscription
) {
  const clerkSecretKey = import.meta.env.CLERK_SECRET_KEY;
  
  // Get current user
  const userResponse = await fetch(
    `https://api.clerk.com/v1/users/${userId}`,
    {
      headers: {
        'Authorization': `Bearer ${clerkSecretKey}`,
        'Content-Type': 'application/json'
      }
    }
  );

  const user = await userResponse.json();
  const currentMetadata = user.public_metadata || {};
  
  // Parse subscription items to get addons
  const addons = subscription.items.data.map(item => ({
    id: item.metadata.addonId,
    status: subscription.status === 'active' ? 'active' : 'canceled',
    expiresAt: new Date(subscription.current_period_end * 1000).toISOString(),
    purchasedAt: new Date(subscription.created * 1000).toISOString()
  }));

  // Update metadata
  const updatedMetadata = {
    ...currentMetadata,
    subscription: {
      status: subscription.status,
      addons,
      stripeCustomerId: subscription.customer as string,
      stripeSubscriptionId: subscription.id
    }
  };

  // Update user in Clerk
  await fetch(`https://api.clerk.com/v1/users/${userId}/metadata`, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${clerkSecretKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      public_metadata: updatedMetadata
    })
  });
}

async function updateOrgSubscription(
  orgId: string,
  subscription: Stripe.Subscription
) {
  const clerkSecretKey = import.meta.env.CLERK_SECRET_KEY;
  
  // Get current organization
  const orgResponse = await fetch(
    `https://api.clerk.com/v1/organizations/${orgId}`,
    {
      headers: {
        'Authorization': `Bearer ${clerkSecretKey}`,
        'Content-Type': 'application/json'
      }
    }
  );

  const org = await orgResponse.json();
  const currentMetadata = org.public_metadata || {};
  
  // Get tier from subscription metadata
  const tier = subscription.metadata.tier || 'starter';
  const tierDef = CHURCH_TIERS[tier as keyof typeof CHURCH_TIERS];

  // Update metadata
  const updatedMetadata = {
    ...currentMetadata,
    subscription: {
      tier,
      status: subscription.status,
      memberLimit: tierDef.memberLimit,
      features: tierDef.features,
      stripeCustomerId: subscription.customer as string,
      stripeSubscriptionId: subscription.id,
      churchInfo: currentMetadata.subscription?.churchInfo || {}
    }
  };

  // Update organization in Clerk
  await fetch(`https://api.clerk.com/v1/organizations/${orgId}/metadata`, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${clerkSecretKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      public_metadata: updatedMetadata
    })
  });
}
```

## Part 4: Database Schema Updates

### New Tables for Church Management

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

// Church content management
const ChurchContent = defineTable({
  columns: {
    id: column.text({ primaryKey: true }),
    orgId: column.text(), // Clerk organization ID
    inboxItemId: column.text(), // Links to InboxItems
    createdBy: column.text(), // User ID who created
    scheduledRelease: column.date({ optional: true }),
    targetGroups: column.text({ optional: true }), // JSON array of group IDs
    status: column.text(), // 'draft' | 'scheduled' | 'published'
    createdAt: column.date(),
    updatedAt: column.date({ optional: true }),
  }
});
```

### Updated UserMetadata

Add connection fields to existing UserMetadata table:

```typescript
// Add to UserMetadata (church fields already exist)
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

### Church Connection System

**Key Feature**: Users can set their church, and when that church creates a Clerk Organization, they automatically get connected.

**Flow**:
1. User sets church info in Profile → My Church (already implemented ✅)
2. Church admin creates Clerk Organization with matching info
3. System finds matching users using algorithm (name + city + state)
4. Creates connection requests for high-confidence matches
5. Users accept → Added to Clerk org → Church content appears in inbox

See `CHURCH_CONNECTION_SYSTEM.md` for full implementation details.

## Implementation Checklist

### Phase 1: Individual Add-Ons
- [ ] Create subscription utilities (`src/utils/subscriptions.ts`)
- [ ] Set up Stripe products for each add-on
- [ ] Create Stripe webhook handler
- [ ] Add feature checking middleware
- [ ] Create upgrade/pricing page
- [ ] Add feature gates to protected routes

### Phase 2: Church Organizations
- [ ] Enable Organizations in Clerk Dashboard
- [ ] Create organization utilities (`src/utils/organizations.ts`)
- [ ] Set up Stripe products for church tiers
- [ ] Create church dashboard interface
- [ ] Implement inbox targeting for organizations
- [ ] Add church content management UI
- [ ] Create analytics dashboard for churches

### Phase 3: Integration
- [ ] Connect Stripe checkout to Clerk metadata updates
- [ ] Test subscription lifecycle (create, update, cancel)
- [ ] Test feature gating
- [ ] Test organization content distribution
- [ ] Add billing management UI

## Key Benefits of This Approach

1. **Clerk Organizations**: Built-in multi-tenancy, member management, roles
2. **Metadata Storage**: No separate subscription database needed
3. **Stripe Integration**: Standard billing, webhooks, subscription management
4. **Feature Gating**: Easy to check permissions via metadata
5. **Scalable**: Clerk handles organization management, Stripe handles billing

## Security Considerations

1. **Always verify webhook signatures** from Stripe
2. **Validate user permissions** before allowing feature access
3. **Rate limit** subscription checks to avoid API abuse
4. **Cache subscription data** to reduce Clerk API calls
5. **Use private_metadata** for sensitive billing data if needed

