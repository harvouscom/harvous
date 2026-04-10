# Note page: `noteThreadFromUrlRef` optional polish

## Context

On [`spa/src/pages/NotePage.tsx`](../spa/src/pages/NotePage.tsx), `noteThreadFromUrlRef` and `noteSpaceIdRef` are updated in a `useEffect` that depends on **`noteId` only**. The URL query string (`?thread=`, `?space=`) is captured on mount (and when the note slug changes), not when the browser location’s search string changes while staying on the same note.

After **remove-from-thread**, the app uses `navigate({ replace: true })` to update `?thread=` (and preserve `space` / `from`). That updates the URL immediately; **parent thread display** already prefers live reads from `window.location.search` in `useMemo`, so the UI stays correct.

## Why this polish exists

Some code paths still read **`noteThreadFromUrlRef.current`** when the live URL is unavailable or as a fallback (e.g. scripture reprocess logic, and any future code that mirrors that pattern). If the SPA ever strips or lags query updates, a ref that only refreshes on `noteId` change could theoretically be **one navigation behind** the real URL.

In practice this has been **low severity** because the same page’s `useMemo` reads `window.location` for `parentThread`, which is what drives most of the chrome.

## Recommendation

| Approach | When |
|----------|------|
| **Do nothing** | Default. Revisit only if we see incorrect thread context after in-app `replace` navigations on the same note (e.g. wrong localStorage `harvous-note-thread-*` cache, or scripture reprocess picking the wrong thread). |
| **Implement** | If QA or users report stale thread context tied to ref-based fallbacks, or if we add more ref-based readers that don’t read `window.location`. |

## Implementation sketch (if needed)

1. Subscribe to the router’s location for the note route, e.g. `useRouterState({ select: (s) => s.location.search })` from `@tanstack/react-router`, or `useSearch` if the note route exposes validated search.
2. Add `search` (or a serialized `thread`/`space` extract) to the dependency array of the effect that sets `noteThreadFromUrlRef` / `noteSpaceIdRef`, so refs re-sync whenever `?thread=` / `?space=` changes **without** a `noteId` change.
3. Keep the effect cheap (only parsing `URLSearchParams` and assigning refs).

Avoid widening dependencies in unrelated effects unless they truly need the new search snapshot.

## Related

- URL helpers: [`src/utils/url-helpers.ts`](../src/utils/url-helpers.ts) (`idToUrl`, thread query on note URLs).
- Remove-from-thread redirect: `noteRemovedFromThread` listener in `NotePage.tsx` (replaces `?thread=` after removal from the current context).
