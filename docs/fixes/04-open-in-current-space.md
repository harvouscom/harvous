# Open in current/active space — fixes attempted and what still needs fixing

## Implemented (single source of truth, v1.216)

The following shipped to align **space context** with **links** and **layout** (see `src/utils/current-space-for-links.ts`):

- **Shared helper** `getSpaceIdForPersistentNavLinks` / `appendSpaceQueryParam` — URL `?space=` first, then `/space/...` path, then `effectiveSpaceIdForLinks` from `NavigationColumn`, then `getSelectedSpaceId()`. Left nav omits `?space=` on `/` and `/dashboard` only (avoids stale storage on Home nav).
- **PersistentNavigation** + **MobileNavigation** use the helper; **NavigationColumn** passes `effectiveSpaceIdForLinks`.
- **AppLayout** derives `currentSpace` from URL `?space=` on thread/note before falling back to the thread’s canonical `spaceId`.
- **OrganizedContentList** (My Home) and **Dashboard** search (**SearchResultsList** with `spaceIdForLinks`) append `?space=` from the selected space.
- **Search** on space/thread routes uses router path + search with the same helper; **Spotlight** uses the helper (and `getSelectedSpaceId()` on Home).
- **Breadcrumb** navigation (`navigation-breadcrumb.ts`) preserves space on programmatic navigations.

Remaining gaps worth occasional audit: inline note links in the editor, ActionStrip / Menu redirects, panels that build `idToUrl` without the helper, and any legacy `persistent-navigation.js` if it is ever loaded.

## Original problem

