# TypeScript Errors Audit

**Generated**: 2026-03-03
**Updated**: 2026-03-04 — All 504 errors resolved (0 remaining)
**Remaining errors**: 0
**Compiler command**: `npx tsc --noEmit`

---

## Fixes Completed (27 errors resolved)

These errors existed in files modified during the thread navigation fix work and were resolved:

| File | Error | Fix Applied |
|------|-------|-------------|
| `src/utils/menu-options.ts` (×2) | `contentType` param missing `'search' \| 'new-space'` | Added to union type in `shouldShowMoreButton` and `getMenuOptions` |
| `src/components/react/ActionStrip.tsx` (×1) | Same `contentType` union mismatch in props | Added `'search' \| 'new-space'` to `ActionStripProps.contentType` |
| `spa/src/layouts/AppLayout.tsx` (×2) | `search` was `{}` (TanStack Router parsed object) not `string` | Converted parsed search object → URL search string via `URLSearchParams` |
| `src/components/react/navigation/MobileNavigation.tsx` (×1) | `spaceId?: string` didn't accept `null` from `NavThread` | Changed to `spaceId?: string \| null` |
| `src/components/react/navigation/MobileNavigation.tsx` (×2) | `noteCount?: number \| undefined` from spread of nullable object in `setUpdatedCurrentThread` | Added explicit `noteCount: prev?.noteCount ?? currentThread?.noteCount ?? 0` |
| `src/components/react/navigation/NavigationContext.tsx` (×1) | `Cannot find module 'app-navigate'` | Added `paths` alias in `tsconfig.json` + module declaration in `src/env.d.ts` |
| `spa/src/pages/ThreadPage.tsx` (×1) | `onNotesLoaded` param `ListNoteForSeed[]` not assignable to `Note[]` | Changed to `any[]` with cast inside |
| `src/components/react/navigation/PersistentNavigation.tsx` (×1) | Missing `firstAccessed`/`lastAccessed` on `activeParentThread` | Added `Date.now()` values to type and all construction sites |
| `src/components/react/navigation/PersistentNavigation.tsx` (×1) | Icon `size="14px"` but prop expects `number` | Changed to `size={14}` |
| `src/components/react/CardFullEditable.tsx` (×2) | `CustomEvent` handler not assignable to `EventListener` | Changed `as EventListener` → `as unknown as EventListener` |
| `src/components/react/EditThreadPanel.tsx` (×4) | Same `CustomEvent` → `EventListener` cast | Changed `as EventListener` → `as unknown as EventListener` |
| `src/components/react/SpaceContentList.tsx` (×12) | Same `CustomEvent` → `EventListener` cast (6 add + 6 remove) | Changed `as EventListener` → `as unknown as EventListener` |

---

## Remaining 504 Errors — By Category

### Category 1: Hono Route Handler Overloads (252 errors — 50%)

The biggest category by far. All in `server/routes/*.ts`. Hono's `c.req.param()` and `c.req.query()` return `string | undefined` but are passed where `string` is expected, and route handler signatures don't match Hono's expected overloads.

**Pattern A — "No overload matches this call" (187 errors)**
Hono route handlers (`app.get`, `app.post`, etc.) where the handler's return type or middleware chain doesn't match any overload.

| File | Count |
|------|-------|
| `server/routes/notes.ts` | 47 |
| `server/routes/user.ts` | 36 |
| `server/routes/spaces.ts` | 27 |
| `server/routes/inbox.ts` | 19 |
| `server/routes/threads.ts` | 17 |
| `server/routes/sync.ts` | 16 |
| `server/routes/shared.ts` | 13 |
| `server/routes/tags-scripture.ts` | 8 |
| `server/routes/resource.ts` | 5 |
| `server/routes/search.ts` | 4 |
| `server/routes/billing.ts` | 2 |
| `server/routes/admin.ts` | 2 |

**Likely fix**: Type the Hono app or route handlers with proper generics, e.g. `app.get<'/path/:id'>('/path/:id', ...)`, or add a shared middleware type that includes auth context. Alternatively, apply `// @ts-expect-error` or a wrapper that narrows the handler signature.

