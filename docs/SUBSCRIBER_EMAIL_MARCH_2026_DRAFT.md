# Harvous — March 2026 updates (subscriber email draft)

**Purpose:** Review copy for your next email. Synthesized from `release-notes/*-march-2026.md`, `Changelog/` (feat/fix summaries), and March 2026 git history (excluding version-bump and asset-cache churn).

**Version span (approx.):** 1.180 → 1.211 (March 2–28, 2026)

**Post-March edits (product copy):** The **note cap is removed**—everyone has **unlimited notes**. Paid value is shifting toward **optional add-ons** rather than buying “more notes.” Server-side **rate limits** on note creation reduce scripted abuse; you generally **don’t** need to spell out numbers in email.

---

## Suggested subject lines (pick one)

- What we shipped in March: translations, calmer loading, and unlimited notes  
- March at Harvous: Bible translations, smoother navigation, and notes without a cap  
- Your March recap: scripture upgrades, iOS fixes, and a simpler plan for everyone  

---

## Opening paragraph (email body)

Here’s a concise version you can paste and tune:

> March was a busy month. We focused on three things: making **scripture notes** richer (including **multiple translations** and clearer previews), making the app feel **calmer and clearer** when you open the dashboard and switch spaces, and strengthening what happens **offline** and on **shared threads**. **Notes are now unlimited for every account**—no counting toward a ceiling—while we get ready for **optional paid add-ons** down the road. We also polished the experience for **new signups** and **iPhone users** who use Harvous as an installed app.

---

## Highlights for subscribers (grouped by theme)

### Scripture & translations

- **Multiple Bible translations** with **user preferences** so you can work in the translation that fits your study.  
- **Richer scripture note experience:** better processing pipeline (including a **per-user queue** for scripture reference work), improved handling alongside **threads**, and **smarter filtering** on the dashboard so scripture content surfaces the way you expect.  
- **Translation in the UI:** previews show translation context; **ScriptureNoteForm** and **CardFullEditable** support choosing and viewing translations more clearly; empty states for default translation are clearer.  
- **Shared threads:** **Referenced scripture notes** now show up correctly on **shared thread** pages and in **card previews** (fix for a gap when others view your thread).

### Onboarding & first-run experience

- **New users** are guided to an **onboarding thread** instead of landing cold on the dashboard.  
- The app **ensures that onboarding thread exists** before the first content load, with fixes around **onboarding thread creation** and routing for sign-in/sign-up.  
- **Account deletion** flow and related handling were improved.

### Loading, sync, and “where is my stuff?”

- **Loading toasts** on **Dashboard** and **Space** pages so initial loads feel intentional instead of ambiguous.  
- **Sync status:** **SyncManagerIsland** and improved **sync handling** give clearer feedback when data is catching up.  
- **Offline indicator** styling updated for **better visibility** so you can tell when you’re offline at a glance.  
- **Offline reliability:** **idempotent mutations** (retry-safe changes) and broader **offline capability** improvements reduce duplicate or lost actions when connectivity is spotty.

### Navigation, spaces, and organization

- **Space-aware navigation:** better **filtering and scoping** for notes and threads when you work inside a space; **history tracking** and **active thread** behavior are more consistent.  
- **My Pile** and **note counts** (including **note-type counts** in navigation data) are handled more accurately—less confusion when things sit outside a tidy folder.  
- **Search and space routes** now reflect **thread colors** so scanability matches the rest of the app.  
- **Back navigation** controls gained a **`backIconDirection`** option for clearer affordances in nested flows.  
- **Thread context** handling was enhanced end-to-end (including scripture-heavy threads).

### Plans, notes, and what’s next

- **Unlimited notes** for all users—no free-tier note cap; create as many notes as you need for study.  
- **Premium / Clerk “Unlimited”** remains meaningful for things like **shared-space limits** (e.g. how many shared spaces you can own on the free tier vs. paid)—not for unlocking note count. Tune this sentence to match your live marketing.  
- **Roadmap:** optional **paid add-ons** for specific features; say only as much as you’re ready to announce.  
- **Season bonus** for engagement (ties into your existing XP/gamification model).  
- **Behind the scenes:** **rate limits** on how fast new notes can be created (API, sync batches, import) to reduce automated abuse. In email you might say *“we’ve added safeguards so the service stays fair and reliable”*—**omit** specific numbers unless you want a technical audience.

### iOS PWA & safe areas

- Multiple fixes for **safe area insets** (notch, home indicator) in **standalone / installed** mode: **status bar**, **app layout padding**, **modal and drawer overlays**, and **bottom sheets**.  
- Internal **troubleshooting doc** added for iOS sheet/modal overlay quirks (you can mention *“better behavior when Harvous is installed on iPhone”* without linking to internal docs).

### Polish & trust

- Large **semantic CSS migration** across panels, forms, and complex components—cleaner, more consistent styling without changing your workflow.  
- **Clerk** sign-in/up **form styles** refined for **responsiveness**; later March work also **integrates Clerk** more cleanly in forms (per latest commits).  
- **Editor dependencies** updated with **editor functionality** improvements.  
- **Production hardening** (search, logging, tests, security middleware experiments)—mostly invisible, but contributes to **stability and search quality**. Frame as *“reliability and performance under the hood”* if you mention it at all.

### Infrastructure (optional one-liner)

- The app’s data layer moved from **Turso to Supabase (Postgres)** in March. For subscribers, the message is usually: **same product, stronger foundation for growth and reliability**—only include if you’re comfortable naming the change.

---

## Short “changelog style” list (if you prefer bullets only)

1. Multiple Bible translations + preferences  
2. Scripture notes: previews, forms, dashboard filtering, thread integration, shared-thread fixes  
3. Onboarding thread for new users + smoother first load  
4. Loading toasts (dashboard & spaces) + card stack animation polish  
5. Sync/offline: clearer indicator, idempotent saves, fewer edge-case failures  
6. Navigation & spaces: filtering, history, counts, unorganized threads, thread colors in search  
7. **Unlimited notes** for everyone (no note cap)  
8. Season engagement bonus  
9. iOS installed-app layout (safe areas, sheets, modals)  
10. Visual consistency pass (semantic CSS, Clerk forms)  

---

## What to skip or soften in a public email

- **CSRF middleware** back-and-forth, **Drizzle `Date` vs ISO string** fixes, **pooler URL**—these are engineering details.  
- **“Asset references and service worker cache”** commits—deployment noise.  
- **“Real-time collaboration plan”** in v1.193 release notes is **planning/docs**, not a shipped feature—don’t imply live co-editing unless it exists in the product.  
- **TypeScript / test** fixes—say *“stability fixes”* if anything.  
- **Exact note-creation rate limits** (per minute/hour, sync batch size)—internal operations detail unless you’re writing for developers.

---

## Closing line (optional)

> Thanks for studying with Harvous. If something still feels off after these updates, reply to this email—we read every note.

---

## Source of truth in the repo

| Source | Path |
|--------|------|
| User-facing release notes (March) | `release-notes/v1.*-march-2026.md` |
| Technical per-version entries | `Changelog/*.md` (matched to March commits) |
| High-level history (mostly pre-March) | `docs/CHANGELOG.md` |
| Note limits & rate limiting (current product) | `server/utils/subscription.ts`, `src/utils/rate-limit.ts` |

*Generated for review; edit tone and remove any bullets that don’t match what you want to promise in production.*
