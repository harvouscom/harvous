# Harvous SPA Migration

> **Superseded / historical (annotated 2026-08-27).** This doc describes the
> transition period when Astro and the SPA coexisted. Astro is fully removed:
> production is the React SPA (`spa/` → `dist-spa/`) plus the Hono API on Fly
> (see `docs/CLEAR_SPLIT_MIGRATION.md` and `docs/FLY_MIGRATION.md`). Read this
> as history, not as a description of the current architecture — it has
> misled at least one infra assessment already. For where hosting goes next,
> see `docs/INFRA_ENDGAME.md`.

## What This Is

The Harvous app originally runs on **Astro** — a server-side rendered (SSR) framework hosted on Netlify. This works well for web, but Astro can't be bundled into a native iOS/Android app. To ship on mobile, we built a **pure React SPA** (Single Page Application) using Vite + TanStack Router that shares all the same React components and API endpoints as the Astro version.

The SPA lives in `spa/` and is built with `npm run build:spa`. The resulting bundle is what Capacitor packages into the native app.

---

## Architecture Overview

```
harvous/
├── src/                        # Shared source (components, styles, API routes)
│   ├── components/react/       # All React components — shared by both Astro AND SPA
│   ├── styles/                 # All CSS — shared by both
│   └── pages/api/              # Astro API endpoints — both versions hit these
│
├── spa/                        # SPA-only shell
│   ├── index.html              # Single HTML entry point
│   └── src/
│       ├── App.tsx             # Root: ClerkProvider + QueryClient + Router
│       ├── main.tsx            # React entry, font/style imports
│       ├── router.tsx          # TanStack Router route tree
│       ├── layouts/            # App shell (nav) and Auth shell (no nav)
│       ├── pages/              # Thin page wrappers that load shared components
│       ├── hooks/queries/      # React Query data hooks
│       ├── lib/api.ts          # Fetch wrapper (proxied to Astro dev server in dev)
│       └── shims/
│           └── astro-transitions.ts  # Compatibility shim (see below)
│
├── vite.config.ts              # Vite build config for the SPA
└── capacitor.config.ts         # Native app config
```

### Key Principle: Shared Components, SPA Shell

The React components in `src/components/react/` are **written once and used in both** the Astro app and the SPA. The SPA provides a thin shell around them:

- **Astro version**: Components are React Islands embedded in `.astro` pages with SSR
- **SPA version**: Components are imported directly into React pages with client-side routing

The backend (`src/pages/api/`) is always Astro — the SPA proxies all `/api/*` calls to the Astro server in development, and in production both deploy to Netlify where the same functions serve both.

---

## What We Built During This Session

### 1. The Vite Build Setup

**File:** `vite.config.ts`

```ts
{
  root: 'spa',                              // Vite root is the spa/ folder
  envDir: path.resolve(__dirname),          // .env loaded from project root
  publicDir: path.resolve(__dirname, 'public'),
  build: { outDir: '../dist-spa' },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),  // @/ still maps to src/ (shared)
      'astro:transitions/client': path.resolve(__dirname, 'spa/src/shims/astro-transitions.ts'),
    },
    dedupe: ['react', 'react-dom'],
  },
  server: {
    port: 4322,
    proxy: { '/api': 'http://localhost:4321' }  // Dev: proxy API to Astro
  }
}
```

The `root: 'spa'` setting is critical — it means Vite treats `spa/` as its project root. Any import that crosses outside this boundary (e.g. via the `@/` alias into `src/`) creates a **separate module instance**. This becomes important for singleton libraries like Sonner (see Toast section below).

### 2. The Astro Transitions Shim

**File:** `spa/src/shims/astro-transitions.ts`

Many shared components call `navigate()` from `astro:transitions/client` to trigger SPA-style navigation. In Astro, this uses view transitions. In the SPA, it needs to use TanStack Router.

The vite alias `'astro:transitions/client'` → `spa/src/shims/astro-transitions.ts` intercepts all these calls and redirects them through `router.navigate()`.

The shim also handles a common pattern where post-action navigations carry toast notification data as URL params (e.g. after erasing a note, the app navigates to `/?toast=success&message=Note%20erased%21`). In Astro, a script in `public/scripts/toast-handler.js` picks these up. In the SPA, the shim intercepts them before they ever reach the URL:

