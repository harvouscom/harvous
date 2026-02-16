# Route-Based Code Splitting

**Goal:** Reduce the main JS bundle from ~1.6MB (414KB gzipped) by lazy-loading routes so each page only loads what it needs on first visit.

**When to do this:** After `feat/capacitor` → `main` merge is stable.

---

## Current State

`vite.config.ts` already splits these chunks manually:
- `react-vendor` — react, react-dom
- `clerk` — @clerk/clerk-react
- `router` — @tanstack/react-router
- `query` — @tanstack/react-query
- `tiptap` — all @tiptap/* packages

But all app pages/components land in `index-*.js` (~1.6MB). The heaviest components are the note editor (`TiptapEditor.tsx` ~3500 lines), `ThreadNotesList`, `CardFullEditable`, and all the panel components.

---

## Approach: Lazy-load SPA Routes

TanStack Router supports `React.lazy()` on route components. The idea is to split at the route level so the dashboard, thread, note, and profile pages each have their own chunk — only loaded when navigated to.

### Step 1 — Lazy-load page components in the router

In `spa/src/router.tsx` (or wherever routes are defined), replace direct imports with `React.lazy()`:

```tsx
// Before
import DashboardPage from './pages/DashboardPage';
import ThreadPage from './pages/ThreadPage';
import NotePage from './pages/NotePage';
import ProfilePage from './pages/ProfilePage';

// After
import { lazy, Suspense } from 'react';
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const ThreadPage = lazy(() => import('./pages/ThreadPage'));
const NotePage = lazy(() => import('./pages/NotePage'));
const ProfilePage = lazy(() => import('./pages/ProfilePage'));
```

Wrap route components in `<Suspense fallback={null}>` — the existing skeleton/fade-in patterns mean `null` is fine (no jarring flash).

### Step 2 — Split the editor into its own chunk

`TiptapEditor.tsx` is the heaviest component and is only needed on note pages. Lazy-load it within `CardFullEditable` or `NotePage`:

```tsx
const TiptapEditor = lazy(() => import('./TiptapEditor'));
```

This alone should shave ~350KB from the initial bundle.

### Step 3 — Lazy-load heavy panel components

Panels are only needed when opened. Lazy-load the heaviest ones in `DesktopPanelManager` and `BottomSheet`:

```tsx
const NoteDetailsPanel = lazy(() => import('./NoteDetailsPanel'));
const NewNotePanel = lazy(() => import('./NewNotePanel'));
// etc.
```

### Step 4 — Add `manualChunks` for remaining heavy deps

Check what's still in the main chunk after steps 1-3 using:
```
npx vite-bundle-visualizer
```

Likely candidates for manual splitting:
- `@radix-ui/*` → `radix` chunk
- `lucide-react` → `icons` chunk
- `date-fns` or similar → `utils` chunk

---

## Expected Outcome

| Chunk | Before | After (est.) |
|-------|--------|--------------|
| `index` | 1.6MB / 414KB gz | ~600KB / ~160KB gz |
| `tiptap` | 351KB / 112KB gz | unchanged |
| `note-page` (new) | — | ~400KB / ~110KB gz |
| `dashboard` (new) | — | ~200KB / ~55KB gz |

Initial load (dashboard) drops from ~414KB → ~160KB gzipped. Note page loads the editor chunk on demand.

---

## Risks & Mitigations

- **Suspense boundary flicker** — Use `null` fallback + existing fade-in CSS. The `content-fade-in` class already handles this.
- **TanStack Router compatibility** — Verify lazy routes work with `createRoute` / `createFileRoute`. TanStack Router v1 supports this natively.
- **Capacitor cache** — After splitting, Capacitor's WebView will cache chunks individually. On app update, only changed chunks re-download. This is actually better than today where the entire bundle invalidates on every deploy.
- **Preloading** — Add `<link rel="modulepreload">` hints for the note/thread chunks so they load in the background after the dashboard is interactive.

---

## Files to Touch

| File | Change |
|------|--------|
| `spa/src/router.tsx` | Convert page imports to `React.lazy()` |
| `spa/src/pages/NotePage.tsx` | Lazy-load `TiptapEditor` / `CardFullEditable` |
| `src/components/react/DesktopPanelManager.tsx` | Lazy-load heavy panels |
| `src/components/react/BottomSheet.tsx` | Lazy-load heavy panels |
| `vite.config.ts` | Add `manualChunks` for radix/icons if needed |

---

## Verification

1. `npm run build:spa` — no errors, chunk sizes reduced
2. `npx vite-bundle-visualizer` — confirm split is correct
3. Hard refresh dashboard — confirm no regression in load feel
4. Navigate to note page — editor loads, no flash
5. Open a panel — panel loads, no flash
6. Capacitor: `npm run cap:sync` + test on device
