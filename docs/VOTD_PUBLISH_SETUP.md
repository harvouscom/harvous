# Verse of the Day — Daily Publish Setup

This guide explains how scheduled publishing works for the dashboard **Verse of the Day** (`FeaturedItems` with `contentType: 'votd'`) and how it interacts with user **default Bible translation**.

## First-time setup from scratch

Do these once, in order.

### Step 1 — Understand the pieces

| Piece | Role |
| ----- | ---- |
| **Automated pool** (`server/constants/votd-verses.ts` + calendar in `server/constants/votd-calendar.ts`) | Daily publish picks a **calendar/holiday** verse when the UTC date matches, otherwise a **random** verse from the curated pool (skipping references already used this calendar year in `VotdPublishHistory`). |
| **Optional pins** (`VotdSchedule` with `scheduledDate`) | Harvous admin can **override** a specific UTC day via `POST /api/admin/votd/schedule` or the **[/admin/votd](/admin/votd)** editorial UI. Unpublished pins for “today” win over the automated pick. |
| **Publish log** (`VotdPublishHistory`) | One row per UTC calendar day after a successful publish; idempotent `publish-daily` checks here first. |
| **Netlify** | Hosts the API. `VOTD_CRON_SECRET` gates the cron `Authorization` header. |
| **GitHub Actions** | Runs `POST …/publish-daily` on schedule with the Bearer secret. |


You will create **one long random password**, store it in **two places** (Netlify + GitHub), and never paste it in chat or commit it to git.

### Step 2 — Create the secret (password)

On your Mac, in Terminal:

```bash
openssl rand -hex 32
```

Copy the whole line of letters and numbers. That value is your `**VOTD_CRON_SECRET**`. Save it in a password manager or a private note until both sites below are filled in.

### Step 3 — Put the secret on Netlify