```ts
export function navigate(href, options) {
  const url = new URL(href, window.location.origin);
  const toastType = url.searchParams.get('toast');
  const message = url.searchParams.get('message');

  if (toastType && message) {
    // Strip params, navigate to clean URL, fire toast after settle
    url.searchParams.delete('toast');
    url.searchParams.delete('message');
    setTimeout(() => window.toast?.[toastType]?.(decoded), 50);
  }

  router.navigate({ to: cleanHref, replace: options?.history === 'replace' });
}
```

This covers all actions that fire toasts: erase note, erase thread, erase space, save note, new thread, etc.

### 3. The Router

**File:** `spa/src/router.tsx`

TanStack Router with the full route tree. Routes are organized into three groups:

**Auth routes** (no nav shell — just the centered card layout):
- `/sign-in` + splat sub-routes (Clerk multi-step flow)
- `/sign-up` + splat sub-routes

**Authenticated app routes** (with the 3-column nav shell):
- `/` → redirects to `/dashboard`
- `/dashboard` → DashboardPage
- `/search` → FindPage
- `/profile` → ProfilePage
- `/new-space` → NewSpacePage
- `/space/:spaceId` → SpacePage
- `/thread/:threadId` → ThreadPage
- `/note/:noteId` → NotePage

**Standalone public routes** (no nav, no auth required):
- `/addon` → UpgradePage
- `/spaces/join/:token` → JoinSpacePage
- `/shared/note/:shareToken` → SharedNotePage
- `/shared/thread/:shareToken` → SharedThreadPage
- `/invitations/:token` → InvitationPage

### 4. App.tsx — Providers and Toast System

**File:** `spa/src/App.tsx`

The root component wires up three providers and the global toast system:

```tsx
export default function App() {
  return (
    <ClerkProvider publishableKey={clerkPublishableKey}>
      <QueryClientProvider client={queryClient}>
        <ToastSetup />
        <SpaToaster />
        <RouterProvider router={router} />
      </QueryClientProvider>
    </ClerkProvider>
  );
}
```

#### The Toast Problem (and Solution)

The shared components dispatch toast notifications through a `window.toast` global. In the Astro version, `Layout.astro` sets this up using a Sonner instance from `src/utils/toast.ts`.

When the SPA initially imported from `@/utils/toast` (which resolves to `src/utils/toast.ts`), it worked fine for setting `window.toast` — but the `<Toaster>` component rendered by `ToastProvider` used a **different module instance** of Sonner. This is because Vite's `root: 'spa'` setting causes any import crossing the `spa/` boundary to be treated as a separate module, and Sonner uses module-level singleton state to connect `toast()` calls to the `<Toaster>` component.

**Fix:** Import `sonner` directly in `App.tsx` (within the `spa/` Vite boundary) and build `windowToast` + `<SpaToaster>` entirely there. This guarantees both the toast function calls and the `<Toaster>` renderer share the same Sonner module instance:

```ts
import { Toaster, toast as sonnerToast } from 'sonner';  // one instance

const windowToast = {
  success: (msg) => sonnerToast.success(msg, { icon: null }),
  error: (msg) => sonnerToast.error(msg, { icon: null }),
  // ...
  upgradePrompt: (msg, upgradeUrl) => sonnerToast.error(msg, {
    action: { label: 'Upgrade', onClick: () => window.location.href = upgradeUrl },
    cancel: { label: 'Not now', onClick: () => {} },
  }),
};
```

`ToastSetup` sets `window.toast = windowToast` and listens for `toast`/`showToast` custom events. `SpaToaster` renders the `<Toaster>` with matching styles (responsive positioning, 24px border radius).

