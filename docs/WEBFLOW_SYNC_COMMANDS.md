# Webflow Inbox Sync Commands Reference

This document provides curl commands for syncing inbox items from Webflow CMS to Harvous.

## Prerequisites

- Webflow API token configured in environment (`WEBFLOW_API_TOKEN`)
- Development server running on `localhost:4321` (or adjust URL for production)
- Collection ID: `690ed2f0edd9bab40a4eb397` (Threads collection)
- Site ID: `68feb1d0933e97605f9790ca`

## Standard Sync

Syncs inbox items from Webflow CMS. This will:
- Fetch all items from Webflow (using CDN API for performance)
- Create or update InboxItems in the database
- Assign items to all existing users with `targetAudience: 'all_users'`
- Verify existing items and mark inactive if they no longer exist in Webflow

### Local Development

```bash
curl "http://localhost:4321/api/webflow/sync-inbox?collectionId=690ed2f0edd9bab40a4eb397&siteId=68feb1d0933e97605f9790ca"
```

### With JSON Output (Pretty Print)

```bash
curl "http://localhost:4321/api/webflow/sync-inbox?collectionId=690ed2f0edd9bab40a4eb397&siteId=68feb1d0933e97605f9790ca" | jq
```

### Production

```bash
curl "https://your-domain.com/api/webflow/sync-inbox?collectionId=690ed2f0edd9bab40a4eb397&siteId=68feb1d0933e97605f9790ca"
```

## Hard Refresh Sync

Performs a complete reset before syncing:
1. **Deletes all UserInboxItems** for all users (removes items from user inboxes)
2. **Marks all InboxItems as inactive** (they'll be reactivated if found in Webflow)
3. **Syncs fresh content** from Webflow
4. **Reassigns items** to all users

**⚠️ Warning**: This will remove all inbox items from all users' inboxes before syncing. Use this when you want to completely reset the inbox state.

### Local Development

```bash
curl "http://localhost:4321/api/webflow/sync-inbox?collectionId=690ed2f0edd9bab40a4eb397&siteId=68feb1d0933e97605f9790ca&hardRefresh=true"
```

### With JSON Output (Pretty Print)

```bash
curl "http://localhost:4321/api/webflow/sync-inbox?collectionId=690ed2f0edd9bab40a4eb397&siteId=68feb1d0933e97605f9790ca&hardRefresh=true" | jq
```

### Production

```bash
curl "https://your-domain.com/api/webflow/sync-inbox?collectionId=690ed2f0edd9bab40a4eb397&siteId=68feb1d0933e97605f9790ca&hardRefresh=true"
```

## Response Format

### Success Response

```json
{
  "success": true,
  "synced": 1,
  "items": ["inbox_1763659133035_5i0kcur82"],
  "verification": {
    "checked": 0,
    "markedInactive": 0,
    "reactivated": 0,
    "details": []
  },
  "message": "Synced 1 item(s). Verified 0 existing items: 0 marked inactive, 0 reactivated."
}
```

### Hard Refresh Response

The response format is the same, but you'll see:
- Higher `markedInactive` count (all existing items marked inactive before sync)
- Items reactivated if they're found in Webflow during sync

## API Details

### Endpoint

- **URL**: `/api/webflow/sync-inbox`
- **Method**: `GET` (recommended) or `POST`
- **Authentication**: None required (uses server-side `WEBFLOW_API_TOKEN`)

### Query Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `collectionId` | Yes | Webflow collection ID (`690ed2f0edd9bab40a4eb397` for Threads) |
| `siteId` | Yes | Webflow site ID (`68feb1d0933e97605f9790ca`) |
| `hardRefresh` | No | Set to `true` to clear all user inbox items before syncing |

### POST Method (Alternative)

You can also use POST with JSON body:

```bash
curl -X POST "http://localhost:4321/api/webflow/sync-inbox" \
  -H "Content-Type: application/json" \
  -d '{
    "collectionId": "690ed2f0edd9bab40a4eb397",
    "siteId": "68feb1d0933e97605f9790ca",
    "hardRefresh": true
  }'
```

## Performance Notes

- **Standard sync**: Uses Webflow CDN API (`api-cdn.webflow.com`) for better performance
  - Cache delay: 2-5 minutes (acceptable for manual syncs)
  - Faster response times
- **Webhook sync**: Uses regular API (`api.webflow.com`) for real-time updates
  - No cache delay
  - Immediate updates when items change in Webflow

## Troubleshooting

### No Items Synced

- Check that items in Webflow have "Send to Harvous Inbox?" toggle enabled
- Verify items are published (not drafts)
- Check Webflow API token is configured correctly

### Items Not Appearing for Users

- Run the assign endpoint: `/api/inbox/assign-to-users`
- Check that items have `targetAudience: 'all_users'`
- Verify `isActive: true` on InboxItems

### Hard Refresh Not Working

- Check server logs for errors during cleanup
- Verify database permissions
- Ensure sync completes after cleanup

## Related Endpoints

- `/api/webflow/webhook` - Automatic sync via Webflow webhooks
- `/api/inbox/assign-to-users` - Manually assign inbox items to users
- `/api/inbox/add-to-harvous` - Add individual items to user inboxes

