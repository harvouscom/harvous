# Space modes — product rules

**Status:** Canonical product reference for how additional spaces behave relative to **My Home**, aligned with [redesign-exploration.md](./redesign-exploration.md) (Concept 2 — Spaces as modes, not folders). **Data model is unchanged:** one `Spaces` table, membership for collaboration, `isPublic` / share tokens as today.

**Implementation:** Tier enforcement lives in [server/utils/tier-limits.ts](../../server/utils/tier-limits.ts). Shared-space visibility and permissions: [SHARED_SPACES_DEV_NOTES.md](../SHARED_SPACES_DEV_NOTES.md).

---

## 1. Glossary

| Term | Meaning |
|------|--------|
| **My Home** | The default **aggregate** study surface: dashboard route (`/`), not a dedicated `Spaces` row. In the space switcher it is the synthetic **“home”** item. Threads and notes can appear here without belonging to a named space. |
| **Named private space** | A `Spaces` row you own, **not** treated as “shared” for limits: no active share link and **no** `Members` rows (other than the implicit owner via `Spaces.userId`). Organizes threads/notes under a chosen title and color. |
| **Shared space** | A space that is **collaborative**: has a share link (`shareToken`) and/or at least one **Member** (see [SHARED_SPACES_DEV_NOTES.md](../SHARED_SPACES_DEV_NOTES.md)). Counts toward **owned shared space** limits for the owner. |
| **Owner** | `Spaces.userId` — full control (edit, delete, share link, remove others’ items from the space, etc.). |
| **Member** | Row in `Members` for that `spaceId` — can contribute and manage own items; cannot delete the space or change space-level sharing. |
| **Public space** *(future)* | Product concept: read-heavy / discovery context. **Not a separate table today** — would still be a `Spaces` row with appropriate flags and UX. Rules TBD when scoped. |

### “Mode” vs “Space” (user-facing language)

| Use **mode** | Use **space** |
|--------------|----------------|
| Marketing, onboarding, and high-level redesign copy when emphasizing **study environment** (private vs collaborative vs future public). | Navigation labels, forms, and technical UI: **New Space**, **My Spaces**, **Edit space**, error messages that reference limits or URLs. |
| Explaining *why* switching contexts feels different (tint, density, presence). | Any action that creates, deletes, or renames a container tied to a `spaceId`. |

**Rule:** *Mode* is the **experience framing**; *space* is the **product object** users create and switch. Avoid replacing every “space” with “mode” in the shell UI — it confuses actions (“create a mode”).

---

## 2. Limits matrix (free vs paid)

Canonical business rules below match [SHARED_SPACES_DEV_NOTES.md](../SHARED_SPACES_DEV_NOTES.md) and [server/utils/tier-limits.ts](../../server/utils/tier-limits.ts).

| Dimension | Free (`unlimited_notes` absent) | Paid / unlimited tier (`unlimited_notes` present) |
|-----------|----------------------------------|-----------------------------------------------------|
| **Named private spaces** | No dedicated cap in product rules (subject to reasonable abuse safeguards later if needed). | Same |
| **Owned shared spaces** | **3** max (spaces you own that count as “shared” per `getSharedSpacesOwnedCount`) | **Unlimited** |
| **Spaces you can join** | **Unlimited** memberships | **Unlimited** |
| **Members per owned space** | **150** (soft UX; not marketed as a headline number) | **150** |

**Definition — “owned shared space”:** A space where `Spaces.userId` is you **and** (share token is set **or** there is at least one member). See `getSharedSpacesOwnedCount` in [server/utils/tier-limits.ts](../../server/utils/tier-limits.ts).

**Grandfathering:** Users who already exceed a new cap keep existing data; enforcement blocks *new* actions that would violate limits (create shared space, first share/member where applicable).

---

## 3. Invariants vs per-mode UX

### Invariants (all modes / all spaces)

- Same **APIs** and **Postgres** model: `Spaces`, `Threads`, `Notes`, `Members`, junction tables.
- **Thread/note graph** and scripture processing behave the same; no second content pipeline per mode.
- **Item-level share links** remain independent of space-level visibility (see two-layer visibility in shared spaces doc).
- **Locked notes** (`contentEncrypted`): never shown to non-owners in shared contexts; owner still sees their own locked notes in their space (see shared spaces doc).

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