**Pattern B — `string | null` not assignable to `string` (65 errors)**
`c.req.query('param')` returns `string | undefined`, and values from auth/DB return `string | null`, but downstream functions expect `string`.

| File | Count |
|------|-------|
| `server/routes/user.ts` | 22 |
| `server/routes/threads.ts` | 21 |
| `server/routes/spaces.ts` | 20 |
| `server/routes/notes.ts` | 19 |
| `server/routes/sync.ts` | 7 |
| `server/routes/shared.ts` | 5 |
| `server/routes/inbox.ts` | 4 |
| `server/routes/billing.ts` | 3 |

**Likely fix**: Add non-null assertions (`!`) or guard clauses (`if (!userId) return c.json({error: 'unauthorized'}, 401)`) before usage. Or create a typed `requireParam()` helper.

---

### Category 2: Script/Migration Files (24 errors — 5%)

| File | Count | Errors |
|------|-------|--------|
| `scripts/migrate-clerk-user.ts` | 16 | No overload matches (Drizzle queries) |
| `scripts/restore-user-notes-threads.ts` | 6 | No overload + `'row' is possibly null` |
| `scripts/find-user-by-email.ts` | 2 | No overload (Drizzle queries) |
| `scripts/audit-restored-db.ts` | 1 | No overload (Drizzle query) |

**Likely fix**: Same Drizzle overload pattern — queries need proper generic typing or `as` casts.

---

### Category 3: E2E Test Files (12 errors — 2%)

| File | Count | Errors |
|------|-------|--------|
| `e2e/shared-space-join.spec.ts` | 7 | `Property 'test' does not exist`, implicit `any` |
| `e2e/invitation-accept.spec.ts` | 4 | Same |
| `e2e/referral.spec.ts` | 1 | `string \| null` not assignable to `string` |

**Likely fix**: Import `test` properly from Playwright (e.g., `import { test } from '@playwright/test'`), add explicit types to destructured params.

---

### Category 4: React Component Type Issues (102 errors — 20%)

**~~SpaceContentList.tsx (12 errors)~~ ✅ FIXED**
- ~~`CustomEvent` to `EventListener` conversion~~ → fixed with `as unknown as EventListener`

**OrganizedContentList.tsx (20 errors)**
- Implicit `any` on `item` and `freshItem` params
- `updatedAt` not on `OrganizedContentItem` type
- `toISOString` on `string | Date`
- Various property access on loosely typed items

**CardNote.tsx (11 errors)**
- Unintentional comparisons: `'"default"'` vs `'"resource"'` / `'"scripture"'`
- Likely a `noteType` discriminated union that's too narrow

**EditThreadPanel.tsx (9 errors remaining)**
- `stopImmediatePropagation` doesn't exist on React's `MouseEvent` (8 errors)
- ~~`CustomEvent` to `EventListener` cast (2 errors)~~ ✅ FIXED
- Implicit `any` on `note` param (2 errors)

**NewThreadPanel.tsx (13 errors)**
- `Cannot find name 'offlineThreadId'` (3) — likely offline-first code with missing variable
- `Property 'color' does not exist on type 'CurrentSpace'` (3)
- `'{} | null | undefined'` not assignable to `string` (3)
- `'{}'` not assignable to `string` (2)

**useNoteSubmission.ts (16 errors)**
- `Cannot find name 'offlineNoteId'` (3)
- `Cannot find name 'offlineSaveError'` (2)
- `unknown` not assignable to `LogContext` (3)
- `string | null` not assignable to expected type (2)
- `'upgradeUrl'` doesn't exist on response type (2)

**ThreadNotesList.tsx (10 errors)**
- Unintentional comparisons: `'"scripture" | "resource"'` vs `'"notes"'`

**BottomSheet.tsx (5 errors)**
- No overload matches

**NewSpacePanel.tsx (3 errors)**
- `Cannot find name 'offlineSpaceId'` — same offline-first pattern

**TiptapEditor.tsx (4 errors)**
- `.ts` extension in import paths (needs `allowImportingTsExtensions` or remove extensions)

