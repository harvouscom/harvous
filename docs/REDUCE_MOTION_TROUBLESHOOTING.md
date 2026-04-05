# Reduce motion — troubleshooting notes

## Current product state

The **in-app “Reduce Motion”** control under My Preferences is **disabled** (`REDUCE_MOTION_APP_PREFERENCE_ENABLED` in [`src/utils/reduce-motion.ts`](../src/utils/reduce-motion.ts)). The SPA still calls `syncReduceMotionFromStorage()` on boot so any leftover `<html data-reduce-motion>` from an older build is cleared.

**OS / browser “Reduce motion”** (`prefers-reduced-motion: reduce`) is still honored via global rules in [`src/styles/animations.css`](../src/styles/animations.css).

## Stale localStorage

If someone previously turned on in-app reduce motion, the key `harvous-reduce-motion` may still be `1` in localStorage. While the feature is off, that value is **ignored** for the DOM and CSS; it can be removed manually in devtools if desired.

## Known issue: hover felt jumpy while in-app reduce motion was on

We tried collapsing **all** animations and transitions with a broad rule (very short `animation-duration` / `transition-duration` on `*` under the reduced-motion path). That did not map cleanly to how the UI is built:

- **Hover feedback** often uses CSS `transition` on transform, scale, shadow, or opacity.
- With durations forced to effectively **zero**, those properties still **change** on hover; they no longer ease. The result was motion that **still happened** but looked **jagged or jumpy** instead of calm.

So a global “nuke all transitions” approach is a poor fit for Harvous until we either:

- Scope reduced motion to **specific** components or animation classes (no blanket `*`), and/or
- Use **instant** end states for decorative keyframes while leaving **short, intentional** transitions for hover/focus where needed.

## Related files

- [`src/utils/reduce-motion.ts`](../src/utils/reduce-motion.ts) — feature flag, storage helpers, DOM sync
- [`spa/src/main.tsx`](../spa/src/main.tsx) — boot sync; `storage` listener only when the in-app preference is enabled
- [`src/styles/animations.css`](../src/styles/animations.css) — `@media (prefers-reduced-motion: reduce)` block
- [`docs/ANIMATION_GUIDELINES.md`](ANIMATION_GUIDELINES.md) — broader animation guidance
