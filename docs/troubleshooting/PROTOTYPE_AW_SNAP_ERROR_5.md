# Prototype `/prototype` tab crash (Aw Snap, error 5)

## Symptom

Chrome shows **Aw, Snap!** with **Error code: 5** on `/prototype` shortly after load (often ~5 seconds), while the tab renderer process dies. This is a **GPU compositor or memory kill**, not a normal API error (no JSON error toast).

## What usually causes it

1. **Stacked `backdrop-filter` (blur) layers** over a custom canvas wallpaper, especially a **large image data URL** in `localStorage` (`harvous-proto-bg`). Each blur forces the compositor to snapshot and blur pixels behind the layer; stacked blurs over a full-screen background can exhaust GPU memory.
2. **Heavy work at first paint**: navigation + space note list + offline **sync bootstrap** used to run together on `/prototype` (IndexedDB ingest of the full library + `refreshClientData` clearing session caches). **Fix:** `initializeSync` is skipped on `/prototype`; lists use React Query only. Remote sync uses `refreshPrototypeLists` (debounced, no sessionStorage wipe).
3. **Not** caused by LiquidGL on web (removed; prototype uses CSS-only materials). **Not** the same as missing DB tables (`SyncDeletedEntities` → 500 on `/api/sync/changes`, not a tab kill).

## Quick bisect (no code)

1. **Reset wallpaper**: DevTools → Application → Local Storage → delete `harvous-proto-bg`, or Prototype Settings → Appearance → **Default (white)**. Reload `/prototype`.
   - Crash stops → wallpaper / compositor path.
   - Still crashes → check Network and Memory (below).
2. **Inspect `<html>` classes**: On `/prototype` expect `harvous-prototype-route` only for solid color presets (canvas var only). Image wallpapers add `harvous-proto-wallpaper-image` (and `harvous-proto-wallpaper`). Stale `harvous-proto-wallpaper-color` on `<html>` after an upgrade — hard refresh or re-pick the preset.
3. **Computed style**: `.proto-shell__sidebar-cell` should have `backdrop-filter: none` on `/prototype`.
4. **Network ~crash time**: `/api/navigation/data`, `/api/spaces/.../notes`, `/api/sync/bootstrap` or `/api/sync/changes` — failures are separate from Aw Snap; huge note bodies in list responses can spike memory (list API truncates content; see `NOTE_LIST_CONTENT_MAX_CHARS` in [server/utils/dashboard-data.ts](../../server/utils/dashboard-data.ts)).
5. **Optional**: Disable Chrome hardware acceleration once; if Aw Snap disappears, treat as GPU/compositor.

## Code references (fixes)

| Area | File |
|------|------|
| Wallpaper classes (color vs image) | [spa/src/lib/prototype-background.ts](../../spa/src/lib/prototype-background.ts) |
| Shell / no blur on prototype route | [spa/src/styles/prototype-shell.css](../../spa/src/styles/prototype-shell.css) |
| Skip IndexedDB sync on prototype | [src/utils/sync-init.ts](../../src/utils/sync-init.ts) (`isPrototypeShellRoute`) |
| Light list refresh after sync / tab focus | [spa/src/lib/refresh-client-data.ts](../../spa/src/lib/refresh-client-data.ts) (`refreshPrototypeLists`), [spa/src/layouts/SimplifiedPrototypeLayout.tsx](../../spa/src/layouts/SimplifiedPrototypeLayout.tsx) |
| Canvas attachment guard | [spa/src/styles/prototype-tokens.css](../../spa/src/styles/prototype-tokens.css) |

## Delayed crash (~30s) on color preset only

If **Default white** is stable but **Cream / other presets** crash around **30 seconds**, that often lines up with React Query refetch (`staleTime: 30s` on navigation/space notes) while semi-transparent UI still had `backdrop-filter` over the colored `html` canvas (e.g. daily passage pill dismiss chip). Fixes: no html class for color presets (only `--pds-canvas-bg`), no `backdrop-filter` in prototype CSS, no `translateZ(0)` on `.proto-shell-frame`.

## Related

- [Database / sync schema issues](./README.md) — `SyncDeletedEntities` and `npm run db:push`
- [Note scroll well progressive blur (deferred)](./NOTE_SCROLL_WELL_PROGRESSIVE_BLUR.md) — why blur was avoided on note scroll wells
