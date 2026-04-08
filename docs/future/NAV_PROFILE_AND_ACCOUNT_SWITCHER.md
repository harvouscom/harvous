# Navigation profile strip & search — current state and future directions

**Status:** Exploration (not a committed roadmap). Documents how profile and search work in the shell today, and sketches directions for richer account surfacing and multi-account patterns—using the Claude desktop account strip as a visual reference.

## Reference pattern (Claude desktop)

The attached Claude UI shows a **horizontal account strip** with:

- **Identity block:** small **avatar** (initials) + **primary line** (full name) + **secondary line** (plan tier, e.g. “Pro plan”).
- **Actions:** compact icon buttons (e.g. download with badge) and a **chevron / menu affordance** for account-level actions.

Harvous does not implement this layout today; it is a **product and UX reference** for “more profile context in the nav without opening the full profile page,” plus a **switch-account** entry point.

## Current implementation (as of this doc)

### Shell and data flow

- [`spa/src/layouts/AppLayout.tsx`](../../spa/src/layouts/AppLayout.tsx) loads **`useProfile()`**, derives **`navAvatarInitials`** via [`getNavAvatarInitials`](../../src/utils/nav-avatar-initials.ts) and **`navDisplayName`** via **`getNavDisplayName`**, and passes **`userColor`** from profile cache.
- **Desktop** uses [`NavigationIsland`](../../src/components/react/navigation/NavigationIsland.tsx) → [`NavigationColumn`](../../src/components/react/navigation/NavigationColumn.tsx).
- **Mobile** uses [`MobileNavigation`](../../src/components/react/navigation/MobileNavigation.tsx).

### Desktop (`NavigationColumn`)

- **Location:** Bottom of the left nav column, class **`nav-column-bottom`** ([`navigation.css`](../../src/styles/navigation.css)).
- **Layout:** **`flex`** row — **`justify-content: flex-start`**, **`gap: 12px`**.
- **Profile (left, grows):** A slot **`nav-column-bottom__profile-slot`** with **`flex: 1`** and **`min-width: 0`**.
  - Default route: single link to **`/profile`** wrapping a **user-color pill** (`nav-column-bottom__profile-pill`) showing **`effectiveUserDisplayName`** (prop + optimistic updates from `updateProfile` window event). Horizontal padding matches SpaceButton text inset (**24px** sides, **2px** bottom optical padding).
  - Profile/special route **`showProfile`:** back affordance via **`SquareButton`** (“Back”) in the same slot.
- **Search (right, fixed):** **`mobile-nav__search-btn`** styling on an **`<a href="/search">`** — **64×64** squircle, **`nav-column-bottom__search-link`** **`flex-shrink: 0`**.

**What it does not show:** plan tier, email, separate “account menu,” or multi-account UI—only **display name** (and initials/color for event-driven updates).

### Mobile (`MobileNavigation`)

- **Layout:** CSS **grid** — **`grid-template-columns: auto 1fr auto`**, **`gap: 12px`**, **`height: 64px`** (`.mobile-nav`).
- **Column 1 — Avatar:** [`Avatar`](../../src/components/react/navigation/Avatar.tsx) with **`avatar--nav-compact`**: **64×64** squircle, same inset language as search; **`padding-bottom: 2px`** to align optically with **`.space-btn__content`**. Tap navigates to **`/profile`** via **`navigate('/profile')`**.
- **Column 2 — Space / thread:** [`SpaceButton`](../../src/components/react/navigation/SpaceButton.tsx) **`state="DropdownTrigger"`** ( **`pl-4 pr-0`** ) plus a separate **sort** toggle that opens the **space switcher** bottom sheet (`Drawer`).
- **Column 3 — Search:** Same **64×64** **`mobile-nav__search-btn`** pattern as desktop search tile.

**Order (left → right):** avatar | space | search.

### Search behavior (both)

- **Desktop:** Full navigation to **`/search`** (anchor).
- **Mobile:** **`navigate('/search')`** on click.

No global search overlay in the shell; route-driven search page.

## Gaps vs a “Claude-like” richer strip

| Area | Today | Claude-like direction |
|------|--------|------------------------|
| **Primary label** | Display name (desktop pill); initials only (mobile avatar) | Name + optional **subtitle** (plan, email obfuscated, or “Free / Pro”) |
| **Avatar** | Mobile: colored initials squircle; Desktop: text-only pill | Optional **small initials avatar** + text block in both shells for parity |
| **Secondary actions** | None in strip | **Settings / upgrade / downloads** as icon buttons or overflow menu |
| **Account menu** | Profile = navigate to **`/profile`** | **Popover / sheet** with sign out, billing, preferences, **switch account** |
| **Account switching** | Single signed-in **Clerk** user | See below |

