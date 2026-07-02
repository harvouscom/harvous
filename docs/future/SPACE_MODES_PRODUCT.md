# Space modes — product rules

**Status:** Canonical product reference for how additional spaces behave relative to **My Home**, aligned with [redesign-exploration.md](./redesign-exploration.md) (Concept 2 — Spaces as modes, not folder-style stacks). **Data model (July 2026 clean break):** one `Spaces` table with a `type` discriminator (`personal` | `shared` | `public`), membership via `SpaceMemberships` (owner included as a role), invites via `SpaceInvites`. The legacy `isPublic` / `shareToken` columns and `Members` / `SpaceInvitations` tables are retired — see [SHARED_SPACES_DEV_NOTES.md](../SHARED_SPACES_DEV_NOTES.md).

**Implementation:** Tier enforcement lives in [server/utils/tier-limits.ts](../../server/utils/tier-limits.ts). Shared-space visibility and permissions: [SHARED_SPACES_DEV_NOTES.md](../SHARED_SPACES_DEV_NOTES.md).

---

## 1. Glossary

| Term | Meaning |
|------|--------|
| **My Home** | The default **aggregate** study surface: dashboard route (`/`), not a dedicated `Spaces` row. In the space switcher it is the synthetic **“home”** item. Threads and notes can appear here without belonging to a named space. |
| **Named private space** | A `Spaces` row you own with `type='personal'` — organizes threads/notes under a chosen title and color; no `SpaceMemberships` rows besides your own future-role placeholder (none created today for personal spaces). |
| **Shared space** | A `Spaces` row with `type='shared'` — collaborative from creation (no personal→shared conversion). Owning one requires the Shared Spaces paid add-on; joining is free. See [SHARED_SPACES_DEV_NOTES.md](../SHARED_SPACES_DEV_NOTES.md). |
| **Owner** | `Spaces.userId` (creator/billing anchor) **and** the `SpaceMemberships` row with `role='owner'` — full control (edit, delete, manage invites, remove others’ items from the space, etc.). |
| **Member** | Row in `SpaceMemberships` with `role='member'` for that `spaceId` — can contribute and manage own items; cannot delete the space or manage invites. |
| **Public space** *(future)* | `Spaces` row with `type='public'` — reserved, not yet implemented. Harvous-hosted broadcast: owner/leader author, members follow + copy into their own space. See [SHARED_SPACES_DEV_NOTES.md](../SHARED_SPACES_DEV_NOTES.md#public-spaces-future-not-implemented). |

### “Mode” vs “Space” (user-facing language)

| Use **mode** | Use **space** |
|--------------|----------------|
| Marketing, onboarding, and high-level redesign copy when emphasizing **study environment** (private vs collaborative vs future public). | Navigation labels, forms, and technical UI: **New Space**, **My Spaces**, **Edit space**, error messages that reference limits or URLs. |
| Explaining *why* switching contexts feels different (tint, density, presence). | Any action that creates, deletes, or renames a container tied to a `spaceId`. |

**Rule:** *Mode* is the **experience framing**; *space* is the **product object** users create and switch. Avoid replacing every “space” with “mode” in the shell UI — it confuses actions (“create a mode”).

---

## 2. Limits matrix (free vs paid)

Canonical business rules below match [SHARED_SPACES_DEV_NOTES.md](../SHARED_SPACES_DEV_NOTES.md) and [server/utils/tier-limits.ts](../../server/utils/tier-limits.ts).

| Dimension | Free (no Shared Spaces add-on) | Shared Spaces add-on |
|-----------|----------------------------------|-----------------------------------------------------|
| **Named private spaces** | No dedicated cap in product rules (subject to reasonable abuse safeguards later if needed). | Same |
| **Owned shared spaces** | **0** — owning any shared space requires the add-on | **Unlimited** |
| **Spaces you can join** | **Unlimited** memberships, always free | **Unlimited** |
| **Members per owned space** | **150** (soft UX; not marketed as a headline number) | **150** |

**Definition — “owned shared space”:** A space where `Spaces.userId` is you and `Spaces.type === 'shared'`. See `getSharedSpacesOwnedCount` in [server/utils/tier-limits.ts](../../server/utils/tier-limits.ts).

**No grandfathering (July 2026 clean break):** the prior 3-shared-space free allotment and the `unlimited` tier are retired outright — zero users were grandfathered in because the legacy `Members`/`SpaceInvitations` model was retired wholesale, not migrated. See [SHARED_SPACES_DEV_NOTES.md](../SHARED_SPACES_DEV_NOTES.md#the-clean-break).

**Customer-facing names (billing):** `UserMetadata.sharedSpacesAddOn` (boolean) is the source of truth — see [SHARED_SPACES_DEV_NOTES.md](../SHARED_SPACES_DEV_NOTES.md#entitlement--the-shared-spaces-add-on). The add-on is marketed as **Shared Spaces** ($6/mo · $48/yr), superseding the retired **Group Sharing** SKU (same price point). **Review** (personal AI) is a separate subscription — no bundle SKU. See [MONETIZATION_AND_PRICING.md](./MONETIZATION_AND_PRICING.md). **Group Leader** (leader pays to host; members join spaces free; Review stays individual) is a future SKU distinct from Shared Spaces.

---

## 3. Invariants vs per-mode UX

### Invariants (all modes / all spaces)

- Same **APIs** and **Postgres** model: `Spaces`, `Threads`, `Notes`, `SpaceMemberships`, junction tables.
- **Thread/note graph** and scripture processing behave the same; no second content pipeline per mode.
- **Item-level share links** remain independent of space-level visibility (see two-layer visibility in shared spaces doc).
- **Locked notes** (`contentEncrypted`): never shown in shared contexts, for any viewer — including the note's own author (see shared spaces doc).

### May differ by mode (UX / presentation — target state from redesign)

| Aspect | Private study (My Home + named private) | Shared space | Public *(future)* |
|--------|-------------------------------------------|--------------|-------------------|
| **Visual treatment** | Warm, minimal; no member presence | Collaborative tint; optional activity / presence | Discovery, read-leaning layout |
| **Sharing chrome** | Per-item share controls where applicable | Space-level join/link; hide per-item share UI for viewers | TBD |
| **Navigation emphasis** | Default landing; space switcher lists My Home first | Same routes; context is active `spaceId` | TBD |

**v1 non-goals for “modes”:** No new tables solely for modes; no change to how notes are stored. Mode is **surfaced intent**, not a duplicate hierarchy.

---

## 4. Defaults: landing, deep links, creation

### Default landing

- After sign-in and for generic entry: **`/` (My Home / dashboard)** unless a redirect URL preserves another destination (e.g. join/invite flows per [AGENTS.md](../../AGENTS.md) Clerk guidance).

### Deep links and `?space=`

- Thread and note links may include **`?space=`** so list context matches the space the user was browsing ([OrganizedContentList](../../src/components/react/OrganizedContentList.tsx), search results).
- **Selected space** persistence: [selectedSpace.ts](../../src/components/react/navigation/selectedSpace.ts) (`harvous-selected-space-id`; normalized `home` → aggregate).

### Content creation default scope

- **From My Home:** New threads/notes are created in the **default personal context** (not forced into a named space unless the user picks one).
- **From a named space route** (`/space/{id}` or equivalent): New content is associated with **that space** when the creation entry point is space-scoped (e.g. FAB “add to this space”).
- **Switching space** updates list scope and link query params; it does not migrate existing notes without an explicit user action.

### Long-term content model (product stance)

- **Allowed:** Notes and threads that live only under **My Home** (no named space), **or** under one or more named spaces, per existing many-to-many patterns.
- **Not required:** Every item must belong to a named private space. My Home remains the always-available default surface.

---

## 5. Related docs

- [redesign-exploration.md](./redesign-exploration.md) — Modes framing and native UX direction.
- [NAVIGATION_HIERARCHY_REDESIGN.md](./NAVIGATION_HIERARCHY_REDESIGN.md) — Space switcher hierarchy.
- [SHARED_SPACES_DEV_NOTES.md](../SHARED_SPACES_DEV_NOTES.md) — Permissions, visibility, shared-space UI rules.
