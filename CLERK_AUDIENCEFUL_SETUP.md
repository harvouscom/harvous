# Clerk to Audienceful Integration Setup

This integration upserts people in Audienceful when they sign up for Harvous via Clerk, and ensures they have the **`User`** tag so you can segment actual app users vs newsletter-only subscribers.

## Production restore checklist

Do this on the **production** Clerk instance (`pk_live_…` / app.harvous.com), not the development instance:

1. Deploy this repo so Netlify runs the fixed Audienceful lookup (`?search=` + exact email match) and tag merge.
2. Confirm Netlify env: `AUDIENCEFUL_API_KEY`, `CLERK_WEBHOOK_SECRET`, `CLERK_SECRET_KEY`, `MIGRATION_KEY`.
3. Clerk Dashboard → **Webhooks** → Add Endpoint  
   - URL: `https://app.harvous.com/api/webhooks/clerk`  
   - Events: `user.created`, `user.updated`  
   - Copy signing secret → set Netlify `CLERK_WEBHOOK_SECRET` if rotated → redeploy.
4. Sign up a test user on production; confirm Audienceful has tag **`User`** (other tags preserved) and `clerk_user_id`.
5. Backfill missed users (dry-run first):

```bash
curl -X POST "https://app.harvous.com/api/migrations/sync-clerk-to-audienceful?dryRun=true" \
  -H "Authorization: Bearer $MIGRATION_KEY"
curl -X POST "https://app.harvous.com/api/migrations/sync-clerk-to-audienceful" \
  -H "Authorization: Bearer $MIGRATION_KEY"
```

Local smoke (API on port 3001): `npx tsx scripts/verify-audienceful-upsert.ts` and `node scripts/run-clerk-audienceful-sync.js --local --dry-run`.

## What It Does

When someone signs up for Harvous:
1. Clerk triggers a `user.created` webhook (PRIMARY) or `user.updated` (name/email changes)
2. The webhook endpoint receives the event data
3. The person is **created or updated** in Audienceful with:
   - Tag: `User` (merged with any existing tags — other tags like `pending` are kept)
   - Custom field: `clerk_user_id` (their Clerk user ID)
   - First and last name (if provided)
   - Activity fields (when Clerk provides them): `signed_up_at`, `last_sign_in_at`, `last_active_at`, `activity_status`

This allows you to segment in Audienceful between email subscribers and actual app users, and by recent auth activity.

## Audienceful custom fields

Create these custom fields in Audienceful (Settings → Custom fields / people fields) if they do not already exist. Use these exact `data_name` values:

| data_name | Purpose |
|---|---|
| `clerk_user_id` | Join key to Clerk |
| `signed_up_at` | ISO signup time |
| `last_sign_in_at` | ISO last Clerk sign-in |
| `last_active_at` | ISO last Clerk activity |
| `activity_status` | `active` (≤7d), `cooling` (7–30d), `dormant` (>30d), or `unknown` |
| `has_created_note` | Ever created a note |
| `has_opened_note` | Ever opened a note in the app |
| `has_created_thread` | Ever created a **2.0 study/conversation Thread** (not a folder) |
| `has_shared` | Ever enabled a public share link |
| `has_created_space` | Ever created a shared space |
| `has_joined_space` | Ever joined a shared space (non-owner) |
| `upgrade_viewed` | Visited the upgrade page |
| `checkout_started` | Started Polar checkout |

**Thread ≠ folder:** In Harvous 2.0, folders replaced Classic thread piles. `has_created_thread` is set only for study Threads (My Home connected-note clusters via `NoteConnections`, or shared-space Start Thread). Folder create does **not** set this flag.

Flags are **monotonic** (only ever set to `true`). See [docs/AUDIENCEFUL_EMAIL_AUTOMATIONS.md](docs/AUDIENCEFUL_EMAIL_AUTOMATIONS.md) for safe email copy boundaries.

### Product flag write paths

1. **Immediate** — fire-and-forget after successful API mutations (note create, connect-link study Thread, share enable, shared space create/join).
2. **Milestones** — `POST /api/user/audienceful-milestones` with `{ milestones: ['note_opened' | 'upgrade_viewed' | 'checkout_started'] }` (auth required). Used for client-only signals.
3. **Nightly** — same `@daily` job reconciles DB-derivable `has_*` flags (not upgrade/checkout) alongside Clerk activity fields.

## Nightly activity refresh

A Netlify scheduled function runs `@daily`:

