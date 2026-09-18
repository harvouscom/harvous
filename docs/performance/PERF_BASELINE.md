# Performance Baseline

Current numbers, how each was measured, and how to reproduce them. Owned by `/engineer`.

**Last measured:** 2026-08-13 (payload table) · 2026-09-04 (request count) · 2026-09-18 (payload 1073.8 KB gz, `perf:check`)

> Two older documents used to live here and now sit in `docs/archive/`:
> `PERFORMANCE_OPTIMIZATION_LESSONS.md` and `PWA_INITIAL_LOAD_OPTIMIZATIONS.md`. Both instruct the
> reader to edit `src/layouts/Layout.astro` and choose Astro `client:*` directives. Astro was
> removed; production is the Vite SPA plus the Hono API. They are history, not advice.

---

## Initial payload

Everything `dist-spa/index.html` declares before it can paint: the entry script, its
`modulepreload` siblings, and the stylesheet. This is what a user waits for on **every** route,
including sign-in.

**1078.4 KB gzipped across 7 assets.**

| Asset | gzip | raw |
|---|---|---|
| `index.js` | 703.7 KB | 2570.0 KB |
| `index.css` | 127.7 KB | 845.7 KB |
| `tiptap.js` | 117.8 KB | 372.0 KB |
| `react-vendor.js` | 59.5 KB | 190.4 KB |
| `clerk.js` | 27.9 KB | 100.1 KB |
| `router.js` | 28.4 KB | 87.4 KB |
| `query.js` | 13.4 KB | 45.2 KB |

**Reproduce:**

```bash
npm run build:spa && npm run perf:check
```

The budget lives in `scripts/perf-budget.json` and is enforced by `scripts/check-perf-budget.mjs`,
which CI runs as the `bundle-budget` job. It is a ratchet: growth past the recorded number fails,
shrinking is always allowed. `npm run perf:baseline` rewrites it — do that only after a genuine
improvement, or alongside a stated reason in the commit message.

### Why this is gated rather than documented

`docs/route-based-code-splitting.md` recorded the main bundle at 1.6 MB raw and laid out a plan to
shrink it. Nothing enforced the number. It reached **2.57 MB**. In the single week between the
Aug 6 build and the Aug 13 rebuild, the initial payload grew **94 KB gzipped** (1009.7 → 1080.5 KB)
with no one intending it to.

---

## Known headroom

Unattacked as of this baseline, in rough order of size:

1. **`index.js` at 703.7 KB gzipped.** Core prototype routes — Home, note, thread — are not lazy.
   Only settings, admin and dev routes are (`spa/src/router.tsx` uses `lazyRouteComponent` there).
   `TiptapEditor.tsx` alone is 10,822 lines.
2. **`index.css` at 127.7 KB gzipped / 845.7 KB raw**, one render-blocking stylesheet.
3. **TipTap `modulepreload`ed on every route** — 117.8 KB gzipped fetched before the sign-in screen
   paints, for an editor only note routes use. `docs/route-based-code-splitting.md` Step 2 called
   this out and it was never done.

### Follow-ups ranked — 2026-09-18

From an app-wide design and performance audit. The quick wins shipped (see "Fixed"); these
are what it found and left, largest felt payoff first. Each was verified by reading the code.

1–4 of the original list are done (see "Fixed"): the lazy note page, the font, and optimistic
highlights. Route CSS out of the entry stylesheet is still open:

1. **Route CSS out of the entry stylesheet.** `main.tsx` imports ~180 KB raw for routes that are
   already lazy (`upgrade-page.css` is free) or trivially could be (auth, shared, join pages).
5. **Full-document `editor.getHTML()` on every keystroke** (`TiptapEditor.tsx` `onUpdate`), plus
   two whole-string regex passes, then the same canonicalisation again in
   `CardFullEditable.handleContentChange`. The rAF below it coalesces the parent render, not
   the serialisation.
6. **Flipping days in Activity refetches `fingerprints`, `crossref-gaps` and
   `connect-suggestions`** — three requests per flip, none of which depend on the day.
7. **`SpotlightSearch` + `cmdk` ship in the entry bundle for the classic host only.** On 2.0
   routes Mod+K opens the Library panel instead; the component still mounts in `App.tsx`.
8. **`/scripts/*` revalidate on every load.** Not the `_headers` fix it looks like: `sw.js`
   fetches them `cache: 'no-cache'`, which ignores HTTP caching. Needs a SW strategy that
   survives a deploy without script/bundle skew.
