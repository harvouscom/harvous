# Family Accounts

**Status:** Future feature — not yet implemented  
**Last updated:** 2026-04-08

---

## Overview & Motivation

Harvous is currently built around single-person adult accounts. As churches adopt Harvous for congregation-wide content distribution, a natural adjacent need emerges: families who want to use Harvous together.

The Family Accounts feature adds a lightweight family layer that lets parents see and engage with their children's Harvous activity, share a dedicated Family Space for content, and manage everyone under a single billing plan. It is designed to complement (not replace) the church layer — a family connected to a Harvous-enabled church inherits that church's content automatically.

**Why this matters:**
- Families are a natural adoption unit — one parent discovering Harvous is a likely entry point for the whole household
- Parents investing in their children's spiritual formation want visibility and shared context
- Families already using a church that's on Harvous benefit from a unified experience
- Family plans create a natural paid upgrade path beyond individual accounts

---

## Roles

| Role | Description |
|---|---|
| **Parent / Guardian** | Creates or administers the family account. Has full visibility into child accounts. Manages billing and membership. Can add content to the Family Space. |
| **Child** | A member designated by a parent. Has their own independent Harvous account. Parents see all their content. Receives church content inherited from the parent's church affiliation. |
| **Adult Member** | A family member who has transitioned out of the child role (or was invited as an adult). Retains family membership voluntarily. Parents no longer have visibility into their content. |

A family must have at least one Parent/Guardian. There is no hard limit on the number of Parents — two guardians per household is the common case, but blended families may have more.

---

## Family Creation & Invite Flow

### Creating a family

1. A Harvous user (must be on a Family plan) opens Settings → Family → "Create a Family."
2. They name the family (e.g., "The Johnson Family") and become the first Parent/Guardian.
3. They receive a shareable invite link and/or can send email invitations to family members.

### Inviting members

- Parents can invite any email address.
- When sending an invite, the parent designates the invitee as **Child** or **Parent/Guardian**.
- The role can be changed later by any Parent/Guardian.
- If the invitee already has a Harvous account, they receive an in-app notification and inbox item. If not, the invite email prompts them to create an account.
- A child invited who doesn't yet have an account gets a simplified onboarding flow appropriate for a younger user joining an existing family.

### Accepting an invite

- Invitee clicks the link, signs in (or creates an account), and confirms they want to join the family.
- For users already in another family as primary, they're informed they'll be joining as a secondary family member (see Multi-Family below).

---

## Visibility & Privacy Model

### What parents can see

Parents have **full visibility** into child accounts:
- All notes and threads created by the child
- The child's scripture activity and highlights
- XP, streaks, and engagement stats
- The child's spaces and shared space memberships

This visibility is read-only — parents cannot edit a child's personal notes or threads.

### What children can see from parents

Children can see their parents' content only through the normal sharing mechanisms (shared spaces, public share links). There is no automatic reverse visibility.

### Adult members

Once a family member transitions to the Adult Member role (or opts out entirely), parent visibility is revoked. The adult member's content becomes fully private from that point forward. Historical data the parent saw before the transition is no longer surfaced.

### No content injection into personal accounts

Parents cannot push notes, threads, or inbox items directly into a child's personal account. Shared content lives in the **Family Space** (see below), which children can browse and read but that does not appear in their personal library unless they explicitly add it.

---

## Family Space

Every family account gets a single shared **Family Space** — a standard Harvous Space that all family members can read, and that Parents/Guardians can add content to.

**Behavior:**
- Automatically created when the family is created; named after the family by default (e.g., "Johnson Family").
- All family members are automatically added as members when they join the family.
- Parents/Guardians can create threads and notes inside the Family Space.
- Children can read all content in the Family Space.
- Children can add their own notes or threads to the Family Space if the parent has enabled that permission (off by default — toggle in family settings).
- Members leaving the family lose access to the Family Space.

**Relationship to existing Spaces:**
- The Family Space is a first-class Harvous Space under the hood, using the existing `Spaces` + `Members` tables.
- It is tagged as a family-owned space (`family_id` foreign key, `spaceType: 'family'`) so the UI can surface it distinctly.
- The owner (`userId`) is the primary Parent/Guardian who created the family.

---

## Church Membership Inheritance

When a Parent/Guardian links to a church in their Harvous profile, **all child accounts in the family automatically inherit that church affiliation.**

**What this means:**
- Church-pushed content (inbox items, threads, notes) targeted to a church's congregation is delivered to child accounts as well.
- The child's profile shows the church affiliation (read-only; cannot be independently changed while they are a child member).
- If the family's primary parent removes or changes their church affiliation, child accounts update accordingly.
- Adult Members are not affected — their church affiliation is their own to manage.

**Multi-parent households:**
- If both parents have church affiliations and they differ, children inherit the affiliation of the **primary Parent/Guardian** (the account that created the family or is designated primary).
- This edge case should be surfaced clearly in family settings with a prompt to resolve it.

