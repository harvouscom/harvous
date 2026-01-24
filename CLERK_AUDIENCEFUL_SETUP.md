# Clerk to Audienceful Integration Setup

This integration automatically tags users in Audienceful when they sign up for Harvous via Clerk authentication.

## What It Does

When someone signs up for Harvous:
1. Clerk triggers an `emailAddress.created` webhook (PRIMARY) or `user.created` webhook (fallback)
2. The webhook endpoint receives the event data
3. For `emailAddress.created` events, we fetch full user details from Clerk API
4. The user is automatically added/updated in Audienceful with:
   - Tag: `User`
   - Custom field: `clerk_user_id` (their Clerk user ID)
   - First and last name (if provided)

This allows you to segment in Audienceful between email subscribers and actual app users.

## Setup Instructions

### 1. Get Your Audienceful API Key

1. Log in to [Audienceful](https://app.audienceful.com)
2. Go to Settings > API
3. Copy your API key
4. Add it to your `.env` file:
   ```
   AUDIENCEFUL_API_KEY=your_api_key_here
   ```

### 2. Configure Clerk Webhook

1. Go to your [Clerk Dashboard](https://dashboard.clerk.com)
2. Navigate to **Webhooks** in the sidebar
3. Click **Add Endpoint**
4. Configure the webhook:
   - **Endpoint URL**: `https://your-domain.com/api/webhooks/clerk`
     - For production: `https://app.harvous.com/api/webhooks/clerk`
     - For development/testing: Use [ngrok](https://ngrok.com) or similar to expose your local server
   - **Subscribe to events**: Select the following events:
     - ✅ `emailAddress.created` (REQUIRED - most reliable for new signups)
     - ✅ `user.created` (optional - fallback if emailAddress.created not available)
     - ✅ `user.updated` (optional - updates user info)
     - ⬜ `user.deleted` (optional - currently just logs, doesn't remove from Audienceful)
     
   **Why emailAddress.created?** This event fires when an email is actually created, ensuring we have the email address available. `user.created` may fire before the email is fully set up, which can cause sync failures.
5. Click **Create**
6. Copy the **Signing Secret** (starts with `whsec_...`)
7. Add it to your `.env` file:
   ```
   CLERK_WEBHOOK_SECRET=whsec_your_signing_secret_here
   ```

### 3. Deploy Your Changes

1. Make sure both environment variables are set in your production environment:
   ```
   CLERK_WEBHOOK_SECRET=whsec_...
   AUDIENCEFUL_API_KEY=...
   ```

2. Deploy your application with the new webhook endpoint

3. The endpoint is now available at: `/api/webhooks/clerk`

### 4. Test the Integration

#### Option A: Test with a Real User Signup

1. Sign up a new test user in your Clerk authentication
2. Check the webhook logs in Clerk Dashboard > Webhooks > [Your Endpoint] > Logs
3. Verify the webhook was delivered successfully (should see 200 status)
4. Check Audienceful to confirm the user was tagged with `User`

#### Option B: Test with Clerk's Webhook Testing Tool

1. In Clerk Dashboard > Webhooks > [Your Endpoint]
2. Click the **Testing** tab
3. Select `user.created` event
4. Click **Send Example**
5. Check the response - should see success message
6. Note: This won't create a real user in Audienceful (example data uses fake email)

### 5. Verify in Audienceful

1. Go to [Audienceful People](https://app.audienceful.com/people)
2. Search for a user who signed up
3. Verify they have:
   - ✅ Tag: `User`
   - ✅ Custom field: `clerk_user_id` with their Clerk ID
   - ✅ First/last name (if provided during signup)

## Using the Segmentation

Now you can create audience segments in Audienceful:

### Email Subscribers Only
- Filter: Does NOT have tag `User`
- Use case: Encourage them to sign up for the app

### App Users Only
- Filter: Has tag `User`
- Use case: Send app-specific updates, feature announcements, engagement emails

### Both
- No filter or use custom combinations
- Use case: General announcements, newsletter content

## Technical Details

### Files Created/Modified

- `src/utils/audienceful.ts` - Audienceful API integration helper
- `src/pages/api/webhooks/clerk.ts` - Clerk webhook endpoint
- `src/middleware.ts` - Added webhook endpoint to public routes
- `.env.example` - Added required environment variables

### API Endpoints

**Audienceful API**
- Base URL: `https://app.audienceful.com/api`
- Authentication: `X-Api-Key` header
- Endpoints used:
  - `GET /people/?email={email}` - Find subscriber by email
  - `POST /people/` - Create new subscriber
  - `PATCH /people/{id}` - Update existing subscriber

**Webhook Endpoint**
- URL: `/api/webhooks/clerk`
- Method: POST
- Authentication: Svix signature verification (HMAC SHA-256)
- Events handled: `emailAddress.created` (primary), `user.created` (fallback), `user.updated`, `user.deleted`

### Security

The webhook endpoint includes:
- ✅ Signature verification using Clerk's Webhook class from `@clerk/backend`
- ✅ Svix header validation (`svix-id`, `svix-timestamp`, `svix-signature`)
- ✅ Server-side only (not exposed to client)
- ✅ Added to public routes in middleware (uses webhook secret for auth, not Clerk session)

### Error Handling

- If Audienceful is down or returns an error, the webhook still succeeds (returns 200)
- Errors are logged to console and PostHog (via `handleAPIError`)
- This prevents Clerk from retrying the webhook endlessly
- The user is successfully created in Clerk regardless of Audienceful status

## Backfilling Existing Users

The webhook only works for NEW signups going forward. To sync all your existing Clerk users to Audienceful, run the migration script:

### Running the Migration

1. **Set up MIGRATION_KEY** (optional but recommended):
   ```bash
   # In your .env file
   MIGRATION_KEY=your_secure_random_key_here
   ```

   Generate a secure key:
   ```bash
   openssl rand -base64 32
   ```

2. **Test with dry run first** (recommended):
   ```bash
   curl -X POST "https://app.harvous.com/api/migrations/sync-clerk-to-audienceful?dryRun=true" \
     -H "Authorization: Bearer your_migration_key_here"
   ```

   This will show you what would happen without making any changes.

3. **Run the actual migration**:
   ```bash
   curl -X POST "https://app.harvous.com/api/migrations/sync-clerk-to-audienceful" \
     -H "Authorization: Bearer your_migration_key_here"
   ```

### Migration Options

You can pass query parameters to control the migration:

- `dryRun=true` - Preview without making changes
- `limit=50` - Only process first 50 users (for testing)
- `offset=100` - Skip first 100 users (for resuming if interrupted)

Example with options:
```bash
curl -X POST "https://app.harvous.com/api/migrations/sync-clerk-to-audienceful?limit=10&dryRun=true" \
  -H "Authorization: Bearer your_migration_key_here"
```

### Response Format

The migration will return a summary:
```json
{
  "success": true,
  "message": "Migration complete",
  "results": {
    "totalUsers": 150,
    "successful": 148,
    "failed": 0,
    "skipped": 2,
    "errorCount": 0,
    "errors": [],
    "durationSeconds": 45.3,
    "dryRun": false
  }
}
```

### Important Notes

- The migration processes users in batches of 100
- Users without email addresses are skipped
- If a user is already in Audienceful, their tags will be merged (not replaced)
- Failed syncs are reported but don't stop the migration
- You can run this multiple times safely - it's idempotent

## Troubleshooting

### Webhook not triggering

1. Check Clerk Dashboard > Webhooks > [Your Endpoint] > Logs
2. Verify the endpoint URL is correct
3. Make sure the endpoint is publicly accessible (not localhost)
4. Check that `user.created` event is selected

### 404: Not Found Error

If Clerk's webhook delivery shows a **404: Not Found** error:

1. **Test endpoint accessibility:**
   ```bash
   # Should return 200 with status info (not 404)
   curl https://app.harvous.com/api/webhooks/clerk
   ```

2. **Check Netlify routing:**
   - Ensure `netlify.toml` excludes `/api/*` routes from the SPA redirect
   - The redirect should have conditions excluding API paths

3. **Verify deployment:**
   - Confirm the endpoint file exists: `src/pages/api/webhooks/clerk.ts`
   - Check Netlify build logs to ensure the function is created
   - Verify the endpoint is deployed to production

4. **Check webhook URL in Clerk Dashboard:**
   - Should be: `https://app.harvous.com/api/webhooks/clerk` (NOT `https://harvous.com`)
   - Ensure there are no trailing slashes or typos

5. **Review Netlify function logs:**
   - Go to Netlify Dashboard > Functions
   - Check if requests are reaching the endpoint
   - Look for routing or deployment errors

### Signature verification failing

1. Verify `CLERK_WEBHOOK_SECRET` is set correctly in `.env`
2. Make sure it starts with `whsec_`
3. Copy the secret again from Clerk Dashboard (it's easy to copy it wrong)
4. Restart your server after updating environment variables

### User not appearing in Audienceful

1. Check the webhook logs in Clerk Dashboard - did it succeed?
2. Check your server logs for errors
3. Verify `AUDIENCEFUL_API_KEY` is set correctly
4. Test the Audienceful API directly:
   ```bash
   curl -X GET "https://app.audienceful.com/api/people/?email=test@example.com" \
     -H "X-Api-Key: your_api_key"
   ```

### User has no email

- Clerk requires email for most configurations, but if a user signs up with just phone/username:
  - The webhook will log an error
  - The user won't be added to Audienceful (email is required)
  - The webhook will still return success (doesn't block user creation)

## Future Enhancements

Possible improvements:
- Add custom field for user signup date
- Track user's last login date in Audienceful
- Add tags based on subscription tier (free/paid)
- Implement user deletion sync (remove `User` tag when user deletes account)
- Add retry logic for Audienceful API failures
- Queue failed syncs for later retry

## Support

- Clerk Documentation: https://clerk.com/docs/webhooks/overview
- Audienceful API Docs: https://developer.audienceful.com
- Svix (Clerk's webhook provider): https://docs.svix.com