9. **Split `proto-shell-context`** (W1 below).
10. **Design scale codemods**, from the same audit: spacing tokens are at 9% adoption and the
    scale omits the three most-used values (6/10/14px); ~45 font sizes for a 9-role scale;
    `cubic-bezier(0.22, 1, 0.36, 1)` is used 23× and is not a token; z-index at 12% adoption
    with values up to `1000021`. Sub-44px touch targets (toolbar orb 30px, locked) want a
    coarse-pointer hit-slop rather than a resize.

Runtime headroom is tracked as W1/W2/W8 in
[`../design-parity/ARCHITECTURE_READINESS_AUDIT.md`](../design-parity/ARCHITECTURE_READINESS_AUDIT.md).
The largest single lever there: `proto-shell-context.tsx` builds one `useMemo` value with **75
dependencies** consumed by **52 files**, so any one of the 75 re-renders all 52.

---

## Request count on an Activity load

A different axis from the payload above: **an Activity load fires 31 API requests**, down from 42
when this was first counted. Bytes are not the problem — most of these are small — but each is a
round trip, and on a cold connection they queue.

**Measured 2026-09-04**, signed in, warm cache, one reader with 30 notes and 11 review items.
Reproduce by loading `/` and reading the browser's network log filtered to `/api/`. Note that
`performance.getEntriesByType('resource')` returns **nothing** for these — something in the fetch
path keeps them out of resource timing — so the network panel is the only way to count them.

The count moves with what Home has to show: the same fixes measured 36 → 30 for a reader with 4
suggestion cards and an empty review queue. Compare loads, not branches.

Reading against the database requires `UserMetadata.foundingClaimedAt` to exist — see
[RELEASE_CHECKLIST_3_0.md](../RELEASE_CHECKLIST_3_0.md). Without it `/api/user/get-profile` 500s
and Home never composes, so any count taken is a count of a page that failed.

The four duplicated reads found in that first count are in "Fixed" below. What is left is 31
distinct endpoints, which is a different kind of problem: not one surface asking twice, but Home
composing itself out of many small reads. Attacking that means merging endpoints or deferring
sections, not deduplicating — so it is a design question rather than a bug, and nothing here is
outstanding.

---

## Fixed

### The three largest follow-ups — 2026-09-18

- **Initial payload 1073.8 → 840.9 KB gzipped (−22%).** TipTap and the editor were in the
  entry through four static imports, found by tracing from `main.tsx`: the shell's
  `PrototypeNotePage` (now lazy, warmed on idle), the public shared-note route (now
  `lazyRouteComponent`), and two pure-helper imports from TipTap modules by the reader and Home
  (split into `reference-suggestion-text.ts` and `scripture-quote-values.ts`). Baseline lowered.
- **UI font 1.4 MB → 171 KB.** Already Latin-only, so a character subset would have saved
  nothing; the weight was six variation axes. Pinned the three nothing uses (wdth, slnt, GRAD)
  with `scripts/build-web-font.py`; outlines within 0.42/2000 em, advances identical.
- **Highlights paint on tap.** The mark carries a client-proposed id from its first frame; the
  create route accepts it idempotently. Library highlight deletes are optimistic.

### Quick-win pass — 2026-09-18

Payload unchanged by design (1073.8 KB gz, no baseline change). What changed is what a load
fetches besides the bundle, and how fast things feel.

- **Favicon was the 1000px master, 795 KB**, also the apple-touch-icon, the SW precache entry
  and three in-page logos. Now 2 KB / 21 KB / 24 KB derivatives from `generate-pwa-icons.mjs`.
- **`preconnect` to `clerk.harvous.com`** in both credential modes; cold auth is serial through it.
- **`GET /api/spaces/:id/notes` read the same `Spaces` row three times, serially**, then ran its
  `COUNT` after the page query. Now one read (the route passes the row `requireSpaceAccess`
  already has) and the count runs beside the page. Verified identical output across 48
  comparisons on real spaces; 17% faster even on a single connection.
- **Home's Activity rows prefetch the note they open** on hover, focus or press; sidebar rows
  added pointerdown so touch gets the head start that was desktop-only.
- **`ProtoSpaceLoading` holds its dots invisible for 150 ms** (CSS), so ~30 surfaces that showed
  them on the first pending frame stop flashing on fast loads.
- **Library search holds its full-text matches across keystrokes** instead of dropping and
  re-adding them per debounced query.
- **`gcTime` 5 → 30 min** so returning to the PWA shows last-known data revalidating.

The chunk guard below was not actually running. `checkNamedChunks` matched only the object
form of `manualChunks`, and the same fix that moved the config to the function form left it
returning early on every build. It now reads both shapes and fails if it finds no names.

### An Activity load asked for four things twice — 2026-09-04

