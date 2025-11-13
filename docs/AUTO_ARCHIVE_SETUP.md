# Auto-Archive Setup for Inbox Items

This guide explains how to set up automatic archiving of inbox items after 14 days.

## Overview

Inbox items are automatically archived after 14 days based on when they appeared in the user's inbox (`UserInboxItems.createdAt`). The auto-archive process:

- Finds all inbox items with status `'inbox'` that are older than 14 days
- Updates their status to `'archived'`
- Sets the `archivedAt` timestamp
- Runs daily (via scheduled job)

## API Endpoint

The auto-archive endpoint is available at:
```
POST /api/inbox/auto-archive
GET /api/inbox/auto-archive  (also supported for easy testing)
```

### Security (Optional)

If you set `AUTO_ARCHIVE_SECRET_TOKEN` in your environment variables, the endpoint will require authentication:

```bash
Authorization: Bearer YOUR_SECRET_TOKEN
```

If the token is not set, the endpoint is publicly accessible (use with caution in production).

## Setting Up Scheduled Execution

**Note:** Netlify Scheduled Functions require a paid plan. Use one of these free alternatives:

### Option 1: GitHub Actions (Free & Recommended) ✅

GitHub Actions offers free scheduled workflows for public repositories. The workflow file is already created at `.github/workflows/auto-archive.yml`.

**Setup Steps:**

1. **Update Site URL** (if needed):
   - Open `.github/workflows/auto-archive.yml`
   - Update the default URL on line 15 if your Netlify site URL is different from `https://harvous.netlify.app`

2. **Add GitHub Secrets** (Optional but recommended):
   - See **[AUTO_ARCHIVE_SECRET_SETUP.md](./AUTO_ARCHIVE_SECRET_SETUP.md)** for detailed step-by-step instructions
   - Quick version: Add `AUTO_ARCHIVE_SECRET_TOKEN` to GitHub Secrets and Netlify environment variables

3. **Push to GitHub**:
   - Commit and push the workflow file
   - The workflow will automatically start running daily at 2 AM UTC

4. **Test Manually** (Optional):
   - Go to your repository → **Actions** tab
   - Find "Auto-Archive Inbox Items" workflow
   - Click **Run workflow** to test it immediately

### Option 2: External Cron Service (Free Options)

Use a free service like:
- **cron-job.org** (https://cron-job.org/) - Free tier available
- **EasyCron** (https://www.easycron.com/) - Limited free tier
- **UptimeRobot** (https://uptimerobot.com/) - Free monitoring + cron

Configure it to call:
```
POST https://your-site.netlify.app/api/inbox/auto-archive
```

With optional authentication header:
```
Authorization: Bearer YOUR_SECRET_TOKEN
```

Schedule: Daily at your preferred time (e.g., 2 AM UTC)

### Option 3: Manual Trigger (For Testing)

You can manually trigger the auto-archive by calling:
```bash
curl -X POST https://your-site.netlify.app/api/inbox/auto-archive
```

Or visit the URL in your browser (GET request also works).

## How It Works

1. **Daily Execution**: The scheduled job runs once per day
2. **Query**: Finds all `UserInboxItems` where:
   - `status === 'inbox'`
   - `createdAt < (today - 14 days)`
   - Associated `InboxItem.isActive === true`
3. **Archive**: Updates each item:
   - `status = 'archived'`
   - `archivedAt = new Date()`
4. **Response**: Returns count of archived items and any errors

## Testing

To test the auto-archive functionality:

1. **Create test data** (items older than 14 days in inbox)
2. **Call the endpoint manually**:
   ```bash
   curl -X POST http://localhost:4321/api/inbox/auto-archive
   ```
3. **Check results**: Verify items moved to archive tab

## Monitoring

Check Netlify function logs or your cron service logs to monitor:
- Number of items archived each day
- Any errors during the process
- Execution time

## Related Files

- `/api/inbox/auto-archive.ts` - Auto-archive endpoint
- `/utils/inbox-data.ts` - Inbox data utilities
- `db/config.ts` - Database schema (UserInboxItems table)