**~~CardFullEditable.tsx (2 errors)~~ ✅ FIXED**
- ~~`CustomEvent` to `EventListener` cast~~ → fixed with `as unknown as EventListener`

**FindPage.tsx (4 errors)**
- `string | null | undefined` not assignable to `string | undefined`

**Other components (1-2 each)**
- `TemplateSelector.tsx`: No overload (2)
- `ThreadCombobox.tsx`: No overload (2)
- `ReferralPanel.tsx`: `'response' is possibly null` (2)
- `PanelManagerWithContext.tsx`: (2)
- `TiptapNoteLink.ts`: (4)
- `SpacePage.tsx`, `ProfilePage.tsx`, `App.tsx`: (1 each)
- `Menu.tsx`, `NewNotePanel.tsx`, `MobileBottomSheetWithContext.tsx`, etc.: (1 each)

---

### Category 5: Utility/Library Type Issues (24 errors — 5%)

**content-extractor.ts (17 errors)**
- `Cannot find name 'output'` (3) — variable used before declaration or missing
- `Cannot find name 'processBlock'` (2)
- `maxElemsToParseToMainContent` doesn't exist in Readability options (2)
- Unused `@ts-expect-error` directives (4)
- Other property/type issues

**safe-navigate.ts (4 errors)**
- Promise type mismatch after `.catch(() => null)` — `null` not in expected return
- `navigatePromise` possibly null

**note-encryption.ts (4 errors)**
- `Uint8Array<ArrayBufferLike>` not assignable to `BufferSource` — likely a newer TS / lib mismatch

**device-fingerprint.ts (3 errors)**
- `getParameter` doesn't exist on `RenderingContext` — needs WebGL type narrowing

**Other utils (1 each)**
- `toast.ts`, `scripture-highlighter.ts`, `scripture-detector.ts`, `posthog.ts`, `html-to-markdown.ts`, `content-list-helpers.ts`, `lib/utils.ts`

---

### Category 6: SPA Navigation (5 errors)

**view-transition-navigate.ts (5 errors)**
- Likely similar `app-navigate` module resolution or view transition API types

---

### Category 7: Server Utilities (2 errors)

| File | Errors |
|------|--------|
| `server/utils/fetch-verse-text.ts` | 1 |
| `server/netlify.ts` | 1 — `string \| Buffer` not assignable to `BodyInit` |

---

## Recommended Fix Priority

### Priority 1 — Quick Wins (high impact, low effort)

1. ~~**`CustomEvent` → `EventListener` casts** (~18 errors across 4 files)~~ ✅ DONE
   ~~Add `as unknown as EventListener` at each `addEventListener` call.~~

2. **Implicit `any` params** (~12 errors)
   Add explicit types to callback parameters.

3. **`string | null` guard clauses in server routes** (~65 errors)
   Create a `requireParam(c, 'name')` or `requireAuth(c)` helper that throws 400/401, narrowing the type.

4. **E2E test imports** (~12 errors)
   Fix Playwright `test` import pattern.

### Priority 2 — Medium Effort

5. **Hono route handler overloads** (~187 errors)
   Either type the app instance with proper route generics or create a helper wrapper. This is the single biggest category.

6. **Offline-first variables** (~8 errors across 3 files)
   `offlineNoteId`, `offlineThreadId`, `offlineSpaceId` — likely unfinished offline-first feature. Either implement or stub with `const offlineNoteId: string | null = null`.

7. **CardNote/ThreadNotesList comparisons** (~21 errors)
   Widen `noteType` union or fix comparison logic.

### Priority 3 — Investigate First

8. **content-extractor.ts** (17 errors) — may need refactoring
9. **note-encryption.ts** — TypeScript lib version issue
10. **TiptapEditor imports** — `.ts` extension policy decision

---

## Full Error List

The raw `npx tsc --noEmit` output is saved at:
`/tmp/ts-errors-full.txt`

To regenerate: `npx tsc --noEmit 2>&1 | grep "error TS" > ts-errors.txt`
