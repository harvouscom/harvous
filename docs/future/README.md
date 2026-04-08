# Future Features Documentation

This folder contains documentation for features planned for post-V1 release. Some have been implemented and moved to the main docs; the rest are designed and ready to implement when you're ready to build them.

## 📋 Overview

- **Implemented features:** Listed below; full docs live in the main [docs/](../) folder.
- **Planned features:** Deferred to v1.1+ (post-V1 launch). Architecture is designed and ready.

## ✅ Implemented (moved to main docs)

These were designed here and are now live. The stub files in this folder point to the canonical docs.

- **Referral Bonus** – [REFERRAL_BONUS_IMPLEMENTATION.md](./REFERRAL_BONUS_IMPLEMENTATION.md) → [../REFERRAL_BONUS_IMPLEMENTATION.md](../REFERRAL_BONUS_IMPLEMENTATION.md)
  User-facing summary: [../FEATURES.md#💳 Billing & Referrals](../FEATURES.md#-billing--referrals--implemented)
- **Locked Notes & Encryption** – [LOCKED_NOTES_ENCRYPTION.md](./LOCKED_NOTES_ENCRYPTION.md) → [../LOCKED_NOTES_ENCRYPTION.md](../LOCKED_NOTES_ENCRYPTION.md)
  Encryption: AES-GCM 256-bit, PBKDF2-SHA256 310k iterations (see main doc for full transparency). User-facing summary: [../FEATURES.md#🔒 Locked Notes & Encryption](../FEATURES.md#-locked-notes--encryption--implemented)
- **Sharing System** – Public share links and collaborative shared spaces are fully implemented.
  See [COLLABORATIVE_SHARED_SPACES.md](./COLLABORATIVE_SHARED_SPACES.md) for shared spaces details and [../SHARED_SPACES_DEV_NOTES.md](../SHARED_SPACES_DEV_NOTES.md) for current design/behavior.
- **Offline Mode** – Full offline read/write support with IndexedDB, sync queues, and conflict resolution is implemented.
  See [OFFLINE_MODE_IMPLEMENTATION.md](./OFFLINE_MODE_IMPLEMENTATION.md) for architecture reference.

## 📁 Documentation Structure (planned / not yet implemented)

### Strategy & Roadmap

- **`HARVOUS_SDK_AND_FUTURE_ROADMAP.md`** - SDK vision and future core product roadmap
  - Harvous SDK idea and why (inspired by OpenAI Apps SDK; deferred in favor of core product)
  - Contrast with share sheet/extension and MCP/API-only approaches
  - Future core features: space sharing and groups, then learning (challenges, recall/quizzes, live events)
  - Phase sequence and anti-patterns (not a dumping ground, not fragmented)

### Mobile Apps

- **`CAPACITOR_STRATEGIC_ANALYSIS.md`** - Strategic analysis for iOS/Android native apps
  - Architectural challenges (SSR → hybrid, auth migration, database strategy)
  - Effort estimates (20-32 days MVP, 6-9 weeks full offline)
  - Implementation recommendations (hybrid API approach vs offline-first)
  - App store approval considerations
  - Decision tree and ROI analysis
  - References detailed implementation guide in main docs folder

- **`NETLIFY_FUNCTION_OPTIMIZATION_AND_CAPACITOR_PREP.md`** - Reduce Netlify function usage and align web app with Capacitor-ready architecture (hybrid, caching, centralized API)

### Monetization & Business Model

- **`CLERK_MONETIZATION_ARCHITECTURE.md`** - Complete technical architecture for monetization
  - Individual user add-ons (stored in Clerk metadata)
  - Church organizations (Clerk Organizations)
  - Stripe integration patterns
  - Feature gating utilities

- **`MONETIZATION_QUICK_START.md`** - Quick reference for monetization questions
  - How Clerk Organizations work for churches
  - How add-ons work with Clerk metadata
  - Architecture summary

- **`MONETIZATION_SUMMARY.md`** - High-level overview
  - Church connection flow
  - Sharing & groups infrastructure
  - Implementation priorities

### Church Features

- **`CHURCH_CONNECTION_SYSTEM.md`** - Church connection implementation
  - User sets church → Church creates org → Auto-connection
  - Matching algorithm (name + city + state)
  - Database schema for churches
  - Connection request flow

- **`CHURCH_ORG_AND_CURRICULUM.md`** - Church org accounts & education curriculum vision
  - Vision: churches have org accounts for curriculum management; share threads/notes to attendees
  - Two layers: individual shared spaces (current) vs church-org distribution (future)
  - MyChurchPanel evolution: sync with available church organizations (Clerk), user links to church → receives curriculum
  - How curriculum flows (publish to org → inbox / “From your church” for org members)
  - References CHURCH_CONNECTION_SYSTEM, SHARING_AND_GROUPS_INFRASTRUCTURE

- **`CLERK_ORGANIZATIONS_CHURCHES_CHECKLIST.md`** - Implementation checklist for Clerk Organizations for churches
  - What to think through: church sign-up, users joining (new/existing), MyChurchPanel evolution
  - Product flows, schema, auth/backend, invites/join, edge cases, UI/UX, migration
  - Summary table and pointers to CHURCH_CONNECTION_SYSTEM, CHURCH_ORG_AND_CURRICULUM

### Sharing & Collaboration (✅ Implemented)

- **`SHARING_SYSTEM_DESIGN.md`** - Original sharing system design (implemented)
- **`SHARING_AND_GROUPS_INFRASTRUCTURE.md`** - Infrastructure analysis (implemented)
- **`SHARING_QUICK_REFERENCE.md`** - Quick comparison of sharing approaches (implemented)
- **`COLLABORATIVE_SHARED_SPACES.md`** - Collaborative shared spaces (implemented, v1 complete Feb 2026)

### Real-Time Collaboration (Planned)

- **`REALTIME_SUPABASE_PLAN.md`** - Real-time collaboration with Supabase Realtime + Tiptap
  - Phase 1: Cross-device instant sync via Supabase Broadcast (invalidation signals)
  - Phase 2: Live shared spaces with Supabase Presence ("who's online")
  - Phase 3: Collaborative note editing via Hocuspocus + Yjs + Supabase Postgres persistence
  - Incremental rollout — each phase is independently valuable
- **`REALTIME_LIVEBLOCKS_PLAN.md`** - Original Liveblocks plan (archived for reference)

### User Experience

- **`NAV_PROFILE_AND_ACCOUNT_SWITCHER.md`** - Nav profile + search (desktop & mobile): current implementation, Claude-style richer account strip, plan/subtitle/actions, and account-switching directions (Clerk, orgs, family accounts)
- **`APP_LAYOUT_APPEARANCE_CUSTOMIZATION.md`** - App layout appearance customization
  - Themes: named presets (Default, Warm, Cool, Glass, Sepia) bundling background + appearance + tone
  - Customizable background (presets + optional custom color) as theme overrides
  - Appearance mode: default paper vs glass (transparent paper, tinted colors, backdrop blur)
  - Storage, CSS variables (`data-theme`, `--app-background`), settings UI, and implementation outline
  - Key files to touch and technical notes

- **`NOTE_TEMPLATES.md`** - Note templates (future feature)
  - Pre-defined study methods (SOAP, Inductive, Bible Nerd, Topical, Chapter Summary, Comparative)
  - User-created templates and "Save as template"
  - Shared-space templates for groups
  - Implementation outline and design considerations

- **`SCRIPTURE_NOTES_FUTURE_IMPROVEMENTS.md`** - Scripture note experience improvements
  - Overlapping passages: surfacing on scripture note view + merge action (redirect refs, update pills, delete merged note)
  - Related: overlap-aware reuse at creation, check-existing overlap, detection-time longer ref
  - Bible reader / “collected verses” view: see which verses you’ve saved across the Bible (book/chapter/verse, highlight saved)
  - Data and implementation notes for each

- **`OFFLINE_MODE_IMPLEMENTATION.md`** - Offline mode architecture reference (✅ implemented)
  - Full offline read/write support with IndexedDB, sync queues, and conflict resolution

## 🎯 Implementation Priority

### ✅ Completed
- **Sharing System** — Public share links and collaborative shared spaces (implemented)
- **Offline Mode** — Full offline read/write with IndexedDB, sync queues, and conflict resolution (implemented)

### Phase 1: Church Connection (High Value)
- B2B revenue opportunity
- Automatic user discovery
- Content distribution system

### Phase 2: Native Mobile Apps (Market Expansion)
- iOS and Android native apps via Capacitor
- Requires static build and JWT-based API auth (no AuthGuard)
- 4-6 weeks for MVP (hybrid API approach)
- Increased engagement (users check apps 3-5x more than websites)
- Home screen presence
- See `CAPACITOR_STRATEGIC_ANALYSIS.md` for strategy and prerequisites
- See `../CAPACITOR_IMPLEMENTATION_GUIDE.md` for implementation steps

### Phase 3: Real-Time Collaboration (Enhanced Experience)
- Real-time group study via Supabase Realtime + Tiptap
- Cross-device instant sync
- Google Docs-style collaborative note editing

## 🗄️ Database Schema

### Add Now (Safe)
- `UserMetadata.connectedChurchId` (optional)
- `UserMetadata.connectedOrgId` (optional)

### Add Later (When Implementing Features)
- `Churches` - Church organizations
- `ChurchConnectionRequests` - Pending connections

See `CLERK_MONETIZATION_ARCHITECTURE.md` for complete database schemas.

## 🚀 When to Implement

**Not for V1:**
- All features in this folder are post-V1
- Focus on Note Types and Selected Text for V1
- Launch V1 first, then add these features

**After V1:**
- Implement based on user feedback and priorities
- All architecture is ready
- Just need to build the features

## 📚 Related Documentation

- **`../ARCHITECTURE.md`** - Core app architecture
- **`../FEATURES.md`** - Current feature set
- **`../CHANGELOG.md`** - V1 release notes and feature history

## 💡 Key Principles

1. **Design First** - All features are fully designed before implementation
2. **Flexible** - Architecture supports multiple use cases
3. **Scalable** - Built to handle growth
4. **Ready When You Are** - All documentation ready, implement when needed

---

**Status**: Some features implemented (see above); rest documented and ready for implementation post-V1 🚀

