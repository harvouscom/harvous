# Space modes — product rules

**Status:** Canonical product reference for My Home, shared spaces, and reserved public spaces in the July 2026
native-like shell. Engineering details live in
[SHARED_SPACES_DEV_NOTES.md](../SHARED_SPACES_DEV_NOTES.md).

## Glossary

| Term | Product meaning |
|---|---|
| **My Home** | The complete private aggregate of every note the signed-in person authors. It is always available and is the canonical ownership context. |
| **Named private space** | A private organizational context owned by one person. |
| **Shared space** | A live audience and organization context created as shared. It reuses canonical notes through `SpaceNotes`; it does not own copies of members' notes. |
| **Owner** | The creator/billing anchor and active membership with full management authority. |
| **Member** | An active membership that can read the space, associate authored notes, attach authored notes to Threads, and respond. |
| **Public space** | Reserved future broadcast context where owner/leaders publish and followers read or save attributed copies. No v1 creation path exists. |

“Mode” describes the experience framing. “Space” is the object users create, join, switch, rename, or delete. UI
actions should say **space**, not “create a mode.”

## Core invariant: ownership and audience are separate

My Home remains complete regardless of where a note is shared. A person may associate one authored note with
several spaces. Each shared context can independently organize it with folders, pins, order, and Threads.
Responses also belong to their space conversation.

This yields three distinct actions:

- Compose in **My Home** → private canonical note.
- Compose in **This space** → canonical My Home note plus a space association.
- Existing note → author uses **Add to space**; non-author uses **Save a copy** with attribution.

Switching context never migrates ownership.

## Limits

| Dimension | Free | Shared Spaces add-on |
|---|---:|---:|
| Owned shared spaces | 0 | Up to 10 |
| Joined shared spaces | Unlimited | Unlimited |
| People per shared space | 30 | 30 |
| Joining | Free | Free |

The owner pays to create/host. Joining is always free. The old free shared-space allotment and “Unlimited/Group
Sharing” membership model are retired without grandfathering.

## Per-context behavior

| Capability | My Home/private | Shared space | Public space (future) |
|---|---|---|---|
| Authored notes visible | Complete private aggregate | Active associated notes | Published associated notes |
| Canonical owner | Author | Author | Author |
| Compose | Private note | My Home note + association | Owner/leader only |
| Organization | Private | Isolated per space | Isolated per space |
| Threads | Personal | Owner starts/current pin; members view and attach own notes | To be designed |
| Responses | Personal author tools | Space-scoped passage responses | To be designed |
| Public note link UI | Available where allowed | Hidden | To be designed |
| Encrypted notes | Supported privately | Excluded | Excluded |

Internal identifiers such as `StudyThreadEntries` may remain in schema and code for anchored responses. The
feature name presented to users is **Thread** or **Threads**.

## Activity boundaries

Note Activity is a note-level response index. In My Home it groups responses by space; inside a space it shows
only the relevant space. Persistent overlays appear only in that explicit space context.

Space activity is separate. It summarizes new notes and other space events relative to the member's visit
watermark. Future unread work must preserve this separation.

## Lifecycle

- Removing a note archives only its space association.
- Leaving or member removal archives that person's authored associations and preserves responses they left on
  other people's notes.
- Re-sharing restores the conversation but not prior folders, pins, order, or Thread attachments.
- Shared-space deletion hides and revokes immediately, is owner-recoverable for 30 days in Settings, then purges
  space-level records while preserving canonical notes.

## Privacy

- Shared note access always requires an explicit context, active membership, and active association.
- Invite preview is metadata-only.
- Non-owner member views omit email.
- Encrypted notes never enter shared/public contexts.
- From My Home, a warning precedes public-link creation for a note also associated with shared spaces.

## Routing

On dedicated native-like hosts, including localhost, the authenticated shell is rooted at `/`; note routes are
`/{id}`. An optional `?space={spaceId}` carries explicit shared context. `/prototype` is legacy-only on
non-dedicated hosts.

## Related documents

- [SHARED_SPACES_DEV_NOTES.md](../SHARED_SPACES_DEV_NOTES.md)
- [SHARED_SPACES_TESTING.md](../SHARED_SPACES_TESTING.md)
- [SHARED_SPACES_ROADMAP.md](./SHARED_SPACES_ROADMAP.md)
- [MENTION_PILLS.md](./MENTION_PILLS.md)
