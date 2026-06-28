# Prototype `/prototype` tab crash (Aw Snap, error 5)

## Symptom

Chrome shows **Aw, Snap!** with **Error code: 5** on `/prototype` shortly after load (often ~5 seconds), while the tab renderer process dies. This is a **GPU compositor or memory kill**, not a normal API error (no JSON error toast).

On **iOS standalone PWA**, the same class of failure often surfaces as **"A problem repeatedly occurred on …"** (WebKit killed the content process after repeated load/crash attempts). Note deep-links like `new.harvous.com/fXvv5uY` are especially heavy: full shell + eager TipTap + glass compositing.

## What usually causes it

1. **Stacked `backdrop-filter` (blur) layers** over a custom canvas wallpaper, especially a **large image data URL** in `localStorage` (`harvous-proto-bg`). Each blur forces the compositor to snapshot and blur pixels behind the layer; stacked blurs over a full-screen background can exhaust GPU memory.
2. **Heavy work at first paint**: navigation + space note list + offline **sync bootstrap** used to run together on `/prototype` (IndexedDB ingest of the full library + `refreshClientData` clearing session caches). **Fix:** `initializeSync` is skipped on `/prototype`; lists use React Query only. Remote sync uses `refreshPrototypeLists` (debounced, no sessionStorage wipe).
3. **Not** caused by LiquidGL on web (removed; prototype uses CSS-only materials). **Not** the same as missing DB tables (`SyncDeletedEntities` → 500 on `/api/sync/changes`, not a tab kill).

## Quick bisect (no code)

1. **Reset wallpaper**: DevTools → Application → Local Storage → delete `harvous-proto-bg`, or Prototype Settings → Appearance → **Paper**. Reload `/prototype`.
   - Crash stops → wallpaper / compositor path.
   - Still crashes → check Network and Memory (below).
2. **Inspect `<html>` classes**: On `/prototype` expect `harvous-prototype-route` always. **Paper** adds no wallpaper class. **Solid color presets** add `harvous-proto-wallpaper-color` (canvas var + hue-tinted borders). **Image wallpapers** add `harvous-proto-wallpaper-image` (and `harvous-proto-wallpaper`), not the color class. Stale classes after an upgrade — hard refresh or re-pick the preset in Appearance.
3. **Computed style**: `.proto-shell-frame` should have a single primary `backdrop-filter: var(--pds-glass-blur)`. Inner `.proto-shell` grid should be `background: transparent` (no second full-shell blur). Panel glass (sidebar, inspector, format bar) and elevated cards (daily passage, collection cards) add their own tiered blur — if Aw Snap returns, dial back `--pds-glass-blur-elevated` on floating cards first, then panel blur. Mobile drawer applies blur on the drawer **cell** only (inner `.proto-sidebar-root` blur is disabled to avoid stacking).
4. **Network ~crash time**: `/api/navigation/data`, `/api/spaces/.../notes`, `/api/sync/bootstrap` or `/api/sync/changes` — failures are separate from Aw Snap; huge note bodies in list responses can spike memory (list API truncates content; see `NOTE_LIST_CONTENT_MAX_CHARS` in [server/utils/dashboard-data.ts](../../server/utils/dashboard-data.ts)).
5. **Optional**: Disable Chrome hardware acceleration once; if Aw Snap disappears, treat as GPU/compositor.
6. **`prefers-reduced-transparency`**: blur tokens are set to `none` — if a crash only happens with transparency enabled, treat as compositor / stacked blur.

## Code references (fixes)

| Area | File |
|------|------|
| Wallpaper classes (color vs image) | [spa/src/lib/prototype-background.ts](../../spa/src/lib/prototype-background.ts) |
| Tiered blur tokens | [spa/src/styles/prototype-tokens.css](../../spa/src/styles/prototype-tokens.css) (`--pds-glass-blur*`) |
| Shell frame + panel glass | [spa/src/styles/prototype-shell.css](../../spa/src/styles/prototype-shell.css) |
| Shared glass recipe | [spa/src/styles/prototype-components.css](../../spa/src/styles/prototype-components.css) (`.proto-glass-surface`) |
| Skip IndexedDB sync on prototype | [src/utils/sync-init.ts](../../src/utils/sync-init.ts) (`isPrototypeShellRoute`) |
| iOS PWA compositor guard (Paper wallpaper, no shell blur) | [spa/src/lib/prototype-background.ts](../../spa/src/lib/prototype-background.ts), [spa/src/styles/prototype-shell.css](../../spa/src/styles/prototype-shell.css) (`html.ios-pwa`) |
| Base62 note slug boot + SW navigate | [public/scripts/prototype-shell-path.js](../../public/scripts/prototype-shell-path.js), [public/sw.js](../../public/sw.js) |
| Lazy TipTap on mobile prototype notes | [src/components/react/CardFullEditable.tsx](../../src/components/react/CardFullEditable.tsx) |
| Light list refresh after sync / tab focus | [spa/src/lib/refresh-client-data.ts](../../spa/src/lib/refresh-client-data.ts) (`refreshPrototypeLists`), [spa/src/layouts/SimplifiedPrototypeLayout.tsx](../../spa/src/layouts/SimplifiedPrototypeLayout.tsx) |
| Canvas attachment guard | [spa/src/styles/prototype-tokens.css](../../spa/src/styles/prototype-tokens.css) |

## Delayed crash (~30s) on color preset only

If **Paper** is stable but **Cream / other presets** crash around **30 seconds**, that often lines up with React Query refetch (`staleTime: 30s` on navigation/space notes) while semi-transparent UI with `backdrop-filter` sits over the colored `html` canvas. Mitigations in place: tiered blur tokens, one primary blur on `.proto-shell-frame`, no `translateZ(0)` on `.proto-shell-frame`, mobile drawer avoids double blur on sidebar root. Color presets use `harvous-proto-wallpaper-color` for border hue; popovers stay opaque (`--pds-bg-popover-solid`).

## Related

- [Database / sync schema issues](./README.md) — `SyncDeletedEntities` and `npm run db:push`
- [Note scroll well progressive blur (deferred)](./NOTE_SCROLL_WELL_PROGRESSIVE_BLUR.md) — why blur was avoided on note scroll wells
