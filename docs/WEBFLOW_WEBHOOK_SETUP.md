# Webflow Webhook Setup for Inbox Sync

This guide explains how to set up automatic syncing of inbox items from Webflow CMS using webhooks.

## Overview

The webhook endpoint (`/api/webflow/webhook`) automatically syncs inbox items when:
- A thread is published in Webflow
- A thread is updated (including when the "Send to Harvous Inbox?" toggle is changed)
- A thread is unpublished or deleted

## Setup Instructions

### 1. Deploy Your Application

Ensure your application is deployed and accessible via HTTPS. The webhook URL will be:
```
https://your-domain.com/api/webflow/webhook
```

### 2. Configure Webhook in Webflow

1. **Go to Webflow Project Settings**
   - Open your Webflow project
   - Navigate to **Project Settings** → **Integrations** → **Webhooks**

2. **Add New Webhook**
   - Click **"Add Webhook"**
   - Enter your webhook URL: `https://your-domain.com/api/webflow/webhook`
   - Select the **Threads collection** (ID: `690ed2f0edd9bab40a4eb397`)

3. **Configure Webhook Trigger**
   - **Collection Item Changed** - This single trigger catches:
     - When a thread is published (first time)
     - When a thread is updated (including toggle changes)
     - When a thread is unpublished (marks item as inactive)
     - When a thread is deleted (marks item as inactive)
   
   **Note:** According to [Webflow's documentation](https://help.webflow.com/hc/en-us/articles/33961356296723-Intro-to-Webflow-s-APIs), `collection_item_changed` triggers on create, update, and delete, so you only need one webhook configuration.

4. **Save the Webhook**
   - Click **"Save"** to activate the webhook

### 3. Test the Webhook

1. **Publish a Thread in Webflow**
   - Create or edit a thread in the Threads collection
   - Enable the **"Send to Harvous Inbox?"** toggle
   - Publish the thread

2. **Verify Sync**
   - Check your application logs for webhook processing
   - Verify the thread appears in user inboxes
   - Check that the timestamp shows correctly

## How It Works

### Webhook Processing Flow

1. **Webflow sends webhook** → `/api/webflow/webhook`
2. **Endpoint validates**:
   - Checks if webhook is from Threads collection
   - Verifies item has "Send to Harvous Inbox?" toggle enabled
   - Skips draft or unpublished items
3. **Syncs item**:
   - Creates or updates `InboxItems` record
   - Fetches and syncs thread notes (if any)
   - Assigns item to users based on `targetAudience`
4. **Returns success** → Webflow receives 200 OK

### Target Audience Logic

- **"Welcome to Harvous"** thread → `targetAudience: 'all_new_users'`
- **All other threads** → `targetAudience: 'all_users'`

### User Assignment

- Items with `targetAudience: 'all_users'` are assigned to all existing users
- Items with `targetAudience: 'all_new_users'` are assigned to all existing users (new users get them via middleware)
- Each user gets a `UserInboxItems` record with `createdAt` timestamp (used for relative time display)

## Troubleshooting

### Webhook Not Triggering

1. **Check Webflow Webhook Settings**
   - Verify webhook URL is correct
   - Ensure triggers are enabled
   - Check webhook is active (not paused)

2. **Check Application Logs**
   - Look for webhook processing errors
   - Verify `WEBFLOW_API_TOKEN` is set
   - Check database connection

3. **Test Manually**
   - Use the manual sync endpoint: `GET /api/webflow/sync-inbox?collectionId=690ed2f0edd9bab40a4eb397&siteId=68feb1d0933e97605f9790ca`

### Items Not Appearing in Inbox

1. **Check Toggle Status**
   - Ensure "Send to Harvous Inbox?" toggle is enabled in Webflow
   - Verify item is published (not draft)

2. **Check User Assignment**
   - Verify `UserInboxItems` records exist for your user
   - Check `targetAudience` matches your user type

3. **Check Database**
   - Verify `InboxItems` records exist
   - Check `isActive` is `true`

## Manual Sync (Fallback)

If webhooks are not working, you can manually trigger a sync:

```bash
# Using curl
curl -X GET "https://your-domain.com/api/webflow/sync-inbox?collectionId=690ed2f0edd9bab40a4eb397&siteId=68feb1d0933e97605f9790ca"
```

Or use the POST endpoint with items directly.

## Security Considerations

- **Signature Verification**: The webhook endpoint verifies all incoming requests using HMAC SHA256 signatures
- **Secret Required**: Configure `WEBFLOW_WEBHOOK_SECRET` to enable signature verification (highly recommended)
- **Collection Validation**: Only processes webhooks from the Threads collection
- **Secure Storage**: Ensure `WEBFLOW_API_TOKEN` and `WEBFLOW_WEBHOOK_SECRET` are kept secure and not exposed
- **HTTPS Required**: Webhooks only work over HTTPS (required by Webflow)

## Environment Variables

Required:
- `WEBFLOW_API_TOKEN` - Your Webflow API token (from Webflow account settings)
- `WEBFLOW_WEBHOOK_SECRET` - Webhook secret(s) from Webflow (comma-separated if multiple webhooks)

### Webhook Secret Configuration

**You only need one webhook** with the trigger "Collection Item Changed" - it will catch publishes, updates, unpublishes, and deletes. Use the secret from that webhook:

```env
WEBFLOW_WEBHOOK_SECRET="your-collection-item-changed-secret-key"
```

**Note:** If you previously set up multiple webhooks, you can delete the extra ones and keep only "Collection Item Changed". Use only the secret from that webhook.

## Related Files

- `/api/webflow/webhook.ts` - Webhook endpoint handler
- `/api/webflow/sync-inbox.ts` - Manual sync endpoint (reused by webhook)
- `/utils/dashboard-data.ts` - Inbox item fetching and display logic

