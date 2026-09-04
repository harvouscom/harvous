# Performance Baseline

Current numbers, how each was measured, and how to reproduce them. Owned by `/engineer`.

**Last measured:** 2026-08-13 (payload) · 2026-09-04 (request count)

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

Runtime headroom is tracked as W1/W2/W8 in
[`../design-parity/ARCHITECTURE_READINESS_AUDIT.md`](../design-parity/ARCHITECTURE_READINESS_AUDIT.md).
The largest single lever there: `proto-shell-context.tsx` builds one `useMemo` value with **75
dependencies** consumed by **52 files**, so any one of the 75 re-renders all 52.

---

## Request count on an Activity load

A different axis from the payload above, and unmeasured until now: **an Activity load fires 42
API requests.** Bytes are not the problem — most of these are small — but each is a round trip,
and on a cold connection they queue.

**Measured 2026-09-04**, signed in, warm cache, one reader with 30 notes and 11 review items.
Reproduce by loading `/` and reading the browser's network log filtered to `/api/`. Note that
`performance.getEntriesByType('resource')` returns **nothing** for these — something in the fetch
path keeps them out of resource timing — so the network panel is the only way to count them.

Three findings, in order of size. None is attacked, and each lives in a hook every surface
depends on, which is why none was done in the session that found them.

1. **The same notes page is fetched three times.** Three identical
   `GET /api/spaces/<id>/notes?offset=0&limit=20&excludeLegacyScripture=1&sortBy=updated`
   requests per load. The query key is identical, so React Query is not the cause — the suspect is
   the cold-start effect at the bottom of `useSpaceNotes` (`spa/src/hooks/queries/useSpace.ts`),
   which calls `query.refetch()` when `authReady` flips and runs **once per hook instance**. Three
   consumers, three refetches. That effect exists to repair a real 401 race documented in
   `useAuthReady` — deleting it reintroduces a cold-start bug that only shows up for other people,
   so it needs a shared-latch or query-level fix rather than removal. Biggest single win, and the
   heaviest payload of the three.

2. **Six separate `POST /api/recall/event` impression writes**, one per visible suggestion card.
   Batching them into one call removes five requests from every load. They are fire-and-forget, so
   the risk is low; the work is a queue with a flush rather than a per-card post.

3. **Duplicated reads.** `GET /api/user/get-profile` twice, and challenges as two calls
   (`?status=active` and `?status=paused`). Smallest of the three, and probably the easiest.

Roughly 42 → 33 requests if all three are done.

---

## Fixed

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