---

## Billing Model

Family plans are tiered flat-rate subscriptions managed by the Parent/Guardian who owns the family.

| Plan | Members | Price (suggested) |
|---|---|---|
| **Family Small** | Up to 4 members | TBD |
| **Family Large** | Up to 8 members | TBD |

- All members under the family are covered by the family plan — no individual subscriptions needed.
- If a family member already has an individual unlimited plan, they can link to the family and their individual plan is paused/cancelled (with a grace period and clear UX warning).
- If the family owner cancels or downgrades, all members revert to free-tier individual accounts. Children are notified via inbox.
- Member count includes all roles: Parents, Children, and Adult Members.
- Billing is managed through Clerk Billing (same as existing individual plans). A new `CLERK_FAMILY_SMALL_PLAN_ID` and `CLERK_FAMILY_LARGE_PLAN_ID` env var would be added.

---

## Adulthood Transition Flow

Child accounts do not automatically transition — the "child" designation is a role, not age-gated. Transition happens in one of two ways:

### Child-initiated opt-out
1. The child (from their own account settings) can request to leave the family or change their role to Adult Member.
2. They see a clear explanation: "Leaving the child role means your parents will no longer be able to see your content."
3. On confirmation, their role becomes Adult Member (or they leave the family entirely).
4. Parents receive an in-app notification that the family member has transitioned.

### Parent-initiated upgrade
1. A Parent/Guardian can change a member's role from Child → Adult Member in family settings.
2. This immediately revokes parent visibility into that member's personal content.

### Staying as an Adult Member
Adult Members remain on the family billing plan and retain access to the Family Space. They can also leave the family at any time, at which point they revert to a standalone individual account.

---

## Multi-Family / Split Household

A user (especially a child) can belong to more than one family account simultaneously.

**Primary family designation:**
- One family is marked as **primary**. Church membership inheritance flows from the primary family's parent.
- Billing coverage also comes from the primary family's plan.
- The user can change their primary family in settings.

**Visibility:**
- Parents in any family the child belongs to have the same full visibility — membership in a second family does not restrict the first family's parents.
- If two families both include the same child, both sets of parents can see the child's content independently.

**Leaving a family:**
- A child can leave a non-primary family at any time without affecting their primary family membership.
- Leaving the primary family prompts the user to either designate a new primary or become fully independent.

---

## Data Model Sketch

The following tables and fields would need to be added or modified. This is a design sketch, not a final schema.

### New table: `Families`

```
id           text (PK)
name         text
createdBy    text (userId — primary guardian)
createdAt    timestamp
planType     text ('family_small' | 'family_large')
isActive     boolean
```

### New table: `FamilyMembers`

```
id           text (PK)
familyId     text (FK → Families)
userId       text (FK → UserMetadata)
role         text ('parent' | 'child' | 'adult_member')
isPrimary    boolean  -- is this the user's primary family?
joinedAt     timestamp
invitedBy    text (userId)
inviteToken  text (unique, nullable)
inviteStatus text ('pending' | 'accepted' | 'declined')
```

### Modified: `Spaces`

Add:
```
spaceType    text (default 'personal', add 'family' | 'church')
familyId     text (nullable, FK → Families)
```

### Modified: `UserMetadata`

Add:
```
primaryFamilyId   text (nullable, FK → Families)
```

### Modified: `InboxItems` / `UserInboxItems`

The `targetAudience` field on `InboxItems` would be extended to support `'family_children'` as a church-level targeting option.

Church-to-family inheritance would be handled in the inbox assignment job: when a church pushes content to `'all_members'`, the assignment job also fans out to child accounts whose primary family parent belongs to that church.

---

## Open Questions & Future Considerations

- **Notification controls**: Should parents receive notifications when a child creates a note or reaches a milestone, or is passive visibility sufficient?
- **Child content filters**: Should parents be able to restrict what content types a child can create (e.g., no lock-encrypted notes for children)?
- **Family challenges**: Could a parent create a scripture reading challenge for the whole family, trackable through the Family Space?
- **Age suggestion (not enforcement)**: Even without hard age gating, should Harvous suggest a child-appropriate UI skin for accounts designated as children?
- **Church admin targeting**: Once the church layer is built, church admins should be able to target "families with children" or "youth members" specifically — the `FamilyMembers.role` field enables this.
- **Family leaderboards / shared XP view**: Parents might enjoy a family XP summary — aggregate engagement across all family members.
- **Granular child privacy toggle**: A future iteration might let parents grant specific children more privacy (e.g., a teenager's journal notes) — for now, it's all-or-nothing full visibility.
- **Onboarding for child accounts**: A simplified signup flow for children (invited by a parent) that skips church affiliation, billing, and other adult-first setup steps.
- **Family plan + individual plan coexistence**: Edge case where an adult member on the family plan also wants features gated behind an individual unlimited plan — may need a "family + individual top-up" model.
