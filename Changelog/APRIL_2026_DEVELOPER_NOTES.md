# April 2026 — Developer notes

**Coverage:** April 1–13, 2026

This is a learning-oriented summary of substantive themes and commits. It does not replace per-version release bullets in semver-named files in this folder (for example [`1.215.85.md`](1.215.85.md)).

---

## April 2026 Changes — What We Built & Why

70 substantive commits across 13 days, spanning 7 major themes. Version went from `1.215.0` to `1.215.85`.

---

## 1. Easter 2026 Shared-Space Features (Apr 3–4)

**What:** Launched Easter-weekend content as a shared Harvous space with curated threads. The pre-merge commit hardened the "add-to-Harvous" import flow.

**Why:** We wanted a real multi-user feature to ship for Easter — users could pull a curated Easter study space into their own account.

**How:**
- `655dea30` — **"Pre-merge: shared thread import fidelity"**: When a user clicks "Add to Harvous" from a shared thread, the import now copies `ScriptureMetadata`, `ResourceMetadata`, and `NoteScriptureReferences` along with the note body. Previously only raw content transferred. The API's `add-to-harvous` route was updated to return thread `color` and `gradient` so the client could immediately style the thread card without a second fetch.
- `d7143683` — `.gitignore` and `package.json` updated to prepare for Easter branch work.

**Key file:** [`server/routes/featured.ts`](../server/routes/featured.ts) — the `add-to-harvous` endpoint that clones shared items into a user's account.

---

## 2. Mobile Experience Overhaul (Apr 4–6, Apr 12)

