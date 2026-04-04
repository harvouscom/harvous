# Easter 2026 shared space (Harvous Admin)

Curated public space content for a mixed audience (new to Jesus and long-time believers). **Phase A** is the reviewable draft; **Phase B** publishes via admin API under `HARVOUS_SYSTEM_USER_ID`.

## Files

| File | Purpose |
|------|---------|
| [DRAFT_V1.md](./DRAFT_V1.md) | Human-readable v1 spec (space, thread, all notes, bibliography) |
| [APPROVAL.md](./APPROVAL.md) | Approver checklist and sign-off block |
| [SIGNOFF.template.txt](./SIGNOFF.template.txt) | Copy to `SIGNOFF.txt` after approval (see below) |
| [publish-payload.json](./publish-payload.json) | Space, thread, featured config, and ordered note file list |
| [EXAMPLE_PUBLISH_OUTPUT.json](./EXAMPLE_PUBLISH_OUTPUT.json) | Sample IDs from a successful local run (not production) |
| [PUBLISHED_NOTE_MAP.json](./PUBLISHED_NOTE_MAP.json) | Maps each `contentFile` → existing `note_…` id for `easter:sync-notes` |
| `notes/*.html` | TipTap-compatible HTML bodies (same pattern as onboarding notes) |

## Reload note HTML into an existing thread (no new publish)

After you change `notes/*.html` or titles/types in `publish-payload.json`, **Postgres does not update until you push again**. Use:

```bash
npm run easter:sync-notes
```

Prerequisites: `.env` with `SUPABASE_DATABASE_URL` and `HARVOUS_SYSTEM_USER_ID` pointing at the **same** project that owns the Easter notes; [PUBLISHED_NOTE_MAP.json](./PUBLISHED_NOTE_MAP.json) must list the real `note_…` ids for that environment (production ids differ from [EXAMPLE_PUBLISH_OUTPUT.json](./EXAMPLE_PUBLISH_OUTPUT.json) unless you published there).

Options:

- `--dry-run` — Validate files and map; no DB writes.
- `--skip-scripture` — Update titles/content/types only; skip `processScriptureReferences` (faster if you only changed non-ref HTML).

Then **hard refresh** the thread page (e.g. Cmd+Shift+R) so the browser drops stale cached API responses.

**Dev only — featured join card:** If you dismissed the Easter featured card locally and want it to show again, `POST /api/test/reset-featured` with your Clerk `userId` clears dismissals (see [AGENTS.md](../../AGENTS.md) test routes). That does **not** change note bodies; it only affects whether the dashboard card reappears.

## Why edits to `publish-payload.json` don’t show in the app

- **Titles, colors, and note HTML** live in **Postgres** after you run `easter:publish`. Changing files in this folder does **not** update existing rows.
- **List order (oldest → newest)** is **application code** (`dashboard-data`, `SpaceContentList`, `ThreadNotesList`). You must run a **fresh build** of the SPA/API (or `npm run dev`) and reload; production needs a **deploy**.

To refresh metadata on an **existing** space/thread (same IDs, same share link), run **`npm run easter:patch-metadata`** (see below).

## Publish (after human approval)

1. Complete theological/editorial sign-off in [APPROVAL.md](./APPROVAL.md).
2. Copy `SIGNOFF.template.txt` → `SIGNOFF.txt` and set the first line to `APPROVED_FOR_PUBLISH` (this file is gitignored).
3. Ensure `.env` has `HARVOUS_ADMIN_SECRET` and `HARVOUS_SYSTEM_USER_ID` (see [.env.example](../../.env.example)).
4. Run API locally (`npm run dev:api`, port **3001**) or set `EASTER_PUBLISH_API_BASE` to your deployed API origin.
5. Run:

```bash
npx tsx scripts/publish-easter-2026-shared-space.ts
```

Options:

- `--validate-only` — Check payload, title lengths (≤50 for notes), and HTML files; no network.
- `--dry-run` — Print the requests that would be sent; no `SIGNOFF.txt` required; no network.
- `--no-featured` — Skip `POST /api/admin/featured`.

6. Copy printed IDs into `.claude/agents/marketing.context.md` (Admin-Owned Resources / Active Featured Items) and keep [PUBLISH_OUTPUT.template.md](./PUBLISH_OUTPUT.template.md) as a scratch pad if you prefer not to edit context immediately.

## Patch metadata only (existing space — no new publish)

When you already published once and only need **space title/color**, **thread title/color**, and optionally **featured card** copy to match the latest payload:

```bash
EASTER_PATCH_SPACE_ID=space_xxx \
EASTER_PATCH_THREAD_ID=thread_yyy \
EASTER_PATCH_FEATURED_ID=optional-uuid \
npm run easter:patch-metadata
```

IDs from your last run are echoed by the publish script and in [EXAMPLE_PUBLISH_OUTPUT.json](./EXAMPLE_PUBLISH_OUTPUT.json). Requires `HARVOUS_SYSTEM_USER_ID` and DB URL in `.env`; only updates rows owned by the system user.

**If the UI still shows the old thread name:** confirm you patched the **same** `thread_…` id as in the DB, then **hard refresh** (e.g. Cmd+Shift+R) or close/reopen the tab. Until a recent fix, thread/space bootstrap responses were HTTP-cached for up to a few minutes; production needs a deploy of that API change.

**Join URL host:** `POST /api/admin/spaces` returns `joinUrl` using the API request origin. For local dev on port 3001, that link shows `http://localhost:3001/...` — users normally open join from your **deployed** site. For production, set `EASTER_PUBLISH_API_BASE` to your live API origin (e.g. `https://harvous.com`) so `joinUrl` matches what you share.

## Evidence framing

Draft copy follows the plan: **history and textual sources first**; science only where it legitimately applies. The resurrection is not framed as a repeatable lab result.

## Admin scripture caveat

`POST /api/admin/threads/:threadId/notes` does not run `processScriptureReferences`. After publish, run **`npm run easter:sync-notes`** on an existing thread to refresh HTML and run scripture processing, or trigger **Process scripture** from the app on each note as the system user.
