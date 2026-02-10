# XP and Achievements (Current)

**Last Updated:** February 2026

This doc describes the **current** XP and achievements behavior. For the planned badges and expanded milestones system, see [Achievements and Badges System (Future)](future/achievements-and-badges-system.md).

---

## Seasonal XP: Date Ranges

XP is grouped into seasons. Each season is a fixed calendar range. The logic lives in `src/utils/season-helpers.ts`.

| Season | Months | Season ID (e.g.) | Display name |
|--------|--------|------------------|--------------|
| **Spring** | March 1 – May 31 | `spring-2025` | Spring 2025 |
| **Summer** | June 1 – August 31 | `summer-2025` | Summer 2025 |
| **Fall** | September 1 – November 30 | `fall-2025` | Fall 2025 |
| **Winter** | December 1 – February 28/29 | `winter-2025` | Winter 2025 |

**Winter year:** Winter is labeled by the year of **December**. So December 2025, January 2026, and February 2026 all count as **Winter 2025**.

---

## Current XP System

- **Seasonal XP:** Total XP earned in the current season (from `UserSeasonalXP` for that season).
- **Lifetime XP:** Total XP ever (from `UserLifetimeXP`, or sum of all `UserXP` if no aggregate).
- **Past seasons:** Stored in `UserSeasonalXP`; the achievements API returns all seasons except the current one so the UI can show “Past Seasons.”

Activity types that award XP include: session completed, creation bonus, church added, monthly attendance, weekly streaks (see `src/utils/xp-system.ts`).

---

## Current Achievements Panel

**My Achievements** (e.g. `MyAchievementsPanel.tsx`) currently shows:

- Seasonal XP card (current season name + total)
- Lifetime XP card (“All Time”)
- Past Seasons (expandable list of previous seasons with XP, when the user has more than one season)
- “Milestones and Badges coming soon” placeholder

Lifetime milestone tiers (100, 500, 1K, 5K, 10K, 25K, 50K) are checked by the API but the full badges/milestones UI is not yet implemented.

---

## Related Files

- `src/utils/season-helpers.ts` – Season boundaries and display names
- `src/utils/xp-system.ts` – XP calculation, `UserSeasonalXP`, `UserLifetimeXP`, `UserXP`
- `src/components/react/MyAchievementsPanel.tsx` – Achievements panel UI
- `src/pages/api/user/achievements.ts` – Achievements API
- `db/config.ts` – `UserXP`, `UserSeasonalXP`, `UserLifetimeXP` schema
