# Anonymous diagnostics

Harvous records **anonymous issue signals** from client activity to help the team find bugs without storing user identities in the diagnostic pipeline.

## What is captured

- JavaScript errors and unhandled promise rejections (auto)
- API failures with HTTP 500+ (auto, from the SPA API client)
- Optional manual reports from **Settings → Support** (anonymous diagnostic button, or background send when reporting a Bug via email)

## What is never stored

- Clerk user ID, email, or display name
- Note, thread, or space content
- Scripture text
- Raw share tokens or long hex identifiers (scrubbed to placeholders)

Each event includes:

- Scrubbed error message and optional stack snippet
- Redacted route (e.g. `/note/:id`)
- Platform (`web` / `ios` / `unknown`), app version, browser family
- Random `anonymousSessionId` in `localStorage` (rotates weekly; not tied to auth)

## API

- `POST /api/diagnostics/event` — public ingest, rate-limited per session, always returns `{ success: true }`
- Admin (Harvous admin only):
  - `GET /api/admin/diagnostics/issues?days=7`
  - `GET /api/admin/diagnostics/issues/:signature/events`
  - `PATCH /api/admin/diagnostics/issues/:signature` — triage status `open` | `resolved` | `ignored`

## Admin UI

**Maintenance → Issue signals** (`/admin/maintenance`): grouped issues, sample events, triage actions.

## Database

Tables: `DiagnosticEvents`, `DiagnosticIssueTriage`. Apply with `npm run db:push`.

## Relation to PostHog

PostHog may still be configured separately for product analytics. Anonymous diagnostics are first-party, stored in Supabase, and viewable in the admin Maintenance page without a PostHog account.

## Support page

Users can still email the founder (identified path). Anonymous diagnostics are additive and optional.