**What:** Replaced the custom mobile drawer/sheet with [Vaul](https://github.com/emilkowalski/vaul), integrated [Sonner](https://github.com/emilkowalski/sonner) for toasts, fixed iOS keyboard handling, and polished the mobile dock layout.

**Why:** The hand-rolled bottom sheet had animation glitches and no spring physics. Vaul is Emil Kowalski's production-grade bottom sheet library — it handles drag-to-dismiss, snap points, and the spring feel correctly. Sonner replaced a more brittle toast setup.

**How:**
- `bb5041da` — Installed `vaul` and `sonner`. Created `src/components/ui/drawer.tsx` as a thin wrapper around Vaul's `Drawer.Root / Drawer.Content`. `BottomSheet.tsx` and `MobileNavigation.tsx` were ported to use it.
- `99bc391e / 9b79df86 / 8bd1ceb1` — Three iterative passes on keyboard handling inside the BottomSheet: the core challenge is that on iOS, the virtual keyboard pushes the viewport up and changes `window.innerHeight`. We listen to `visualViewport.resize` and set `padding-bottom` dynamically so the editor toolbar always sits 12px above the keyboard, not buried under it.
- `f0ac8106` — Added `interactive-widget=resizes-content` to the viewport meta tag. This is an underused CSS/HTML hint that tells mobile browsers the viewport should *resize* (not *overlay*) when the on-screen keyboard appears — critical for getting `dvh`/`svh` units right.
- `54678d82` — Refined the mobile dock (the action strip at the bottom): instead of using `env(safe-area-inset-bottom)` inside the dock, the safe-area padding was moved to `.app-layout`'s `padding-bottom` so iOS home-indicator clearance is part of the layout background, not a tall empty slab inside the dock.
- `c10c8b35` — Added a `keyboardProxyRef` in `CardFullEditable`: a zero-size dummy `<input>` that iOS focuses first, then hands off to the Tiptap editor. Without this, iOS sometimes refuses to open the keyboard when a `contenteditable` is focused programmatically.

**Key files:**
- [`src/components/ui/drawer.tsx`](../src/components/ui/drawer.tsx) — Vaul wrapper
- [`src/components/react/CardFullEditable.tsx`](../src/components/react/CardFullEditable.tsx) — keyboard proxy trick

---

## 3. Verse of the Day (VOTD) — Full Feature (Apr 6–12)

**What:** A daily "Verse of the Day" card appears on the dashboard. Harvous admin schedules verses; a GitHub Actions cron publishes them daily. Users can quick-add the verse as a note or dismiss. Engagement awards XP.

**Why:** We wanted a daily touchpoint to draw users back and connect them to Scripture passively. The architecture had to be: (a) editorially flexible (override specific days), (b) automated with zero manual effort for routine days, (c) resilient to cron gaps.

**How (in order):**

**Database (Apr 6):**
[`server/db/schema.ts`](../server/db/schema.ts) gained two new tables:
- `VotdSchedule` — optional admin pins for specific UTC dates (overrides the automated pick)
- `VotdPublishHistory` — one row per published day; `publishForDate()` checks here first so publishes are idempotent

**API routes (Apr 6) — [`server/routes/votd.ts`](../server/routes/votd.ts):**
- `POST /api/admin/votd/publish-daily` — the cron endpoint. Picks a calendar/holiday verse if the UTC date matches a known entry in `votd-calendar.ts`; otherwise picks a random verse from `votd-verses.ts` (skipping any already used this calendar year per `VotdPublishHistory`). Inserts a `FeaturedItems` row so it appears on every user's dashboard.
- `POST /api/admin/votd/schedule` — editorial UI endpoint for pinning a specific verse to a specific day
- `GET/DELETE /api/admin/votd/schedule/:id`

**Authentication hardening (Apr 6–7):**
- The cron endpoint is guarded by `requireVotdAuth` — checks `Authorization: Bearer <VOTD_CRON_SECRET>`. Multiple iterations (`d31369b2`, `9189c4b1`, `bea7069f`) fixed edge cases where the middleware was too strict or not strict enough.
- `3a7dc8fb` — **Critical bug fix**: Netlify's edge proxy was *doubling* the `Authorization` header, producing `"Bearer abc, Bearer abc"`. The token extracted was 135 chars instead of 64, so every cron call returned 401. Fix: `split(',')[0]` before parsing `Bearer`. Applied across `clerkAuth`, `requireVotdAuth`, and admin routes.

**Scheduling (Apr 7–9):**
- `74bacb37` — Moved from a single 11:00 UTC cron to a dual-cron pattern: `23:55 UTC` (pre-midnight publish) + `00:05 UTC` (catch-up run). This ensures the verse is ready when UTC midnight rolls over in many time zones.
- `870077b2` — **Gap recovery**: When migrating to the dual-cron, April 9's verse was never published (the old cron was gone, the new ones already passed). Added a *yesterday backfill*: the 00:05 catch-up now calls `publishForDate(yesterday)` as a fire-and-forget, so any single-day gap auto-heals.

**UI (Apr 6–8):**
- [`spa/src/components/FeaturedCard.tsx`](../spa/src/components/FeaturedCard.tsx) — Redesigned the card to support VOTD-specific actions: "Create Note" (opens scripture note form pre-filled with the reference) and "Close" (dismiss). The "Create Note" path uses the existing `quick-add` API endpoint.
- `a2c931ad` — XP system integration: `awardVotdEngagementXP()` is called when the user creates a note from a VOTD card (not just on close). Tracks via `VotdPublishHistory` so XP is awarded at most once per VOTD item per user.

**Row-level security (Apr 7):**
- `060304c8` — Added `ENABLE ROW LEVEL SECURITY` to `VotdSchedule`, `VotdPublishHistory`, `BibleTranslations`, and `BibleVerses` in [`scripts/enable-rls.sql`](../scripts/enable-rls.sql). Supabase's RLS means even if someone finds the Supabase URL + anon key, they can't read or write these tables without going through the authenticated API.

**Key files:**
- [`server/routes/votd.ts`](../server/routes/votd.ts) — all VOTD endpoints
- [`server/constants/votd-verses.ts`](../server/constants/votd-verses.ts) — curated verse pool
- [`server/constants/votd-calendar.ts`](../server/constants/votd-calendar.ts) — calendar/holiday overrides
- [`spa/src/components/FeaturedCard.tsx`](../spa/src/components/FeaturedCard.tsx) — card UI
- [`.github/workflows/votd-publish-daily.yml`](../.github/workflows/votd-publish-daily.yml) — cron

---

## 4. Keyboard Shortcuts System (Apr 8–12)

**What:** A significant investment in keyboard-first navigation: roving focus between list rows, space switcher via keyboard, erase shortcuts, passthrough handling, and a redesigned Preferences panel documenting all shortcuts.

**Why:** Power users were navigating entirely by mouse even though the app is list-heavy. Good keyboard nav makes it feel like a native app.

**How (in order):**

**Roving focus (`158fe147`):**
- `useListKeyboardRoving` hook moved its `keydown` listener from the container element to `window` with `capture: true`. The old listener only fired when focus was *already inside* the list; the new one fires for any keydown on the page, then checks if a list row link should receive focus. A new utility `isTypingInInput()` guards against triggering during text entry.

**Space switcher shortcut (`3c539b19`):**
- The active-space link in the nav got `data-open-space-switcher-on-enter="true"`. When keyboard roving focuses it and the user presses Enter, instead of navigating to the space, it opens the space switcher panel. This mirrors the Cmd+K style: focus the already-active item → get options.

**Erase shortcut (`8e30f576`):**
- Added a keyboard shortcut to erase (archive) the currently focused note/thread from any list view.

**Passthrough handling (`164539c0` → `bea7069f`):**
- Added then removed a "passthrough" concept for shortcuts that should be forwarded to the browser even when the shortcut handler intercepts them. The `bea7069f` commit removed it after finding it added complexity without solving the real problem (distinguishing editor-focus from app-level focus was enough).

**Shift modifier (`3940542f`):**
- Added `Shift` as a required modifier for some shortcuts (e.g., edit note, open details panel) to avoid accidentally triggering them during normal typing.

**Preferences panel (`00d87d98`):**
- "My Preferences" panel now shows a full shortcut reference table with live key badges, so users can discover keyboard nav without reading docs.

**Dismiss overlay shortcut (`3c9465a3`):**
- `Escape` now consistently closes SpotlightSearch, space switcher, and other overlays. Centralized in the keyboard shortcut handler rather than per-component.

---

## 5. SpotlightSearch Overhaul (Apr 8–12)

**What:** SpotlightSearch (Cmd+K / search icon) was refactored to use the Vaul mobile drawer, gained recent searches with prefetching, and got full-text search on the backend.

**Why:** The mobile search experience was a full-screen overlay with bad focus management. Vaul's bottom drawer is more natural on mobile. Recent searches reduce the time-to-result for common queries.

**How:**

**Mobile drawer integration (`9747ba23`, `b55a7231`):**
- On mobile, SpotlightSearch now renders inside `<Drawer.Root>` (Vaul). On desktop it stays as the existing `cmdk` portal overlay. The component detects viewport width and swaps the shell.
- `b55a7231` — Moved body overflow management (`document.body.style.overflow`) to a `closeMobileDrawer` callback that runs on Vaul's `onClose`, same pattern as `MobileNavigation.tsx`.

**Recent searches (`f01b8e6f`, `d07a8259`):**
- Recent search terms are persisted in `sessionStorage`. When the search panel opens without a query, recent searches are shown as chips.
- `d07a8259` — Added *prefetching*: when the recent searches panel renders, it calls `queryClient.prefetchQuery(searchQueryKey(...))` for each recent term so the results are already in cache when the user taps one.

**Full-text search backend (`5be1d8ae`):**
- Notes and threads now use Postgres FTS (`to_tsvector / to_tsquery`) for queries ≥ 3 chars, combined with an ILIKE fallback for shorter queries or prefix matching.
- Added legacy thread color aliases so old color values stored in the DB normalize correctly when returned in search results.

**Minimum query length (`c09420dd`):**
- A minimum of 1 character is required before the search API fires. Prevents the backend from running a `SELECT` on every keystroke for the empty state.

**Key file:** [`spa/src/components/SpotlightSearch.tsx`](../spa/src/components/SpotlightSearch.tsx)

---

## 6. Note Sorting — lastVisited over createdAt (Apr 12)

**What:** Notes in the unorganized list and across dashboards now sort by `lastVisited` descending, with `updatedAt` and `createdAt` as tiebreakers.

**Why:** `createdAt` sort meant old notes you still use every day sank to the bottom. `lastVisited` surfaces what you actually work with most recently — the same mental model as browser history.

**How (`bf9db959`):**
- [`server/utils/dashboard-data.ts`](../server/utils/dashboard-data.ts) — The SQL `ORDER BY` for unorganized notes changed from `desc(Notes.createdAt)` to:
  ```sql
  CASE WHEN lastVisited IS NOT NULL THEN 0 ELSE 1 END ASC,
  lastVisited DESC, updatedAt DESC, createdAt DESC
  ```
  The `CASE` puts notes that have never been visited (no `lastVisited`) after ones that have, so brand-new notes don't vanish to the bottom.
- The `sortByCreatedAtDesc` import was removed from `dashboard-data.ts` as it was no longer used.

**Also:** `ca2fe496` synced this same `lastVisited`-first sort to the client-side sort utilities in [`src/utils/sorting.ts`](../src/utils/sorting.ts).

---

## 7. Bible Translations — NASB, CSB, AMP, MSG (Apr 12)

**What:** Added four new Bible translations that users can set as their default and that scripture pills use for verse text.

**Why:** Different study traditions prefer different translations. NASB is favored for precision; CSB for readability; AMP for expanded meaning; MSG for paraphrase.

**How (`ca2fe496`):**
- Added four entries to [`src/utils/translations.ts`](../src/utils/translations.ts) with their display names and abbreviations.
- Updated [`server/utils/fetch-verse-text.ts`](../server/utils/fetch-verse-text.ts) to look up verses in `BibleVerses` table for these translations.
- A new script `server/scripts/_download_api_bible.mjs` automates fetching verse data from an API (requires an API key). `npm run bible:generate -- NASB` generates the JSON; `npx tsx server/scripts/seed-bible-verses.ts NASB` imports it.
- Fixed formatting issues in several existing Bible text entries (`8816fce6`) — some translations had extra whitespace or encoding artifacts.

---

## 8. Auto-Tagging Hardening (Apr 7)

**What:** Removed the arbitrary `0.8` confidence threshold from `generateAutoTags`, and added proper error logging.

**Why:** The confidence threshold was filtering out valid tags based on a number that was never tuned. Removing it lets the AI's own judgment stand. The silent `catch {}` was swallowing errors invisibly.

**How (`028dbae6`):**
- `generateAutoTags(title, content, userId)` — removed the `0.8` parameter
- Error handler changed from empty `catch {}` to `console.error('[auto-tag] Failed to auto-tag new note:', newNote.id, err)` — now visible in Netlify function logs
- Logic now only removes-and-reapplies auto-tags if generation succeeds (previously could clear existing tags even on API failure)

---

## 9. Cache Management — Stale Data Fix (Apr 7)

**What:** Added explicit cache-clearing functions that run when a thread or space is deleted.

**Why:** When you deleted a thread, the React Query cache still held the old note/thread data. Navigating back showed a flash of stale content or the deleted item still in the list.

**How (`c8eadc5c`):**
- `clearCachedNoteDetail(noteId)` — removes a specific note from `sessionStorage` cache
- `clearNoteParentThreadCacheByThreadId(threadId)` — removes all notes that belong to a deleted thread
- `clearCachedSpaceBootstrap(spaceId)` — clears the space bootstrap cache when a space is deleted
- `AppLayout.tsx` calls these on the `threadDeleted` and `spaceDeleted` custom events
- `MobileNavigation` and `NavigationColumn` now prune deleted spaces from the "closed spaces" persisted list so the nav rail never shows a ghost link

---

## 10. Scripture Detection & Shared Pages (Apr 4, Apr 8, Apr 11)

**What:** Fixed scripture reference parsing bugs and improved how shared notes/threads render.

**Why:** Some valid scripture references were silently dropped (chapter-only refs, verse ranges). Shared pages were rendering HTML entities literally instead of styled content.

**How:**
- `d39834d1` — Fixed chapter-only parsing (`John 3` without a verse), verse range parsing (`John 3:16-17`), and updated Playwright to use port 4322.
- `956b5c3e` — Added `"Song of Solomon"` as a canonical alias for `"Song of Songs"` in the scripture detector. Both names appear in different translation traditions; the detector now accepts either.
- `0fa2d464` — `SharedNotePage` and `SharedThreadPage` were rendering note content as raw HTML strings. Refactored to use the same `TiptapEditor` (read-only mode) that the main app uses, so scripture pills, links, and formatting render correctly for unauthenticated visitors.

---

## 11. Admin & Infrastructure (Apr 2, Apr 7, Apr 9)

**What:** Migrated agent skill files, hardened admin auth, fixed a profile styling regression.

**How:**
- `4c114b8e` — Agent skill context files moved from `.claude/commands/` to `.claude/skills/` to match the updated agent team structure.
- `1190e548` — Updated admin routes to read credentials from correct env vars (post-environment-variable rename in Netlify).
- `4bb1113b` — The featured items API now blocks local-development requests from hitting production data. A guard checks `NODE_ENV` and the request origin before allowing the admin endpoint.
- `508b681c` — Minor: fixed profile name overflow in `NavigationColumn` (text was clipping on long display names).

---

## Patterns to Notice

1. **Feature layers**: VOTD shows the full stack: DB schema → API route → GitHub Action → UI component → XP system. Each layer is isolated and testable.

2. **Iterative auth hardening**: VOTD auth went through 5+ commits. This is normal for security-critical paths — each edge case (duplicate headers, wrong env var name, local dev leaking to prod) required its own fix.

3. **`sessionStorage` as cache tier**: React Query is the primary cache, but expensive queries (note details, space bootstrap) are also persisted to `sessionStorage` with TTLs. The cache-clearing work this month ensured deletions propagate through both layers.

4. **Window-capture keyboard listeners**: The keyboard shortcut system moved listeners to `window` with `capture: true`. This is a deliberate architectural choice — capture-phase listeners fire before the event reaches any element, giving the global shortcut handler first-mover advantage. It's paired with `isTypingInInput()` to bail out when the user is in an `<input>` or `contenteditable`.

5. **Vaul pattern for mobile drawers**: The `closeMobileDrawer` callback pattern (reset `document.body.style.overflow` on drawer close) is now consistent across `SpotlightSearch`, `MobileNavigation`, and `BottomSheet`. Worth remembering if you add another mobile drawer.
