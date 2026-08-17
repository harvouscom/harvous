# Harvous North Star

> "Keep your Bible app. Just add Harvous."

---

## What Harvous Is

Harvous is not a Bible reading app. It never will be.

It does render Scripture, though. A passage view exists so you can see everything you have
already saved laid out in the order the text runs — a different angle on your own highlights and
notes, not a reading experience competing for your daily-reading habit. The notes layer stays
primary: the passage view surfaces study you already have, and a highlight made there becomes a
note like any other rather than a loose annotation living off to the side.

Harvous is **the hub for Bible study** — the place where everything you learn, save, reflect on, and remember lives. No matter what app you study in (YouVersion, Logos, Olive Tree, your church's app, a podcast, a sermon), Harvous is where it goes so it doesn't disappear.

The value proposition is simple: **the more you put in, the more useful it becomes.** Notes compound. Scripture references connect. Patterns emerge. And over time, Harvous knows your study like nothing else does.

---

## The Flywheel

```
Add more → Harvous gets more useful
               ↓
        More useful → more reasons to come back
               ↓
        Come back → add more
```

Every feature should either:
1. Make it easier to **add** (SMS capture, email, SDK, API integrations)
2. Make what you've added **more valuable** (nudges, quizzes, challenges, social)
3. Both

---

## The Four Pillars

### 1. Capture (Add Everything)
Harvous should accept notes from anywhere with zero friction:
- In-app notes and threads
- SMS and email capture (text it in, it's saved)
- SDK and API — so other Bible apps and developers can send study content directly to Harvous
- Web clipper, share sheet, Siri shortcut — any surface where a thought happens

The tagline here: **"Wherever you study, Harvous is there."**

### 2. Remember (Surface What Matters)
Passive resurfacing of what you've saved — no AI required:
- On This Day — a note from a year ago
- Scripture frequency nudges — "John 3:16 keeps showing up for you"
- Weekly digests — what you captured this week
- Thread nudges — "you haven't revisited Romans in 3 weeks"
- Reading plan tie-ins — "tomorrow's passage connects to 3 of your notes"

The tagline here: **"You saved it. We'll make sure you don't forget it."**

> Substrate: [SCRIPTURE_KNOWLEDGE_LAYER.md](./SCRIPTURE_KNOWLEDGE_LAYER.md) — a shared, deterministic scripture knowledge layer (themes, people, places, cross-references from open datasets) that powers this resurfacing with no AI, and grounds the Learn pillar's AI features.

### 3. Learn (Active Review)
Duolingo-style challenges and memory checks built from your own content:
- Quizzes generated from your notes ("You wrote about grace 8 times — let's test you")
- Memory checks for scripture references you've saved
- Fill-in-the-blank, recall prompts, connection challenges
- Spaced repetition logic to surface what needs review

This is where AI earns its keep — generating meaningful questions from your actual notes, not generic trivia.

The tagline here: **"Study smarter. Review what's actually yours."**

**Customer-facing name:** **Review** (paid, individual subscription). The Learn pillar is internal
architecture; users buy **Review** to practice from their own notes. Pricing and SKUs:
[MONETIZATION_AND_PRICING.md](./MONETIZATION_AND_PRICING.md). Runtime AI: Phase 5
[SCRIPTURE_AI_GROUNDING_PHASE_5.md](./SCRIPTURE_AI_GROUNDING_PHASE_5.md).

### 4. Compete (Social Layer)
Duolingo-style leagues and seasonal challenges — but Bible-specific:
- Public seasonal challenges available to all Harvous users
- Challenges are based on a theme (e.g., "The Psalms", "Paul's Letters", "Names of God")
- Each challenge has pre-built study guides created by Harvous
- Your saved notes and threads serve as your personal cheat sheet going in
- Leagues group users by activity level — weekly XP, streaks, quiz scores
- Public leaderboards for the season; resets each season

This is where having more in Harvous gives you a real advantage — your notes are your preparation. Power users who've been capturing for years are genuinely better equipped.

The tagline here: **"Your notes are your edge."**

**Monetization:** Compete is separate from **Review**. Current season stays **free to play**; full
study guides and archive depth via **Season Pass** (one-time per season). Personal AI from your notes
remains **Review**, not bundled into Compete or Group Leader. See
[MONETIZATION_AND_PRICING.md](./MONETIZATION_AND_PRICING.md).

---

## The SDK & API as a Growth Strategy

The SDK and API aren't just developer tools — they're the mechanism by which Harvous becomes the hub.

If YouVersion could add a "Save to Harvous" button, every serious Bible student using YouVersion becomes a potential Harvous user. Same for Logos, Olive Tree, sermon note apps, podcast apps, church apps.

- **Inbound integrations**: Other apps push highlights, notes, bookmarks into Harvous
- **Outbound integrations**: Harvous surfaces data back (e.g., "your Harvous notes on this passage")
- **Webhooks**: Third-party apps can trigger on new Harvous notes
- **Developer ecosystem**: Churches and ministries build on Harvous as infrastructure

The more integrations exist, the more Harvous becomes the default place Bible study data lives — which makes every other feature (remember, learn, compete) more powerful.

The apps are **feeders**. The people are **Harvesters**.

---

## What Harvous Deliberately Does Not Do

- **No Bible reading app** — YouVersion, Logos, and Olive Tree own the daily-reading habit. Partner with them, don't compete. The passage view is the one carve-out, and a narrow one: it exists to show you your own highlights and notes against the text. No reading plans, no streaks, no devotional content. If it ever starts competing for the reading habit itself, it has drifted.
- **No sermon streaming** — Same. Plenty of apps for that.
- **No devotional content** — Harvous surfaces *your* content, not generic content.
- **No social feed of Bible verses** — Not a content platform. A personal study hub with a social *layer* on top of your own work.

Every feature request should be filtered through: "Does this help people capture, remember, learn, or compete with their own Bible study?" If not, it probably belongs in a different app.

---

## The Long Game

A user who has been adding to Harvous for 3 years has something irreplaceable:
- Hundreds of notes across dozens of threads
- Scripture references connected across time
- A personal map of their spiritual journey through Scripture
- A cheat sheet that took years to build

That's not something they'd delete. That's not something a competitor can easily replicate. That's **lock-in through genuine value** — the best kind.

The goal is for Harvous to be the app people say: *"I've been using this for years and I couldn't imagine studying without it."*

---

## Status

Vision doc. Use this as a filter for feature prioritization and roadmap decisions.

Current pillars in progress:
- **Capture**: Core in-app notes ✓, SMS/Email capture (planned — see SMS_AND_EMAIL_CAPTURE.md), SDK (in progress)
- **Remember**: XP/achievements ✓, nudges via SMS/email (planned)
- **Learn**: Not started
- **Compete**: Not started