- Source: [`server/netlify-audienceful-activity-sync.ts`](server/netlify-audienceful-activity-sync.ts)
- Bundle: `netlify/functions/audienceful-activity-sync.cjs` (via `npm run build:api`)
- Schedule: [`netlify.toml`](netlify.toml) `[functions."audienceful-activity-sync"]`
- Uses `CLERK_SECRET_KEY` + `AUDIENCEFUL_API_KEY` (no public HTTP / `MIGRATION_KEY`)
- Paginates Clerk users, upserts Audienceful with rate-limit delays, logs summary counts
- Also merges product-behavior flags derived from Postgres (2.0 Thread criteria)

Webhook keeps signup/`User` instant; nightly keeps activity + product segments honest for email.

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
3. Click **Add Endpoint** (or re-enable an existing one)
4. Configure the webhook:
   - **Endpoint URL**: `https://your-domain.com/api/webhooks/clerk`
     - For production: `https://app.harvous.com/api/webhooks/clerk`
     - For development/testing: Use [ngrok](https://ngrok.com) or similar to expose your local API (port **3001**)
   - **Subscribe to events**: Select the following events:
     - ✅ `user.created` (REQUIRED — primary signup sync)
     - ✅ `user.updated` (REQUIRED — keeps `User` tag / name / email in sync)
     - ⬜ `user.deleted` (optional - currently just logs, doesn't remove from Audienceful)

   **Note:** Older docs mentioned `emailAddress.created`. Current Clerk event catalogs use `user.created` / `user.updated` for people sync. Do **not** subscribe to `email.created` — that is for Clerk email *delivery*, not contact sync. The handler still accepts legacy `emailAddress.created` if an old instance emits it.
5. Click **Create**
6. Copy the **Signing Secret** (starts with `whsec_...`)
7. Add it to your `.env` / Netlify env:
   ```
   CLERK_WEBHOOK_SECRET=whsec_your_signing_secret_here
   ```

### 3. Deploy Your Changes

1. Make sure these environment variables are set in Netlify (production):
   ```
   CLERK_WEBHOOK_SECRET=whsec_...
   AUDIENCEFUL_API_KEY=...
   CLERK_SECRET_KEY=...
   ```

2. API routes are served by the Netlify function via `public/_redirects` (`/api/*` → `/.netlify/functions/api/:splat`). Do **not** add a catch-all that steals `/api/*` for the SPA.

3. Deploy, then confirm the endpoint is live at: `/api/webhooks/clerk`

### 4. Test the Integration

#### Option A: Test with a Real User Signup

1. Sign up a new test user in your Clerk authentication
2. Check the webhook logs in Clerk Dashboard > Webhooks > [Your Endpoint] > Logs
3. Verify delivery succeeded (**200**). If Audienceful fails, expect **500** and Clerk retries.
4. Check Audienceful: person has tag **`User`**, prior tags still present, and `clerk_user_id` set

#### Option B: Test with Clerk's Webhook Testing Tool

1. In Clerk Dashboard > Webhooks > [Your Endpoint]
2. Click the **Testing** tab
3. Select `user.created` event
4. Click **Send Example**
5. Example payloads often lack an email — expect a skip (still **200**) and no Audienceful row. Use Option A for a full end-to-end check.

### 5. Verify in Audienceful

1. Go to [Audienceful People](https://app.audienceful.com/people)
2. Search for a user who signed up
3. Verify they have:
   - ✅ Tag: `User` (plus any tags they already had)
   - ✅ Custom field: `clerk_user_id` with their Clerk ID
   - ✅ First/last name (if provided during signup)

## Using the Segmentation

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

### Files

- [`src/utils/audienceful.ts`](src/utils/audienceful.ts) — Audienceful API helper (`tagAsAppUser`, tag merge)
- [`server/routes/webhooks.ts`](server/routes/webhooks.ts) — Hono `POST /api/webhooks/clerk` (Svix `verifyWebhook` + Netlify header dedupe)
- [`server/routes/migrations.ts`](server/routes/migrations.ts) — Backfill `POST /api/migrations/sync-clerk-to-audienceful`
- [`scripts/run-clerk-audienceful-sync.js`](scripts/run-clerk-audienceful-sync.js) — CLI wrapper for the migration
- [`.env.example`](.env.example) — `AUDIENCEFUL_API_KEY`, `CLERK_WEBHOOK_SECRET`

### API Endpoints

**Audienceful API**
- Base URL: `https://app.audienceful.com/api`
- Authentication: `X-Api-Key` header
- Endpoints used:
  - `GET /people/?search={email}` — Find subscriber by email (exact match in results; do not use `?email=` — it is ignored)
  - `POST /people/` — Create new subscriber
  - `PATCH /people/` — Update existing subscriber (email in body)

**Webhook Endpoint**
- URL: `/api/webhooks/clerk`
- Method: POST
- Authentication: Svix signature verification via `verifyWebhook()` from `@clerk/backend/webhooks`
- Events handled: `user.created` (primary), `user.updated`, legacy `emailAddress.created`, `user.deleted` (log only)
- Returns:
  - **200** on success or intentional skip (no email)
  - **401** on signature verification failure
  - **500** if `CLERK_WEBHOOK_SECRET` / `AUDIENCEFUL_API_KEY` missing, or Audienceful sync fails (so Clerk retries)

### Security

- Signature verification via Clerk's `verifyWebhook` (Svix headers)
- Netlify may duplicate `svix-*` headers; the handler de-duplicates before verify
- Webhook path is CSRF-exempt; auth is the signing secret, not a Clerk session
- Server-side only (API key never exposed to the client)

### Error Handling

- Missing email → skip Audienceful, return **200** (Clerk should not retry forever)
- Audienceful API / network / missing API key → **500** so Clerk retries with backoff
- Errors are logged (and via `handleAPIError` where applicable)
- Clerk user creation is independent of Audienceful availability

## Backfilling Existing Users

The webhook only covers new events going forward. To sync existing Clerk users:

### Running the Migration

1. **Set up MIGRATION_KEY** (optional but recommended):
   ```bash
   # In your .env / Netlify env
   MIGRATION_KEY=your_secure_random_key_here
   ```

   Generate a secure key:
   ```bash
   openssl rand -base64 32
   ```

2. **Dry run** (recommended):
   ```bash
   curl -X POST "https://app.harvous.com/api/migrations/sync-clerk-to-audienceful?dryRun=true" \
     -H "Authorization: Bearer your_migration_key_here"
   ```

   Or locally (API on port 3001):
   ```bash
   node scripts/run-clerk-audienceful-sync.js --local --dry-run --key="$MIGRATION_KEY"
   ```

3. **Apply**:
   ```bash
   curl -X POST "https://app.harvous.com/api/migrations/sync-clerk-to-audienceful" \
     -H "Authorization: Bearer your_migration_key_here"
   ```

   For large lists, use batched [`scripts/sync-clerk-audienceful-batch.js`](scripts/sync-clerk-audienceful-batch.js).

### Migration Options

- `dryRun=true` — Preview without making changes
- `limit=50` — Only process first 50 users
- `offset=100` — Skip first 100 users (resume)

### Important Notes

- Processes users in batches of 100
- Users without email addresses are skipped
- Existing Audienceful people get **`User` merged in**; other tags are preserved
- Failed syncs are reported but don't stop the migration
- Safe to re-run (idempotent upsert + tag merge)

## Troubleshooting

### Webhook not triggering

1. Check Clerk Dashboard > Webhooks > [Your Endpoint] > Logs
2. Verify the endpoint URL is `https://app.harvous.com/api/webhooks/clerk`
3. Make sure the endpoint is publicly accessible
4. Confirm `user.created` and `user.updated` are selected

### 404: Not Found

1. Confirm production deploy includes the Hono API bundle (`netlify/functions/api.cjs` from `npm run build:api`)
2. Confirm `public/_redirects` maps `/api/*` to the Netlify function
3. Webhook URL must be `https://app.harvous.com/api/webhooks/clerk` (not the marketing site)
4. Check Netlify function logs for routing errors

Note: There is no GET health handler on this route — only POST. A GET may 404; that does not mean the webhook is broken.

### Signature verification failing

1. Verify `CLERK_WEBHOOK_SECRET` in Netlify matches the Clerk endpoint signing secret (`whsec_...`)
2. Redeploy / restart after rotating secrets
3. Netlify duplicate `svix-*` headers are handled in code; if 401 persists, re-copy the secret from Clerk

### User not appearing in Audienceful / missing `User` tag

1. Clerk delivery status: **500** means sync failed (check Netlify logs / Audienceful API key)
2. **200** with no person → often no email on the event (test payloads)
3. Verify `AUDIENCEFUL_API_KEY`
4. Smoke-test Audienceful:
   ```bash
   curl -X GET "https://app.audienceful.com/api/people/?search=test@example.com" \
     -H "X-Api-Key: your_api_key"
   ```

### User has no email

- Skipped with a warning; webhook returns **200**
- Only users with email addresses are synced
- Clerk's example webhook payloads often omit email — expected during Testing tab use

## Future Enhancements

- Signup / last-login custom fields
- Subscription-tier tags
- On delete: remove `User` tag (optional)
- Persistent retry queue beyond Clerk's delivery retries

## Support

- Clerk Documentation: https://clerk.com/docs/webhooks/overview
- Clerk Webhook Verification: https://clerk.com/docs/reference/backend/verify-webhook
- Audienceful API Docs: https://developer.audienceful.com
- Svix (Clerk's webhook provider): https://docs.svix.com
