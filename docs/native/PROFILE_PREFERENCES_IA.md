# Native macOS / iOS: profile and preferences IA

**Status:** Design reference for a future Swift/SwiftUI (or multiplatform) client. Web implementation today: `[ProfileOptionsList](../../src/components/react/ProfileOptionsList.tsx)`, `[MyPreferencesPanel](../../src/components/react/MyPreferencesPanel.tsx)`, `[UserMetadata](../../server/db/schema.ts)` (server fields), Clerk for credentials.

**macOS shell (window type, title bar, toolbar, what not to do):** See `[MACOS_PREFERENCES_WINDOW_AND_TITLEBAR.md](MACOS_PREFERENCES_WINDOW_AND_TITLEBAR.md)`.

---

## 1. Web-to-native inventory

Each row is tagged for **native_primary** placement. Use one tag per row; notes cover nested flows or hybrid UX.


| Web entry                 | Panel / destination        | native_primary | Notes                                                                                                                                   |
| ------------------------- | -------------------------- | -------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| My Inbox                  | `MyInboxPanel`             | **main-nav**   | Prefer tab/sidebar; optional duplicate under “You”.                                                                                     |
| My Spaces                 | `MySpacesPanel`            | **main-nav**   | Same as web: high-frequency; not buried in Settings.                                                                                    |
| My Sharing                | `MySharingPanel`           | **main-nav**   | Sharing is core study/social surface.                                                                                                   |
| My Achievements           | `MyAchievementsPanel`      | **main-nav**   | XP already on profile header; achievements belong in shell or “You” hub.                                                                |
| My Preferences            | `MyPreferencesPanel` (hub) | **settings**   | See nested table below.                                                                                                                 |
| Refer My Friends          | `ReferralPanel`            | **settings**   | Growth/referral; keep under Account or “Harvous” group—not system Settings.app.                                                         |
| Edit Name & Color         | `EditNameColorPanel`       | **settings**   | Maps to `UserMetadata` names + `userColor`; group under **Account** in native.                                                          |
| Email & Password          | `EmailPasswordPanel`       | **settings**   | Clerk-owned; native likely **SFSafariViewController** / `ASWebAuthenticationSession` / Clerk SDK—entry remains Account in app.          |
| My Data                   | `MyDataPanel`              | **settings**   | Export / import / delete; use **Data & privacy** group; destructive confirmations.                                                      |
| Verse of the Day schedule | `adminVotd` (admin)        | **admin**      | Only if `GET /api/admin/check` is admin; hide for normal users.                                                                         |
| Get Support               | `GetSupportPanel`          | **settings**   | Web today is in-app panel; native = same or mailto/link-out; group **Support & about**.                                                 |
| Letter from the Founder   | `AboutHarvousPanel`        | **settings**   | **Support & about**; rich text / scroll view.                                                                                           |
| Manage subscription       | `ManageBillingPanel`       | **web**        | Panel exists in `ProfilePage` switch; desktop shell may hide entry—billing often Clerk/Stripe **external web**; deep-link from Account. |


### Nested: My Preferences (web)


| Row                | native_primary | Notes                                                                                                                                                               |
| ------------------ | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Preferred Bible    | **settings**   | `UserMetadata.defaultTranslation`; API-backed—keep in-app, not iOS Settings.bundle.                                                                                 |
| My Church          | **settings**   | Church fields on `UserMetadata`.                                                                                                                                    |
| Lock PIN           | **settings**   | Security-sensitive; secure field, match server PIN hashing contract.                                                                                                |
| Keyboard shortcuts | **settings**   | Reference only—**iPhone omit** or single “Tips”; **iPad (hardware keyboard)** + **macOS** show full list (see `[KEYBOARD_SHORTCUTS.md](../KEYBOARD_SHORTCUTS.md)`). |


### Tag legend

- **main-nav:** Primary shell (tab bar, sidebar)—user reaches without opening “Settings”.
- **settings:** In-app Settings / Preferences stack (`NavigationStack` or preferences window)—includes Account and Support groups.
- **web:** Flow is expected to open system browser or in-app web view (Clerk, billing portal).
- **admin:** Gated by server-side admin flag; not in consumer builds or behind hidden menu.

---

## 2. iOS: `NavigationStack` + grouped sections

**Tab:** Use a **“You”** (or profile) tab that shows identity header + shortcuts, distinct from the global **Settings** drill-in.

**Recommended hierarchy**

