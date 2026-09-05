# Monetization & Church Connection Summary

> **Superseded.** The $4 / $6 / $15–19 ladder below is a retired draft, kept for its reasoning
> only. Live prices are $6/mo · $36/yr for Plus, with no founding discount — see
> [MONETIZATION_AND_PRICING.md](./MONETIZATION_AND_PRICING.md).

**Canonical pricing and SKUs:** [MONETIZATION_AND_PRICING.md](./MONETIZATION_AND_PRICING.md) — Review,
Group Sharing, Season Pass, Group Leader, church org principles.

This doc remains a brief index for church connection and sharing infrastructure. Implementation
priorities below are superseded by the rollout sequence in MONETIZATION_AND_PRICING.md Section 8.

---

## Consumer model (summary)

| Product | Paid? | Notes |
|---|---|---|
| Notes + Remember | Free | Unlimited notes; passive resurfacing |
| **Review** | Yes ($4/mo) | Personal AI from own notes; always individual |
| **Group Sharing** | Yes ($6/mo) | Unlimited owned shared spaces (live today) |
| **Compete** | Free track + Season Pass | Communal challenges; not personal Review |
| **Group Leader** | Yes (~$15–19/mo) | Host spaces; members join free; no member Review |
| **Church org** | TBD | Curriculum; optional bulk Review seats |

---

## Church connection (unchanged flow)

**How it works:**

- Users set their church in Profile → My Church (already implemented)
- Churches create Clerk Organizations when they join
- System matches users to churches using name + city + state
- Users get connection requests → Accept → connected
- Church content can appear in inbox

**Key files:**

- [CHURCH_CONNECTION_SYSTEM.md](./CHURCH_CONNECTION_SYSTEM.md)
- [CHURCH_ORG_AND_CURRICULUM.md](./CHURCH_ORG_AND_CURRICULUM.md) — monetization ladder + Planning Center positioning
- [CLERK_MONETIZATION_ARCHITECTURE.md](./CLERK_MONETIZATION_ARCHITECTURE.md) — technical patterns

---

## Sharing infrastructure (ready)

- Shared spaces, Members, inbox — implemented
- Tier limits: [server/utils/tier-limits.ts](../../server/utils/tier-limits.ts)
- Product rules: [SPACE_MODES_PRODUCT.md](./SPACE_MODES_PRODUCT.md), [SHARED_SPACES_DEV_NOTES.md](../SHARED_SPACES_DEV_NOTES.md)

---

## Next steps

1. **Review + Phase 5 AI** — [SCRIPTURE_AI_GROUNDING_PHASE_5.md](./SCRIPTURE_AI_GROUNDING_PHASE_5.md)
2. **Billing entitlements** — extend beyond `free` | `unlimited`
3. **Season Pass** — first Compete season
4. **Group Leader** SKU
5. **Church org pricing research** — vs Planning Center Groups/curriculum
