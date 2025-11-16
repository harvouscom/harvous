# Monetization Quick Start Guide

## Quick Answers

### Q: Should churches use Clerk Organizations?
**A: Yes!** Clerk Organizations is perfect for churches because:
- Built-in member management (no need to build your own)
- Role-based access (admin, moderator, member)
- Organization-level metadata for subscription info
- Easy to query "all members of this church"
- Scales automatically

### Q: How do add-ons work with Clerk?
**A: Store add-ons in Clerk's `public_metadata`** on the user object:
- Each user has a `subscription` object in their metadata
- Contains array of active add-ons with expiration dates
- Stripe webhooks update this metadata when subscriptions change
- Your app checks metadata to gate features

## Architecture Summary

```
Individual Users (Add-Ons)
├── Clerk User Metadata
│   └── subscription: {
│       status: "active",
│       addons: ["group_study_suite", "learning_courses"]
│     }
└── Feature Gating
    └── Check metadata before allowing access

Churches (Organizations)
├── Clerk Organization
│   ├── Members (managed by Clerk)
│   ├── Roles (admin, moderator, member)
│   └── Metadata: {
│       subscription: {
│         tier: "growth",
│         features: ["content_management", "push_to_inbox"]
│       }
│     }
└── Content Distribution
    └── Push to all org members' inboxes
```

## How It Works

### Individual Add-Ons Flow

1. **User subscribes** → Stripe Checkout
2. **Stripe webhook** → Updates Clerk user metadata
3. **User accesses feature** → App checks metadata
4. **Feature gated** → Show upgrade prompt if no access

### Church Organizations Flow

1. **Church admin creates org** → Clerk Organization created
2. **Church subscribes** → Stripe subscription for organization
3. **Stripe webhook** → Updates Clerk org metadata
4. **Admin creates content** → Church dashboard
5. **Push to inbox** → Content sent to all org members
6. **Members see content** → Appears in their "For You" inbox

## Key Implementation Points

### 1. Clerk Organizations Setup

```typescript
// Enable in Clerk Dashboard
// Then use in your app:
import { getAuth } from '@clerk/astro/server';

const { orgId, orgRole } = await getAuth();
// orgId = organization ID if user is in an org
// orgRole = 'org:admin' | 'org:member' | etc.
```

### 2. Metadata Structure

**User Metadata (Add-Ons):**
```json
{
  "subscription": {
    "status": "active",
    "addons": [
      {
        "id": "group_study_suite",
        "status": "active",
        "expiresAt": "2025-12-31T23:59:59Z"
      }
    ]
  }
}
```

**Organization Metadata (Church):**
```json
{
  "subscription": {
    "tier": "growth",
    "status": "active",
    "memberLimit": 500,
    "features": ["content_management", "push_to_inbox"]
  }
}
```

### 3. Feature Checking

```typescript
// Check if user has add-on
const hasAddon = await hasAddon(userId, 'group_study_suite');

// Check if org has feature
const canPushContent = await orgHasFeature(orgId, 'push_to_inbox');
```

## Next Steps

1. **Read the full architecture**: `CLERK_MONETIZATION_ARCHITECTURE.md`
2. **Enable Organizations** in Clerk Dashboard
3. **Set up Stripe** products for add-ons and church tiers
4. **Create utilities** for subscription checking
5. **Add feature gates** to protected routes

## Benefits

✅ **No separate database** for subscriptions (uses Clerk metadata)
✅ **Built-in member management** (Clerk Organizations)
✅ **Easy feature gating** (check metadata)
✅ **Scalable** (Clerk handles org management)
✅ **Standard billing** (Stripe webhooks)

