# Future Features Documentation

This folder contains documentation for features planned for post-V1 release. Some have been implemented and moved to the main docs; the rest are designed and ready to implement when you're ready to build them.

## 📋 Overview

- **Implemented features:** Listed below; full docs live in the main [docs/](../) folder.
- **Planned features:** Deferred to v1.1+ (post-V1 launch). Architecture is designed and ready.

## ✅ Implemented in code (moved to main docs)

These were designed here and have implementation in the main product code. “Implemented” does not by itself mean
production-live or paid-launch verified; follow each linked canonical document's operational status.

- **Referral Bonus** – [REFERRAL_BONUS_IMPLEMENTATION.md](./REFERRAL_BONUS_IMPLEMENTATION.md) → [../REFERRAL_BONUS_IMPLEMENTATION.md](../REFERRAL_BONUS_IMPLEMENTATION.md)
  User-facing summary: [../FEATURES.md#💳 Billing & Referrals](../FEATURES.md#-billing--referrals--implemented)
- **Locked Notes & Encryption** – [LOCKED_NOTES_ENCRYPTION.md](./LOCKED_NOTES_ENCRYPTION.md) → [../LOCKED_NOTES_ENCRYPTION.md](../LOCKED_NOTES_ENCRYPTION.md)
  Encryption: AES-GCM 256-bit, PBKDF2-SHA256 310k iterations (see main doc for full transparency). User-facing summary: [../FEATURES.md#🔒 Locked Notes & Encryption](../FEATURES.md#-locked-notes--encryption--implemented)
- **Sharing System** – Public note links and the July 2026 Shared Spaces v1 loop are implemented in code. Shared
  Spaces migration, disposable release E2E, production smoke, and paid billing verification remain launch gates.
  [../SHARED_SPACES_DEV_NOTES.md](../SHARED_SPACES_DEV_NOTES.md) is canonical. The older
  [COLLABORATIVE_SHARED_SPACES.md](./COLLABORATIVE_SHARED_SPACES.md) is retained only as superseded history.
- **Offline Mode** – Full offline read/write support with IndexedDB, sync queues, and conflict resolution is implemented.
  See [OFFLINE_MODE_IMPLEMENTATION.md](./OFFLINE_MODE_IMPLEMENTATION.md) for architecture reference.

## 📁 Documentation Structure (planned / not yet implemented)

### Strategy & Roadmap

- **`HARVOUS_SDK_AND_FUTURE_ROADMAP.md`** - SDK vision and future core product roadmap
  - Harvous SDK idea and why (inspired by OpenAI Apps SDK; deferred in favor of core product)
  - Contrast with share sheet/extension and MCP/API-only approaches
  - Future core features: space sharing and groups, then learning (challenges, recall/quizzes, live events)
  - Phase sequence and anti-patterns (not a dumping ground, not fragmented)

- **`TECH_STACK_SCALING_ASSESSMENT.md`** - Stack fit for scaling and future vision
  - Verdict on current stack vs alternatives (Next, Firebase, Capacitor, etc.)
  - Scaling bottlenecks: Netlify function, cross-client sync, realtime collab
  - Recommended evolution paths (not rewrites)

### Scripture Intelligence

- **`SCRIPTURE_KNOWLEDGE_LAYER.md`** - Shared canonical knowledge layer (themes, people, places, cross-references) over Scripture, sourced from open datasets (TSK, OpenBible.info, Easton's)
  - Deterministic connections between a user's notes with no AI at runtime; grounds future AI features
  - Flagship near-term win: passage-aware auto-folder/auto-tag (uses a note's cited passages, not just its prose)
  - Phased roadmap: schema + data pipeline → connection layer → auto-tag/folder → resurfacing → suggested threads → AI grounding

- **`SCRIPTURE_AI_GROUNDING_PHASE_5.md`** - Phase 5 decision doc: grounding **Review** (personal AI quizzes) on the knowledge layer
  - Web-first Mistral Small runtime; shared grounding context builder
  - Review always paid and individual; GMMC deferred; Compete via Season Pass
  - Links [MONETIZATION_AND_PRICING.md](./MONETIZATION_AND_PRICING.md) for SKUs

- **`MEMORY_LAYER_ASSESSMENT.md`** - Honest assessment of the memory layer vs. a "scripture-centered memory graph" vision + roadmap
  - Scorecard: canonical knowledge graph is built; resurfacing intelligence on top is half-built (strong on structure, thin on time/narrative)
  - Three co-equal workstreams: passage memory fingerprints (substrate) → forgetting-aware resurfacing → recall trails & study arcs ("living commentary")
  - Deterministic-first, server-derived for native parity; persist per-note fingerprint but no edge-graph visualization
  - Reuses existing `prototype-home-trends.ts`, `scripture-knowledge.ts`, `passage-aware-tags.ts`, `study-thread-graph.ts`

- **`STUDY_SURFACES_AND_KNOWLEDGE_UX.md`** - UX exploration: Easton's, ISBE expand, topical/knowledge layer surfaces across study docks, Home, sidebar list views, and inspector
  - Maps lexicon vs passage-graph layers to concrete UI affordances
  - Candidate datasets: Scripture Interpreting Scripture (phrase cross-refs), Nave's (topic browse), Harvous-authored chains (Thompson-like paths)
  - Current-state audit, brainstorm by surface, cross-surface flows, prioritization matrix (P0–P3)
  - Complements the data-layer roadmap in SCRIPTURE_KNOWLEDGE_LAYER.md

### Monetization & Business Model

- **`MONETIZATION_AND_PRICING.md`** - Pricing strategy (Review, Shared Spaces, Season Pass, future Group Leader and church organization principles)
  - Review vs Compete split; Group Leader hosts spaces without member Review
  - Planning Center competitive positioning for future church org (pricing TBD)

- **`CLERK_MONETIZATION_ARCHITECTURE.md`** - Technical architecture for monetization (Clerk metadata, Stripe, org patterns)

- **`MONETIZATION_QUICK_START.md`** - Quick reference: SKU table, Review vs Compete, Clerk patterns

- **`MONETIZATION_SUMMARY.md`** - Brief index: church connection + sharing; points to canonical pricing doc

### Mobile Apps

- **`CAPACITOR_STRATEGIC_ANALYSIS.md`** - Strategic analysis for iOS/Android native apps
  - Architectural challenges (SSR → hybrid, auth migration, database strategy)
  - Effort estimates (20-32 days MVP, 6-9 weeks full offline)
  - Implementation recommendations (hybrid API approach vs offline-first)
  - App store approval considerations
  - Decision tree and ROI analysis
  - References detailed implementation guide in main docs folder

- **`NETLIFY_FUNCTION_OPTIMIZATION_AND_CAPACITOR_PREP.md`** - Reduce Netlify function usage and align web app with Capacitor-ready architecture (hybrid, caching, centralized API)

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

### Sharing & Collaboration

- **`../SHARED_SPACES_DEV_NOTES.md`** - Canonical July 2026 behavior: My Home ownership, `SpaceNotes`,
  responses, Threads, permissions, and lifecycle
- **`../SHARED_SPACES_TESTING.md`** - Disposable E2E and canonical-association migration runbook
- **`SHARED_SPACES_LAUNCH_STRATEGY.md`** - Launch promise, operational gates, and verified claims
- **`SHARED_SPACES_ROADMAP.md`** - v1.1, v1.2, v2, and long-term sequence
- **`SPACE_MODES_PRODUCT.md`** - Canonical product rules and limits
- **`SHARING_SYSTEM_DESIGN.md`**, **`SHARING_AND_GROUPS_INFRASTRUCTURE.md`**,
  **`SHARING_QUICK_REFERENCE.md`**, and **`COLLABORATIVE_SHARED_SPACES.md`** - Retired February/Classic
  designs retained for historical context under superseded notices

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

- **`QUESTION_HIGHLIGHT_SUGGESTIONS_NATIVE.md`** - Interrogative sentences: wavy inline suggestion + tap to create anchored study highlight (native TextKit exploration; implementation reverted — doc only)

- **`OFFLINE_MODE_IMPLEMENTATION.md`** - Offline mode architecture reference (✅ implemented)
  - Full offline read/write support with IndexedDB, sync queues, and conflict resolution

## 🎯 Implementation Priority

### ✅ Implemented in code
- **Sharing System** — Public share links and collaborative Shared Spaces are implemented; production and paid
  launch verification are tracked in `SHARED_SPACES_LAUNCH_STRATEGY.md`
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

### Phase 3: Shared-space freshness
- Production-verify realtime invalidation first
- Add presence and event unread state only after invalidation is reliable
- Treat same-note collaborative editing as optional, long-term, and evidence-led

## 🗄️ Database Schema

### Add Now (Safe)
- `UserMetadata.connectedChurchId` (optional)
- `UserMetadata.connectedOrgId` (optional)

### Add Later (When Implementing Features)
- `Churches` - Church organizations
- `ChurchConnectionRequests` - Pending connections

See `CLERK_MONETIZATION_ARCHITECTURE.md` for complete database schemas.

## 🚀 When to Implement

**Not automatically current:**
- This folder mixes future plans with retired historical designs.
- Follow each file's status notice and prefer linked canonical docs for shipped behavior.
- Shared Spaces sequencing is in `SHARED_SPACES_ROADMAP.md`.

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

**Status**: Mixed current roadmap and historical planning; verify each document's status before implementation.