1. Log in to [Netlify](https://app.netlify.com) and open the **site** that serves **[https://app.harvous.com](https://app.harvous.com)** (or whatever production URL users use).
2. Go to **Site configuration** → **Environment variables** (or **Project configuration → Environment variables**).
3. Click **Add a variable** (or **Add key**).
4. **Key:** `VOTD_CRON_SECRET`
  **Value:** paste the string from Step 2 (no quotes, no spaces before/after).
5. Scope it to **Production** (and Deploy previews / Branch deploys too if you want the same API behavior there). **Local development (CLI) can stay empty** — it does not affect production cron.
6. **Save**, then trigger a **new deploy** for the site (e.g. **Deploys → Trigger deploy → Clear cache and deploy site**, or push a small commit). New env vars apply only after a deploy.

### Step 4 — Put the same secret on GitHub

1. Open your app repo on GitHub (the one that contains `.github/workflows/votd-publish-daily.yml`).
2. **Settings** → **Secrets and variables** → **Actions**.
3. **New repository secret** (under **Repository secrets**, not Dependabot).
4. **Name:** `VOTD_CRON_SECRET`
  **Secret:** paste the **exact same** string as on Netlify.
5. Save.

GitHub will **never show** the value again after you save. That is normal.

**Optional:** If your production URL is not `https://app.harvous.com`, add another repository secret `**VOTD_PUBLISH_SITE_URL`** with your real origin (no trailing slash), e.g. `https://app.harvous.com`.

### Step 5 — Confirm the workflow file exists on `main`

On GitHub, open `**.github/workflows/votd-publish-daily.yml**`. You should see a job that runs `curl` to `/api/admin/votd/publish-daily` with a Bearer token. If this file is missing, merge or push it from your project so `**main**` has it.

### Step 6 — Editorial preview (optional)

Sign in as the **Harvous system user** and open **`/admin/votd`** to see the next 30 UTC days: calendar vs pool picks, **Refresh pick**, **Override** (pin a reference), or **Clear override**. This does not block the cron.

### Step 6b — Legacy pool rows

`POST /api/admin/votd/schedule` without `scheduledDate` still adds **unscheduled** `VotdSchedule` rows. **`publish-daily` no longer consumes that FIFO pool**; automation uses the code-based list + history. Use schedule rows for **dated overrides** only (or clear them).

### Step 7 — Test with curl from your computer

Before relying on GitHub, prove Netlify accepts the secret:

```bash
export VOTD_CRON_SECRET='paste-your-secret-here'
curl -sS -w "\nHTTP_CODE:%{http_code}\n" -X POST "https://app.harvous.com/api/admin/votd/publish-daily" \
  -H "Authorization: Bearer $VOTD_CRON_SECRET"
```

- **HTTP 200** and JSON with `success` or `alreadyPublished` → Netlify side is correct.
- **401** → secret mismatch, missing on Netlify, or deploy didn’t pick up the variable (repeat Steps 3–4).
- **404** with a message about verse text / parse failure → check `BibleVerses` has NET text for that reference. (Empty automated pool should not happen; the curated list ships in the repo.)

### Step 8 — Run the GitHub Action manually

1. GitHub repo → **Actions**.
2. Click **Publish Verse of the Day** in the left list.
3. **Run workflow** → branch `**main`** → **Run workflow**.
4. Open the latest run → expand **Publish daily VOTD**.

You should see `**Bearer auth: enabled (secret length …)`** with a positive length, then the response body and **HTTP 200**. If the step is **red**, read the error line (empty secret vs wrong HTTP code).

### Step 9 — Schedule

After manual runs work, the workflow runs on **two UTC schedules** (see `[.github/workflows/votd-publish-daily.yml](../.github/workflows/votd-publish-daily.yml)`): **23:55 UTC** publishes **tomorrow’s** verse early (`?target=next`, cron bearer only) so the `FeaturedItems` row exists before the next midnight — avoiding a gap after the previous day’s `endsAt`. **00:05 UTC** runs an idempotent **catch-up** for the current UTC day if the early run failed. “Today” for VOTD is still **UTC calendar date** for `startsAt` / `endsAt`.

---

## Overview

1. Curated verses live in `VotdSchedule` (added via `POST /api/admin/votd/schedule`).
2. Each UTC calendar day, a job calls `**POST /api/admin/votd/publish-daily`**, which picks the day’s verse and inserts an active `FeaturedItems` row (with reference + catalog translation + verse HTML in `metadata`).
3. **Users still see their own default translation** on the card and in notes created from VOTD: the SPA refetches verse text when the user’s default differs from the catalog, and `POST /api/featured/votd/quick-add` uses `UserMetadata.defaultTranslation` when creating a note.

## API Endpoint

```
POST /api/admin/votd/publish-daily
```

- **Calendar day (editorial):** `publish-daily` still records `publishedDate` as the UTC `YYYY-MM-DD` used for picking the verse (see `server/routes/votd.ts`).
- **Dashboard display:** `GET /api/featured/items` matches VOTD to the user’s **local** calendar date: the client sends `X-Votd-Timezone` (IANA, e.g. `America/Chicago`), and the API returns the `VotdPublishHistory` row whose `publishedDate` equals that date in the user’s zone. Other featured types still use `startsAt` / `endsAt`.
- **Idempotent:** If a VOTD was already published for today, the response includes `alreadyPublished: true`.
- **Early publish:** `POST …/publish-daily?target=next` with `Authorization: Bearer <VOTD_CRON_SECRET>` publishes the **next** UTC calendar day (used by the 23:55 workflow). Admin/browser sessions cannot use `target=next`.

## Security

When `**VOTD_CRON_SECRET`** is set in the Netlify environment (API / Functions), the publish endpoint accepts:

```http
Authorization: Bearer <same value as VOTD_CRON_SECRET>
```

If `VOTD_CRON_SECRET` is **not** set, only a Harvous **admin browser session** can publish (not suitable for GitHub Actions or external cron).

**CSRF:** `/api/admin/*` routes skip Origin checks (see `server/middleware/csrf.ts`), so server-to-server `POST` with Bearer is allowed.

## GitHub Actions (recommended)

Workflow: `[.github/workflows/votd-publish-daily.yml](../.github/workflows/votd-publish-daily.yml)`

- Runs daily at **11:00 UTC** (≈ 5 AM CST / 6 AM CDT) and supports **workflow_dispatch** for manual runs.
- Uses the same URL fallback pattern as inbox auto-archive.

### Repository secrets


| Secret                  | Required               | Purpose                                                                                      |
| ----------------------- | ---------------------- | -------------------------------------------------------------------------------------------- |
| `VOTD_CRON_SECRET`      | **Yes** for production | Must match Netlify `VOTD_CRON_SECRET`. Sent as `Authorization: Bearer …`.                    |
| `VOTD_PUBLISH_SITE_URL` | No                     | Defaults to `https://app.harvous.com` if unset. Use your production app origin if different. |


### GitHub UI: “There’s no value after Save”

That is **normal**. GitHub **never shows** a secret again after you save it (only the name and last-updated time). An empty value field when you open the secret for editing does **not** mean it was cleared.

### Secret empty in CI (401) — common causes

1. **Wrong tab:** Use **Settings → Secrets and variables → Actions → Repository secrets**. Secrets under **Dependabot** or **Codespaces** are **not** available to this workflow.
2. **Environment secrets:** If you created `VOTD_CRON_SECRET` under **Settings → Environments → …**, the workflow must declare that environment (see commented `environment:` line in `[.github/workflows/votd-publish-daily.yml](../.github/workflows/votd-publish-daily.yml)`); otherwise `${{ secrets.VOTD_CRON_SECRET }}` is empty in the job.
3. **Wrong repository:** Secrets are per-repo. Confirm the workflow run is on **harvouscom/harvous** (or your canonical repo), not a fork without secrets.
4. **Confirm the job sees a secret:** In the workflow log, look for `Bearer auth: enabled (secret length N chars)`. If the job fails immediately with “VOTD_CRON_SECRET is empty”, GitHub did not inject the secret — fix placement (1–3) and re-run.

### Netlify environment

Set `**VOTD_CRON_SECRET`** to a long random string (same value stored in GitHub Secrets).

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

## Troubleshooting the GitHub workflow (ordered checklist)

Work **top to bottom**. Use **Actions → Publish Verse of the Day → Run workflow** after each fix.

1. **Confirm `main` has the current workflow**
  On GitHub, open `[.github/workflows/votd-publish-daily.yml](../.github/workflows/votd-publish-daily.yml)`. You should see `set -euo pipefail`, `Bearer auth: enabled (secret length …)`, and a **red failed step** (not green) when HTTP ≠ 200. If the log only shows `Run echo "Calling VOTD publish…"` and stays green on 401, merge the latest workflow.
2. **GitHub secret actually reaches the job**
  In the run log, find `**Bearer auth: enabled (secret length N chars)`** with **N > 0**.  
  - If the job errors with **empty secret**: add `**VOTD_CRON_SECRET`** under **Settings → Secrets and variables → Actions → Repository secrets** (not Dependabot/Codespaces). If the secret is under **Environments**, uncomment `**environment: …`** in the workflow to match that environment name.  
  - **Empty value after Save** in the UI is normal; GitHub never shows it again.
3. **Same string on Netlify and GitHub**
  **Netlify → Environment variables → `VOTD_CRON_SECRET`** (Production / same contexts you use for live API) must equal the GitHub secret **byte-for-byte** (re-paste both from one password-manager entry if unsure).
4. **Redeploy Netlify after changing env**
  New variables apply to **new function deploys**. Trigger a deploy after saving `VOTD_CRON_SECRET`.
5. **Correct URL**
  Optional secret `**VOTD_PUBLISH_SITE_URL`** must be the origin that hits **this** Netlify site’s API (default `https://app.harvous.com`). Wrong site = wrong function env or 404.
6. **Reproduce with curl (isolates GitHub vs Netlify)**
  From your machine (same secret as Netlify/GitHub):

  | HTTP    | Meaning                                                                                                        |
  | ------- | -------------------------------------------------------------------------------------------------------------- |
  | **200** | Auth OK. Body JSON: `success` / `alreadyPublished`, or business error in JSON.                                 |
  | **401** | `VOTD_CRON_SECRET` missing on Netlify, mismatch, or deploy didn’t pick up env.                                 |
  | **404** | Route/host wrong **or** JSON body says no pool entries (add verses via admin `POST /api/admin/votd/schedule`). |

7. **Pool not empty**
  **404** + message about no unpublished entries means `**VotdSchedule`** needs rows (admin schedule API). Cron only publishes what’s in the pool.
8. **Netlify “Local development (CLI) empty”**
  Does **not** affect production. Only **Production** (and whatever context serves `app.harvous.com`) must have the secret.

## Related code

- `server/routes/votd.ts` — schedule pool, `publish-daily`
- `server/routes/featured.ts` — `POST /api/featured/votd/quick-add`
- `spa/src/components/FeaturedCard.tsx` — `VotdCard` display + fetch for user default