**Sonner author:** [Emil Kowalski](https://emilkowal.ski/) — we also use his **[Vaul](https://github.com/emilkowalski/vaul)** library for mobile bottom drawers; Vaul’s `style.css` is imported from `spa/src/main.tsx` via `../../node_modules/vaul/style.css` because the package `exports` field does not expose `./style.css` to bundlers.

### 5. Page Wrappers

**Directory:** `spa/src/pages/`

Each page is a thin React component that:
1. Sets `document.title`
2. Fetches data using a React Query hook from `spa/src/hooks/queries/`
3. Renders the shared component from `src/components/react/`

For example, `NotePage.tsx`:
```tsx
export default function NotePage() {
  const { noteId } = useParams({ from: '/note/$noteId' });
  const { data, isLoading } = useNote(noteId);
  return <CardFullEditable note={data} isLoading={isLoading} />;
}
```

The shared components handle all the real UI logic — the page wrapper just provides the data.

### 6. The Upgrade Page

**Files:** `spa/src/pages/UpgradePage.tsx`, `src/components/react/UpgradeCheckoutButton.tsx`

The upgrade page had two issues in the SPA:

**Issue 1: Multiple ClerkProvider error**

`UpgradeCheckoutButton` was designed as an Astro React Island — it creates its own `ClerkProvider` because React Islands are isolated. In the SPA, there's already a top-level `ClerkProvider` in `App.tsx`, so nesting another one caused Clerk to throw.

Fix: Added a `publishableKey === null` sentinel in `UpgradeCheckoutButton`. When `null` is passed, the component skips creating its own `ClerkProvider` and uses the one already in context:

```tsx
// In the SPA, ClerkProvider is already provided by App.tsx
if (publishableKey === null) {
  return (
    <div ref={containerRef}>
      <SignedIn>
        <UpgradeCheckoutButtonInner ... />
      </SignedIn>
    </div>
  );
}
// Otherwise (Astro context), wrap in ClerkProvider as before
```

**Issue 2: "Billing Unavailable" button showing instead of checkout**

Even with the `publishableKey === null` path added, the component was showing "Billing Unavailable". The cause: the component's internal `effectiveKey` state starts as `null`, and there was a guard `if (!effectiveKey)` that rendered "Billing Unavailable" **before** the `publishableKey === null` check was reached. Since React hooks can't be conditionally called, the fix was to add `&& publishableKey !== null` to the guard:

```tsx
// Only show "Billing Unavailable" if we truly have no key AND we're not in SPA mode
if (!effectiveKey && publishableKey !== null) {
  return <BillingUnavailableButton />;
}
```

**Issue 3: Nav shell showing on upgrade page**

The upgrade page needs to be a standalone full-page layout (gradient left, content right) — not wrapped in the app nav. The route was initially under `appLayoutRoute`. Moving it to be a direct child of `rootRoute` fixed this.

**UpgradePage layout** mirrors the sign-in/sign-up pages: left column with animated mesh gradient + logo, right column with the upgrade card content.

### 7. Toast Styling

The `borderRadius` on toasts was updated from `12px` to `24px` in both:
- `spa/src/App.tsx` (`SpaToaster` component)
- `src/components/react/ToastProvider.tsx` (Astro version)

---

## Will Existing Users Notice?

No — and that's the point. From a user perspective, the SPA is the same app with the same UI, same data, same API. The differences are all under the hood:

| | Astro (current web) | SPA (new native + future web) |
|---|---|---|
| **Rendering** | Server-side rendered HTML | Client-side React |
| **Routing** | Astro file-based routes + View Transitions | TanStack Router |
| **Navigation** | Full-page transitions (Astro) | Instant client-side (no flash) |
| **Auth** | Clerk via `@clerk/astro` | Clerk via `@clerk/clerk-react` |
| **Data fetching** | Server-rendered + Islands | React Query (cached, background refresh) |
| **Performance** | Fast first load (SSR) | Faster subsequent navigation (SPA) |
| **Native** | ❌ Not possible | ✅ Capacitor → iOS/Android |

The API is shared — `src/pages/api/` handles all requests for both. The React components are shared — `src/components/react/` renders the same UI in both. Users get the same experience, just faster navigation and (eventually) a native app.

---

## Running Both Versions

```bash
# Astro (SSR web version) — port 4321
npm run dev

# SPA (Vite/React version) — port 4323, proxies /api to 4321
npm run dev:spa
```

Both must run simultaneously during development — the SPA proxies all API calls to the Astro dev server.

## Building for Native

```bash
npm run build:native   # builds SPA + syncs with Capacitor
npm run cap:ios        # opens Xcode
npm run cap:android    # opens Android Studio
```
