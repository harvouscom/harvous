# Audienceful email automations (product-behavior flags)

Use coarse Audienceful booleans for segments that feel helpful, not surveillant. Product event detail stays in PostHog.

## Principles

- Segment on **state** (“never created a note”), not **playback** (“you opened note X at 9pm”).
- Never put note titles, Thread titles, space names, verse text, or search queries in email copy driven by these flags.
- Prefer one gentle nudge, then stop — especially for upgrade and checkout.
- Wait **2–3 days** after `upgrade_viewed` / `checkout_started` before a follow-up.
- Use Clerk `activity_status` for recency (`active` / `cooling` / `dormant`); use product flags for “what have they done.”

## Suggested automations

| Segment | Suggested timing | Tone |
|---|---|---|
| Signed up, `has_created_note` false | Day 2–3 | Invitation to start a note — not guilt |
| Has notes, `activity_status` = dormant | After 30+ days quiet | Welcome back — avoid “you’ve been gone N days” |
| `upgrade_viewed` true, no Plus | 2–3 days later | What Plus unlocks — then quiet |
| `checkout_started` true, no convert | 2–3 days later | One recovery email — then stop |
| `has_joined_space` / `has_created_space` false | Optional, infrequent | Shared Spaces education — no FOMO |

## Thread ≠ folder

`has_created_thread` means a **2.0 study/conversation Thread** (connected notes on My Home, or Start Thread in a shared space). Creating a **folder** does not set this flag and should not trigger “you started a Thread” copy.

## Field reference

See [CLERK_AUDIENCEFUL_SETUP.md](../CLERK_AUDIENCEFUL_SETUP.md) for exact `extra_data` names and write paths.
