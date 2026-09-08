# Monetization Quick Start Guide

> **Superseded prices.** The Review / Group Sharing / Season Pass / Group Leader ladder below is
> a retired draft. Live prices are $6/mo · $36/yr for Plus, with no founding discount — see
> [MONETIZATION_AND_PRICING.md](./MONETIZATION_AND_PRICING.md).

**Product SKUs and prices:** [MONETIZATION_AND_PRICING.md](./MONETIZATION_AND_PRICING.md) (canonical).

**Technical billing (Clerk, Stripe, metadata):** [CLERK_MONETIZATION_ARCHITECTURE.md](./CLERK_MONETIZATION_ARCHITECTURE.md).

---

## Consumer SKUs (recommended pre-launch)

| SKU | Monthly | Yearly | Gates |
|---|---|---|---|
| **Review** | $4 | $36 | Personal AI quiz sessions (always individual, always paid) |
| **Group Sharing** | $6 | $48 | Unlimited owned shared spaces (live as Premium / `unlimited`) |
| **Season Pass** | — | $5–8 once | Full Compete season study guide |
| **Group Leader** | ~$15–19 | TBD | Host spaces; members join free; Review not included |
| **Church org** | TBD | TBD | Curriculum + leader seats; see church doc |

**Free forever:** unlimited notes, Remember nudges, current Compete free track, deterministic practice (no LLM).

---

## Quick Answers

### Q: What is Review vs Compete?

**Review** — personal practice from *your* notes (paid, individual). **Compete** — Harvous themed seasons
and community challenges (free track + optional Season Pass). Separate products.

### Q: Does Group Leader include Review for members?

**No.** Leader pays to host shared spaces. Each member buys **Review** separately if they want AI from
their own notes.

### Q: Should churches use Clerk Organizations?

**Yes (future).** Clerk Organizations for church staff; congregants connected via DB. Pricing TBD —
position vs Planning Center Groups/curriculum, not full ChMS. See
[CHURCH_ORG_AND_CURRICULUM.md](./CHURCH_ORG_AND_CURRICULUM.md).

### Q: How do add-ons work with Clerk?

Store entitlements in Clerk `public_metadata` and/or `UserMetadata` in Postgres (DB is source of truth
for `tier` during Stripe transition). Stripe webhooks update entitlements. Feature gates:
`hasReview`, `hasGroupSharing`, `hasGroupLeader` (future — today only `free` | `unlimited` for sharing).

---

## Architecture Summary

```
Individual Users
├── Review (personal AI)
├── Group Sharing (collaboration)
└── Season Pass (one-time)

Group Leader
├── Pays for hosting + admin
└── Members join spaces free; Review is per-person

Church Org (future)
├── Pays for curriculum + leader seats
└── Optional bulk Review seat packs (individual claim)
```

---

## Next Steps

1. **Read:** [MONETIZATION_AND_PRICING.md](./MONETIZATION_AND_PRICING.md)
2. **Implement Review:** [SCRIPTURE_AI_GROUNDING_PHASE_5.md](./SCRIPTURE_AI_GROUNDING_PHASE_5.md)
3. **Technical billing:** [CLERK_MONETIZATION_ARCHITECTURE.md](./CLERK_MONETIZATION_ARCHITECTURE.md)