1. **Opens in last space:** Clicking a thread or note in the nav opens it in the space it was last opened in (or the thread's "home" space), instead of the **current/active space** (the one selected in the space switcher or implied by the current URL).
2. **Doesn't open right away:** After some changes, items sometimes didn't open immediately (delay or different navigation behavior).

---

## What was tried (in order)

### 1. PersistentNavigation: use current space for link (first plan)

- **Change:** In `getThreadHrefWithSpace()`, stop using `(item as any).spaceId ?? selectedSpaceId` and use `selectedSpaceId` first, then override with URL `?space=` if present.
- **Intent:** Build nav links with the current/active space so clicking opens in the space the user is in.
- **Result:** User reported it made things worse (didn't open right away, still opened in last space).

### 2. Pass effective space from NavigationColumn to PersistentNavigation

- **Change:** NavigationColumn passes `effectiveSpaceIdForLinks={effectiveSelectedSpaceId}` to PersistentNavigation. PersistentNavigation uses `effectiveSpaceIdForLinks ?? selectedSpaceId` when building the link (and still URL `?space=` override).
- **Intent:** Use the same "current space" the parent has (route then storage) so the link isn't stale or null on first paint.
- **Result:** Same issues persisted.

### 3. NavigationColumn: don't overwrite selected space when URL has `?space=`

- **Change:** In the effect that syncs "selected space" to the content's space (thread's `spaceId`) when on a thread/note page, skip that sync when the URL already has `?space=` (so we don't overwrite the user's explicit space with the thread's space).
- **Intent:** After opening `/thread/xxx?space=space_B`, keep selected space as Space B instead of flipping to the thread's space.
- **Result:** Still same issues.

### 4. Dashboard list: add `?space=` to links (OrganizedContentList + DashboardPage)

- **Change:** OrganizedContentList accepts `effectiveSpaceIdForLinks`; when set, thread/note hrefs get `?space=<effectiveSpaceIdForLinks>`. DashboardPage uses `useSelectedSpaceId()` and passes it as `effectiveSpaceIdForLinks`.
- **Intent:** Clicking a thread/note from the dashboard (My Home) opens it in the currently selected space.
- **Result:** Still same issues.

### 5. AppLayout: derive currentSpace and contextSpaceId from URL `?space=` (research-backed plan)

- **Change:** In AppLayout:
  - Derive `urlSpaceIdForContext` from `search` when on thread/note (`?space=`), else from path when on `/space/xxx`.
  - Set `currentSpace` to `spaceId ?? urlSpaceIdForContext ?? activeThread?.spaceId` (with lookup in `allSpaces`).
  - Set `contextSpaceId` to use `urlSpaceIdForContext` first on thread/note, then fall back to thread's/parent's `spaceId`.
- **Intent:** When the user opens `/thread/xxx?space=space_B`, the layout treats "current space" and context as Space B, not the thread's space, so nav and panels show the right space.
- **Result:** User undid all changes; same issues were still happening.

### 6. PersistentNavigation: client-side navigation on link click

- **Change:** Add `onClick` on the nav `<a>` that calls `preventDefault()`, `stopPropagation()`, and `safeNavigate(validHref, { history: 'push' })`. Kept `href={validHref}` for accessibility/open-in-new-tab.
- **Intent:** Use in-app router navigation so the transition is immediate and the href is the one from the current render.
- **Result:** Implemented together with (5); user reverted everything.

---

## What we didn't fully verify

- **Where the user clicks from:** Left nav (PersistentNavigation) vs dashboard list (OrganizedContentList) vs mobile nav vs another entry point. That changes which code path builds the URL.
- **Exact URL after click:** Whether the browser/router actually had `?space=` in the URL when the thread/note page loaded (could be stripped by redirect, router config, or another script).
- **Whether persistent-navigation.js runs in their environment:** The SPA `index.html` we checked doesn't load it, but a different build or deployment might. That script replaces the React nav with its own DOM and builds links with `_idToPath(item.id)` only (no `?space=`).
- **Timing of `selectedSpaceId` / `effectiveSpaceIdForLinks`:** On first paint or before storage hydrates, these can be null, so links could be built without `?space=` until the next render.
- **Router behavior:** Whether TanStack Router preserves `search` when navigating to `/thread/$threadId` (path only) and whether anything strips query params.

---

## What still needs to be fixed

1. **Single source of "current space" for opening**
   - Every place that builds a thread/note URL (nav, dashboard list, breadcrumbs, search, etc.) should use the same rule: **current space = URL `?space=` if on a page that has it, else selected space from storage/switcher.** No use of the thread's `spaceId` or "last opened" when building the link.

2. **Layout must respect URL `?space=` on thread/note**
   - When on `/thread/xxx` or `/note/yyy`, if the URL has `?space=space_B`, the layout's `currentSpace` and `contextSpaceId` (and anything derived from them) must be Space B, not the thread's/parent's `spaceId`. Otherwise the app "flips" to the thread's space as soon as the page loads.

3. **Don't overwrite selected space from URL**
   - When landing on a thread/note URL that has `?space=`, the logic that syncs "selected space" from the content (thread's space) must **not** run, so we don't overwrite storage with the thread's space.

4. **Reliable "open right away"**
   - Either:
     - Use programmatic navigation (e.g. `router.navigate(fullHref)` or `safeNavigate(fullHref)`) for nav links so the app uses the same transition and the target is computed at click time, or
     - Confirm that plain `<a href>` navigation keeps `?space=` in the URL and that no script or redirect strips it.

5. **Verify all entry points**
   - Audit every place that can navigate to a thread or note (left nav, mobile nav, dashboard list, SpaceContentList, breadcrumbs, search results, note links in content, Menu/ActionStrip redirects) and ensure each uses "current space" (URL then selected) for `?space=` when building the URL.

6. **Optional: persistent-navigation.js**
   - If that script is ever loaded (e.g. in another build or platform), update it to append `?space=<currentSpaceId>` when building thread/note links, using the same "current space" rule (e.g. from URL or a known storage key).

---

## Suggested next steps

1. **Reproduce with logging:** Add temporary logs when building nav links (PersistentNavigation, OrganizedContentList) and when deriving currentSpace/contextSpaceId (AppLayout): log the chosen space and the final URL. Reproduce the "opens in last space" and "doesn't open right away" flows and capture what values are used and what URL is actually navigated to.
2. **Re-apply layout fix only:** Re-apply just the AppLayout change (derive `currentSpace` and `contextSpaceId` from URL `?space=` on thread/note). Test in isolation to confirm the layout no longer flips to the thread's space when the URL has `?space=`.
3. **Re-apply link-building fixes one by one:** Re-apply PersistentNavigation (effectiveSpaceIdForLinks, no item.spaceId), then NavigationColumn (don't overwrite when URL has `?space=`), then dashboard list, then client-side navigate — testing after each step to see which combination fixes "opens in last space" and "doesn't open right away."
4. **Check production/deployed build:** Confirm which scripts are loaded in the deployed SPA (e.g. whether persistent-navigation.js is included) and that the built assets include the latest nav and layout code.
