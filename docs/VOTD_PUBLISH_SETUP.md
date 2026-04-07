# Verse of the Day — Daily Publish Setup

This guide explains how scheduled publishing works for the dashboard **Verse of the Day** (`FeaturedItems` with `contentType: 'votd'`) and how it interacts with user **default Bible translation**.

## Overview

1. Curated verses live in `VotdSchedule` (added via `POST /api/admin/votd/schedule`).
2. Each UTC calendar day, a job calls **`POST /api/admin/votd/publish-daily`**, which picks the day’s verse and inserts an active `FeaturedItems` row (with reference + catalog translation + verse HTML in `metadata`).
3. **Users still see their own default translation** on the card and in notes created from VOTD: the SPA refetches verse text when the user’s default differs from the catalog, and `POST /api/featured/votd/quick-add` uses `UserMetadata.defaultTranslation` when creating a note.

## API Endpoint

```
POST /api/admin/votd/publish-daily
```

- **Calendar day:** Server uses UTC (`YYYY-MM-DD`) for “today” and for the featured item’s `startsAt` / `endsAt` window (see `server/routes/votd.ts`).
- **Idempotent:** If a VOTD was already published for today, the response includes `alreadyPublished: true`.

## Security

When **`VOTD_CRON_SECRET`** is set in the Netlify environment (API / Functions), the publish endpoint accepts:

```http
Authorization: Bearer <same value as VOTD_CRON_SECRET>
```

If `VOTD_CRON_SECRET` is **not** set, only a Harvous **admin browser session** can publish (not suitable for GitHub Actions or external cron).

**CSRF:** `/api/admin/*` routes skip Origin checks (see `server/middleware/csrf.ts`), so server-to-server `POST` with Bearer is allowed.

## GitHub Actions (recommended)

Workflow: [`.github/workflows/votd-publish-daily.yml`](../.github/workflows/votd-publish-daily.yml)

- Runs daily at **00:15 UTC** and supports **workflow_dispatch** for manual runs.
- Uses the same URL fallback pattern as inbox auto-archive.

### Repository secrets

| Secret | Required | Purpose |
|--------|----------|---------|
| `VOTD_CRON_SECRET` | **Yes** for production | Must match Netlify `VOTD_CRON_SECRET`. Sent as `Authorization: Bearer …`. |
| `VOTD_PUBLISH_SITE_URL` | No | Defaults to `https://app.harvous.com` if unset. Use your production app origin if different. |

### Netlify environment

Set **`VOTD_CRON_SECRET`** to a long random string (same value stored in GitHub Secrets).

### Manual test

1. Repository → **Actions** → **Publish Verse of the Day** → **Run workflow**.
2. Expect HTTP **200** and JSON such as `{ "success": true, "featuredItemId": "...", ... }` or `{ "alreadyPublished": true, ... }`.
3. **404** with `No unpublished VOTD entries available` means the `VotdSchedule` pool is empty; add rows via `POST /api/admin/votd/schedule` (admin).

### Local / curl

```bash
export SITE_URL=https://app.harvous.com
export VOTD_CRON_SECRET=your-secret
curl -sS -X POST "$SITE_URL/api/admin/votd/publish-daily" \
  -H "Authorization: Bearer $VOTD_CRON_SECRET"
```

## Verifying default translation behavior

1. Publish or seed a VOTD whose **catalog** translation in metadata is one version (e.g. NET).
2. In the app, set **default translation** to another supported version (e.g. ESV) in profile settings.
3. **Dashboard card:** Verse text and pill should reflect **ESV** (client calls `/api/scripture/fetch-verse` when defaults differ).
4. **Add to my Harvous:** New note content and scripture metadata should use **ESV** (`UserMetadata.defaultTranslation` on the server).

## Related code

- `server/routes/votd.ts` — schedule pool, `publish-daily`
- `server/routes/featured.ts` — `POST /api/featured/votd/quick-add`
- `spa/src/components/FeaturedCard.tsx` — `VotdCard` display + fetch for user default
