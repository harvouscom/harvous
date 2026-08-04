# Typecheck debt

**Status:** ratchet in place; cleanup **in progress on `fix/typecheck-debt`**.
**291 → 146** (50% cleared). Suite green (2529 passing) and CI now enforces both.

**Nine real bugs surfaced**, plus a red test suite nobody had noticed. Ranking clusters by
risk rather than by count is what found them:

- Tag dedupe compared timestamps with `Date.parse(row.createdAt)` on a value that is a
  `Date`. The coercion goes through `toString()`, which has *second* precision, so tags
  created in the same second tied and fell through to id ordering.
- `connectedChurchAt` passed a preserved ISO string straight into a `ts()` (Date) column.
  Its unit test agreed with the wrong shape because the test's own mock stubbed
  `nowISO()` as a string.
- **`invalidateUserCache` never invalidated anything.** It stamped `clerkDataUpdatedAt`
  with `new Date(0).toISOString()`; Drizzle's date-mode mapper is
  `(value) => value.toISOString()`, so the string threw `TypeError` on every call. Both
  callers catch, so nothing 500'd — the app just kept serving stale Clerk name/email/
  avatar after a `user.updated` webhook until the TTL expired.

Both had a passing test suite over them. Wrong annotations here don't just hide errors —
they teach the tests the wrong shape.

`tsc --noEmit` originally reported **291 errors across 118 files**. Nothing ran it, so
those errors were invisible — and not harmless. Two shipped bugs found during the Aug 2026
reliability pass were already sitting in that output:

- `PrototypeSidebar` read `p.items` from a page whose field is `notes`, so `myHomeNotes`
  became `[undefined]` and `myHomeNotesById` threw.
- Home's readiness call passed five settled-flags its parameter type didn't declare. TS
  flagged the excess properties; all five were silently discarded at runtime, which is why
  Home painted before its data was ready and visibly jumped.

### The nine

| Bug | Impact |
|---|---|
| Tag dedupe `Date.parse` on a `Date` | Second-precision ties → wrong tag kept |
| `connectedChurchAt` preserved as a string | String written into a Date column |
| `invalidateUserCache` throwing | Stale Clerk profile served after every webhook |
| `clampReferenceToMaxVerseSpan` → `undefined` | VOTD references skipped normalization |
| `Date.localeCompare` in admin cleanup | Both cleanup endpoints 500 exactly when there are duplicates |
| Missing `isFetched` in the sidebar | Settled-empty Home fell back to loading dots on every refetch |
| `.books` read off an array | My Home cross-space search never returned a scripture result |
| `passage` omitted from the report rollup | Season/year reports silently dropped Passage metrics |
| `<AccountMenu />` missing `iconSize` | Admin toolbar orb 20px instead of 17px |

And the suite itself: `scripture-translation-live-consume.test.ts` imported a symbol that
has **never existed in git history**, so two tests for a real feature had never executed
while appearing to cover it. `append-owned-space-nav-cache.test.ts` asserted a flag value
that was deliberately changed with a documented rationale and never updated.

Every one of these sat under a green — or assumed-green — suite.

## What's in place now

**CI** (`.github/workflows/ci.yml`) runs `npm run test:run` and `npm run typecheck:ratchet`
on every PR and push to `main`. Before it existed, nothing ran either automatically — all
other workflows are content/cron jobs and the only installed git hook is `post-commit` — so
`npm run precommit` was a convention nothing invoked. That is the single most important
change here: the cleanup is only durable because something now enforces it.

`npm run typecheck:ratchet` records a per-file baseline in
`scripts/typecheck-baseline.json` and fails when any file's error count *increases*, or a
clean file gains its first error. Fixing errors is always allowed; run
`npm run typecheck:baseline` to lock in an improvement.

Per-file rather than a total, so trading a fixed error in one file for a new one in
another still fails.

Cost: the ratchet runs `tsc`, which takes ~60–90s. It is in both `precommit` and CI; if the
local cost is annoying, drop it from `precommit` and rely on CI.

## Cleanup plan, by root cause

Work down by cause, not by file — a fifth of the total is one fix. Re-baseline after each.

| # | Root cause | Errors | Status |
|---|---|---|---|
| 1 | Router `to=` route literals | 54 | **Done.** The shell is mounted twice over and which one exists is a *runtime* host decision, so TS infers one tree (the `/prototype`-prefixed one) while the helpers returned the honest union of both. Helpers now declare the prefixed literal and cast, reasoning documented once in `src/lib/prototype-path.ts`. `prototypeHomeRouteTo()` also returned a `/prototype/` that was never a registered route. 18 now-redundant `as any` casts came out with it. |
| 2 | Missing type imports | 17 | **Done.** `FolderBucket`, `StudyThreadClusterEdge`, and vitest globals. Types are erased so none were runtime bugs, but each turned off checking exactly where it was requested — including in `PrototypeSidebar`, the file whose `p.items` typo shipped a crash. |
| 3 | `Date` vs `string` on Drizzle `ts()` columns | ~19 | **Done.** See the three bugs above. Recipe that worked: make the type say `Date`, normalize through `toDate()` at the boundary, then re-run — an honest type surfaces the *next* offender, which is how the invalidateUserCache bug appeared. Check test mocks too; one was stubbing `nowISO()` as a string. |
| 4 | Test fixtures missing required fields (`TS2353`) | ~19 | **Remaining.** Mechanical. Concentrated in `study-dock-layout.test.ts` (15) and `prototype-format-toolbar-selection.test.ts` (6). No production impact. |
| 5 | Property does not exist (`TS2339`) | ~10 left | **Mostly done** — this cluster yielded 3 of the 9 bugs. Remainder is case by case — the class most likely to contain genuine bugs, since it means code reads a field the type says isn't there. Worth reading rather than batch-fixing. |
| 6 | Long tail | remainder | **Remaining.** `server/routes/migrations.ts` (9), `offline-mutations.ts` (8), `admin-cleanup-duplicates.ts` (8), `TiptapEditor.tsx` (12), scattered `TS2345`. |

Current split: **47 in tests, 99 in production**, across 78 files — 50 of which hold a
single error each.

Note `nowISO` is an alias for `now()` and returns a **Date**, not an ISO string. The
name has misled at least two call sites and one test mock; renaming it is probably
worth doing as part of this cleanup.

### What's left, and whether to chase it

The high-value work is done: every known bug is fixed and the clusters that cleared 5+
errors per edit are spent. The residue is genuinely cosmetic — mostly test fixtures
(`study-dock-layout.test.ts` alone is 15) and structural-typing friction in `TiptapEditor`
(12), where Tiptap's own module augmentation and ProseMirror's `Attrs` are the source.

Diminishing returns start here. Fixing the rest is worthwhile only as a route to deleting
the ratchet in favour of a plain `tsc --noEmit` gate — a real simplification, but no longer
a bug hunt. Do it opportunistically, or in one dedicated pass when someone wants the
simpler gate.

Once the count reaches zero, replace the ratchet with a plain `tsc --noEmit` gate and
delete `scripts/typecheck-baseline.json`.