## Account switching — technical directions (Harvous)

Today the app assumes **one active Clerk session** per browser profile. True “switch account” without signing out usually implies one of:

1. **Clerk-supported multi-session or account list** (product-dependent; verify current Clerk capabilities and pricing).
2. **Sign out → account picker** (email/password or OAuth) — simplest, no parallel sessions.
3. **Organizations / workspaces** as *context switches* (same human, different org “hats”) — overlaps with church/org work; not the same as personal multi-email, but can feel like “switch account” in the UI if framed that way.
4. **Family / shared-device accounts** — see [`FAMILY_ACCOUNTS.md`](./FAMILY_ACCOUNTS.md) if that roadmap aligns.

Any design should **avoid implying** multiple concurrent sessions unless the stack truly supports it (token storage, sync, offline identity).

## Explored option: Remove search from nav chrome

**Idea:** Remove the dedicated **search** control from both **desktop** and **mobile** nav. On **desktop**, the **profile** strip would span the full width of the bottom bar (it already uses `flex: 1` beside search today). On **mobile**, drop the third column so the **space / home “menu”** (`SpaceButton` + sheet toggle) **fills the remaining width** beside the avatar (`grid` becomes `auto 1fr` instead of `auto 1fr auto`).

### What you gain

- **Cleaner chrome:** Fewer competing 64px tiles; one clear “account” strip on desktop and a single dominant “where am I” control on mobile.
- **Desktop:** Bottom row can read as **profile-only** (name pill full width), which pairs well with a future richer strip (Claude-like) without sharing space with search.
- **Mobile:** The center column is already **`1fr`**; removing search gives that block the full middle lane—aligned with “menu fills remaining space.”

### What you risk

- **Discoverability:** Search is **high-intent**. Without a nav affordance, users who don’t know **`/search`** or bookmarks may think search is gone. Plan at least one alternate path: link from **profile / options**, **empty states**, or a **keyboard shortcut** / command palette if introduced later.
- **Habit:** Users trained on corner search need a deliberate migration (no skeleton rule conflict—copy or a single release note may suffice).
- **Parity:** Keep **`/search`** working and reachable so power users aren’t blocked.

### Fit with current implementation

- **Desktop:** [`NavigationColumn`](../../src/components/react/navigation/NavigationColumn.tsx) — remove the search `<a>`; keep **`nav-column-bottom__profile-slot`** as the sole growing region (and **`showProfile`** back control in that slot).
- **Mobile:** [`MobileNavigation`](../../src/components/react/navigation/MobileNavigation.tsx) — remove the third **`mobile-nav__col`** search block; adjust **`.mobile-nav`** grid to **`auto 1fr`**. Touch targets and **`.space-switcher-anchor--mobile`** styles should be re-checked after the layout shift.

### Recommendation

- **Product:** Reasonable if search is **not** a top-tier action from the shell on mobile; less critical on desktop if search is mostly keyboard or deep-linked.
- **Engineering:** **Low coupling**—search entry is mostly isolated to those components plus the **`/search`** route; the main cost is **UX assurance** (where search lives next), not a large refactor.

## Related docs

- [`NAVIGATION_HIERARCHY_REDESIGN.md`](./NAVIGATION_HIERARCHY_REDESIGN.md) — broader nav IA.
- [`CLERK_MONETIZATION_ARCHITECTURE.md`](./CLERK_MONETIZATION_ARCHITECTURE.md) — plan metadata and orgs.
- [`APP_LAYOUT_APPEARANCE_CUSTOMIZATION.md`](./APP_LAYOUT_APPEARANCE_CUSTOMIZATION.md) — shell theming.
- [`FAMILY_ACCOUNTS.md`](./FAMILY_ACCOUNTS.md) — family account model (if relevant to “who is signed in”).

## Open questions (for a future spec)

- Should **desktop and mobile** show the **same** identity model (name + subtitle + avatar), or keep mobile denser?
- Is **plan line** sourced from **Clerk metadata**, **Stripe**, or **`UserMetadata`** only?
- If search is **removed from nav** (see [Explored option: Remove search from nav chrome](#explored-option-remove-search-from-nav-chrome)), where should **discoverability** live (profile list, shortcut, command palette)?
- Should **search** stay a third column on mobile if the strip grows vertically (two-line profile)? (Partially superseded by the remove-search option above.)
- **Offline:** which account fields are safe to show from cache when **`useProfile`** is stale?

---

*This file is intentionally exploratory; implementation tickets should reference explicit acceptance criteria once product chooses a direction.*