```text
Tab: You
└─ NavigationStack
   ├─ YouRoot (ScrollView or List)
   │  ├─ Header: avatar (initials + userColor), display name, seasonal XP (optional)
   │  ├─ Section “Go to” (optional shortcuts for parity with web)
   │  │  ├─ NavigationLink → /inbox
   │  │  ├─ NavigationLink → /spaces
   │  │  ├─ NavigationLink → /sharing
   │  │  └─ NavigationLink → /achievements
   │  └─ NavigationLink("Settings") → SettingsRoot
   │
   └─ SettingsRoot (List, inset grouped)
      ├─ Section “Account”
      │  ├─ NavigationLink → EditProfile (name, color)
      │  ├─ NavigationLink → EmailAndPassword → may present WebAuth / Safari
      │  ├─ Button / Link → Subscription (web or StoreKit later)
      │  └─ Sign out
      ├─ Section “Study”
      │  ├─ NavigationLink → DefaultTranslationPicker
      │  ├─ NavigationLink → MyChurchForm
      │  └─ NavigationLink → LockPIN
      ├─ Section “General” (future)
      │  └─ Notifications, appearance, haptics, etc.
      ├─ Section “Referral”
      │  └─ NavigationLink → Referral
      ├─ Section “Data & privacy”
      │  └─ NavigationLink → MyData (export / delete)
      └─ Section “Support & about”
         ├─ NavigationLink → Support
         ├─ NavigationLink → About / Founder letter
         └─ (iPad only, keyboard attached) NavigationLink → KeyboardShortcuts
```

**Presentation choices**

- **Pickers** (Bible translation): pushed `NavigationLink` or sheet for long lists—match HIG for selection.
- **Destructive** (delete account): isolate at bottom of Data screen; use system alert + typing confirmation if paralleling web.
- **Do not** mirror the web single long card list; use **standard grouped `List`** for Settings.

---

## 3. macOS: layout decision

**Choice: `NavigationSplitView` sidebar + detail** (not a tab-only preferences window).

**Rationale**

- Matches Mail, Xcode, and Apple’s **Settings…** style apps: persistent categories, keyboard navigation between sections.
- **Keyboard shortcuts** fit naturally as a sidebar row (detail = scrollable reference)—same window as other preferences.
- Scales when you add General / Advanced without cramming tabs.

**Window chrome**

- **Menu:** `Harvous > Settings…` (**⌘,**) opens a **dedicated preferences window** (not the main document window).
- **Sidebar:** Account, Study, Data & privacy, Support & about, **Keyboard shortcuts** (always visible on Mac).
- **Detail:** Forms and explanations per category.

**Alternative (not chosen):** `TabView` inside one window—acceptable for v1 if split is deferred, but **split view is the target** for parity with platform expectations.

**Billing / Clerk:** Prefer **default browser** or `ASWebAuthenticationSession` for heavy flows unless native Clerk UI is shipped.

---

## 4. Deep links (URL scheme)

Use a single scheme for the native app (replace `harvous` with your final bundle-defined scheme). Paths are **case-sensitive**; prefer **lowercase kebab segments**.


| Path                                      | Target                                                                        |
| ----------------------------------------- | ----------------------------------------------------------------------------- |
| `harvous://settings`                      | Settings root (sidebar first item or Account on Mac).                         |
| `harvous://settings/account`              | Account section landing.                                                      |
| `harvous://settings/account/profile`      | Edit name & color.                                                            |
| `harvous://settings/account/email`        | Email & password (then Clerk/web as needed).                                  |
| `harvous://settings/account/subscription` | Billing / subscription (often opens web).                                     |
| `harvous://settings/study/translation`    | Default Bible translation.                                                    |
| `harvous://settings/study/church`         | My Church.                                                                    |
| `harvous://settings/study/lock-pin`       | Lock PIN.                                                                     |
| `harvous://settings/referral`             | Refer friends.                                                                |
| `harvous://settings/data`                 | My Data (export / privacy / delete).                                          |
| `harvous://settings/support`              | Get support.                                                                  |
| `harvous://settings/about`                | Letter from the Founder / about.                                              |
| `harvous://settings/keyboard-shortcuts`   | Shortcut reference (macOS + iPad with keyboard; no-op or redirect on iPhone). |
| `harvous://you`                           | “You” tab root (profile hub).                                                 |
| `harvous://inbox`                         | Inbox (main shell).                                                           |
| `harvous://spaces`                        | Spaces management surface.                                                    |
| `harvous://sharing`                       | Sharing surface.                                                              |
| `harvous://achievements`                  | Achievements surface.                                                         |
| `harvous://admin/votd`                    | Verse of the Day admin (only if admin; otherwise show error or ignore).       |


**Universal Links (optional):** Map `https://<app-domain>/settings/...` to the same routes so help center and email campaigns open the app when installed.

**Implementation note:** On cold start, parse `NSUserActivity` / `onOpenURL` and push the corresponding `NavigationPath` so back navigation returns to a sensible root.

---

## 5. Related docs

- `[docs/future/NAV_PROFILE_AND_ACCOUNT_SWITCHER.md](../future/NAV_PROFILE_AND_ACCOUNT_SWITCHER.md)` — web nav identity strip and future account menu.
- `[docs/KEYBOARD_SHORTCUTS.md](../KEYBOARD_SHORTCUTS.md)` — shortcut list to mirror on Mac / iPad.
- `[server/db/schema.ts](../../server/db/schema.ts)` — `UserMetadata` fields for profile parity.