40 requests became 31, on the load measured immediately before and after; the same fixes measured
36 → 30 on a lighter load. The 42 in the section above was counted before the review-folds fix
below, and a load or two of ordinary variance sits between the two numbers.

Four separate duplications, one fix each, and the shape they had in common is that no single file
looked wrong: every one of them was two correct callers of the same data with nothing between
them saying so.

**The same notes page, three times.** Three identical
`GET /api/spaces/<id>/notes?offset=0&limit=20&…` requests per load, from Home's list, the mention
picker's source, and the Library panel. The cause was the cold-start effect at the bottom of
`useSpaceNotes`, which re-fetches when `authReady` flips and ran **once per hook instance**. It
had to stay — it repairs the 401 race `useAuthReady` documents, and deleting it breaks a cold
start for other people rather than for whoever is testing on a warm cache — so it now shares a
module-scoped latch, keyed by query key and released when auth is *lost*. The refetch also passes
`cancelRefetch: false`, so it joins the fetch `enabled` already started rather than cancelling it;
cancelling never closed the connection anyway, since the query function wires up no abort signal.

Worth knowing if this is ever tested again: three consumers flipping in one React commit are
deduplicated by React Query and the bug does not appear. It appears because each `useAuthReady`
instance awaits its own `getToken()`, so the flips land in three separate commits. The test in
`space-notes-auth-repair.test.tsx` staggers them for exactly that reason.

**One impression write per visible suggestion card.** A `POST /api/recall/event` each — six of
them on the Home that was first counted, four here. They batch into a single
`POST /api/recall/events` behind a queue flushed on the next macrotask, which is enough because
the calls arrive synchronously in one effect. A load whose cards paint in two waves sends two
batches rather than one, and should: a card that appears later is a new impression, and a longer
window to merge them would risk holding events through a navigation that drops them.

Impressions only. An `open` is followed immediately by navigation away, and a `snooze` or
`dismissed` is what suppresses a card on the reader's other devices, so neither can wait for a
flush.

**`GET /api/user/get-profile`, twice.** The prototype shell fetched its own copy to hydrate
appearance and onboarding while `useProfile` fetched the same payload for everything else. The
shell now goes through the query cache on the shared key, so whichever arrives first, the other
joins it.

**Challenges, as two calls.** `?status=active` for the Review section and `?status=paused`
alongside it for the Strengthen row. `status` takes a comma-separated list now, and both surfaces
read one `useHomeChallenges()` list and filter it — all-or-nothing on validation, so an unknown
name still rejects the parameter rather than being quietly dropped.

### Review's folds asked for a list Home already had — 2026-09-04

The Review section on Activity read `GET /api/review/items` (every status) to populate its
"coming back later" and "put aside" folds, while `use-home-surface-data` was already reading
`GET /api/review/items?status=active` on the same load for the suggestion handoff. Two keys, two
round trips, same rows.

The section shares the `active` key now, and the all-status read is left for the drawer of things
put aside — fetched when a fold is opened, or when there is nothing active at all, which is the
one case where something put down is all that remains and no fold exists to open. One request
saved on every load with an empty queue. Found while counting the 42 above.

### `manualChunks` object form silently produced an empty chunk — 2026-08-13

`vite.config.ts` asked for `{'react-vendor': ['react', 'react-dom']}` and got a **1-byte** file;
React shipped inside the main bundle instead. The object form moves the resolved package *entry*,
but React's real code sits in `react/cjs/react.production.js` behind it. The build succeeded and
the config read correctly — there was no signal.

Fixed by switching to the function form matching on resolved module path.
`check-perf-budget.mjs` now fails when a named chunk comes out empty.

Effect on first load was roughly neutral: 1080.5 → 1078.4 KB gzipped. React is needed on every
route, so splitting it wins nothing for first paint and costs a little cross-chunk gzip efficiency.
**The win is caching** — React now lives in a chunk that changes only when React does, so a
returning visitor after a deploy re-downloads 703.7 KB rather than 763.4 KB.

---

## Measuring other things

- **A real production build in a browser.** `npm run dev` never minifies, hashes, or applies
  `manualChunks`, so bundle work verified only in dev is not verified. `vite preview` proxies
  `/api` to port 3001, so: start the `spa` launch config (API + dev SPA), then `spa-built` (the
  built output on port 4324).
- **Interaction latency.** Resize to the mobile preset and compare `performance.mark` pairs across
  the interaction, before and after. This outranks page-load scores — Harvous is an app, not a page.
- **Lighthouse.** `npm run lighthouse:perf` reports FCP, LCP, TBT, CLS and Speed Index. Reported,
  not gated: lab-simulated scores are too noisy between runs to block a merge on.
- **Accessibility** stays a hard gate at 100 — `npm run lighthouse:a11y`.
