# Clerk to Audienceful Integration Setup

This integration automatically tags users in Audienceful when they sign up for Harvous via Clerk authentication.

## What It Does

When someone signs up for Harvous:
1. Clerk triggers a `user.created` webhook
2. The webhook endpoint receives the user data
3. The user is automatically added/updated in Audienceful with:
   - Tag: `app_user`
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
     - For production: `https://harvous.com/api/webhooks/clerk`
     - For development/testing: Use [ngrok](https://ngrok.com) or similar to expose your local server
   - **Subscribe to events**: Select the following events:
     - ✅ `user.created` (required - tags new users)
     - ✅ `user.updated` (optional - updates user info)
     - ⬜ `user.deleted` (optional - currently just logs, doesn't remove from Audienceful)
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
4. Check Audienceful to confirm the user was tagged with `app_user`

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
   - ✅ Tag: `app_user`
   - ✅ Custom field: `clerk_user_id` with their Clerk ID
   - ✅ First/last name (if provided during signup)

## Using the Segmentation

Now you can create audience segments in Audienceful:

### Email Subscribers Only
- Filter: Does NOT have tag `app_user`
- Use case: Encourage them to sign up for the app

### App Users Only
- Filter: Has tag `app_user`
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
- Events handled: `user.created`, `user.updated`, `user.deleted`

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

## Troubleshooting

### Webhook not triggering

1. Check Clerk Dashboard > Webhooks > [Your Endpoint] > Logs
2. Verify the endpoint URL is correct
3. Make sure the endpoint is publicly accessible (not localhost)
4. Check that `user.created` event is selected

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
- Implement user deletion sync (remove `app_user` tag when user deletes account)
- Add retry logic for Audienceful API failures
- Queue failed syncs for later retry

## Support

- Clerk Documentation: https://clerk.com/docs/webhooks/overview
- Audienceful API Docs: https://developer.audienceful.com
- Svix (Clerk's webhook provider): https://docs.svix.com
