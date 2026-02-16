# SMS & Email Capture for Harvous

## The Idea

Allow users to add notes and query their Harvous directly by texting or emailing a dedicated phone number or email address — as friction-free as sending a message to a friend.

Also send outbound nudges and digests back to users based on their activity and saved content — no AI required.

---

## Why This Is Compelling

Harvous is a Bible study and reflection tool. The moments of insight don't always happen at a desk. They happen:

- During a sermon, when you want to capture a thought quickly
- On a walk, when a verse comes to mind
- In a conversation, when you want to remember something for later
- At night, when you don't want to open an app

SMS and email are the lowest-friction capture surfaces that exist. Everyone knows how to use them. No app needed.

---

## Two Entry Points (Inbound)

### 1. SMS (Text Message)
- User is assigned a dedicated phone number
- Texting that number creates a note, adds to a thread, or queries their Harvous
- Could also support a shared shortcode (e.g., text a keyword + message to a shared number)

### 2. Email
- User gets a dedicated inbound email address (e.g., `u-abc123@in.harvous.com`)
- Emailing it creates a note from the subject/body
- Reply-to-query pattern for premium users: email a question, get a reply back

---

## Feature Tiers

### Free — Capture
The core capture flow costs infrastructure but no AI. Keep it free to maximize adoption and habit formation.

- Text or email → creates a note
- Thread routing via `#hashtag`
- Scripture reference auto-detection (same pipeline as in-app)
- Confirmation reply: "Note added ✓"
- Outbound nudges and digests (rule-based, no AI — see below)

### Premium — Ask
Querying requires LLM synthesis across notes. This is where AI cost kicks in.

- `?query` → AI-powered answer synthesized from your notes
- Email a question, get a thoughtful reply drawing from what you've written
- Conversational follow-ups

---

## Interaction Patterns

### Note Creation (Free)
```
Text: "John 3:16 is the verse I keep coming back to — love this"
→ Creates a note, detects the scripture reference, tags it
→ Reply: "Note saved ✓"
```

### Thread Routing (Free)
```
Text: "#sermon Great point about grace today"
→ Creates note in thread named "sermon"
→ Reply: "Note added to Sermon ✓"
```

### AI Query (Premium)
```
Text: "?what have I written about grace?"
→ LLM synthesizes across your notes and replies
```

```
Email subject: "What did I write about John?"
→ AI reply drawing from matching notes
```

---

## Outbound Nudges & Digests (Free, Rule-Based)

These don't require AI — just scheduled queries against existing data. Think of them as Harvous reaching back out to you.

### Weekly Digest
```
Email: "Here's what you captured this week"
→ List of notes from the last 7 days, grouped by thread, each with a deep link
→ "View all in Harvous → harvous.com/threads/sermon"
```

### On This Day
```
Text: "A year ago you wrote: 'Faith is trusting God even when...' — John 11:25
harvous.com/notes/abc123"
→ Tapping the link opens that exact note
```

### Streak / Activity Nudge
```
Text: "You haven't added a note in 5 days. Your last one was in Romans.
Pick up where you left off → harvous.com/threads/romans"
```

### Thread Nudge
```
Text: "Your 'Romans' thread has 12 notes. You haven't added to it in 3 weeks.
harvous.com/threads/romans"
→ Link goes directly to that thread
```

### Scripture Frequency Nudge
```
Email: "John 3:16 keeps showing up — you've referenced it in 4 different notes.
See them all → harvous.com/search?ref=John+3:16"
```

### Reading Plan Tie-In (Future)
```
Email: "Tomorrow's reading is Romans 8. You have 3 notes that reference it.
harvous.com/search?ref=Romans+8"
```

Every outbound message includes a deep link back into Harvous — to the specific note, thread, or relevant view. The nudge is the hook; the app is the destination. This also makes the nudges measurable: track click-through rate per nudge type to see which ones actually drive re-engagement.

These nudges work entirely from structured data: note timestamps, thread names, scripture references already parsed and stored. No LLM needed.

---

## Technical Architecture

### Inbound (Capture)
- **SMS**: Twilio or Telnyx — inbound webhook → Netlify function → notes API
- **Email**: Postmark inbound or Mailgun routes on `in.harvous.com`
- User lookup: phone number or email alias → Harvous user
- Scripture detection runs on inbound content same as in-app

### Outbound (Nudges & Digests)
- Scheduled Netlify functions (cron) query the database for nudge conditions
- Twilio for SMS outbound, Postmark/Resend for email outbound
- Per-user preferences: opt-in per nudge type, channel preference (SMS vs. email), frequency caps
- Unsubscribe via reply "STOP" (required for SMS compliance)

### Shared Infrastructure
- New DB table: `user_messaging_settings` — phone number, inbound email alias, notification preferences
- Rate limiting on inbound (prevent abuse)
- Spam filtering for email inbound
- Delivery tracking: log sent nudges to avoid repeat sends

---

## User Setup Flow

1. In profile/settings: "Connect via SMS" or "Connect via Email"
2. For SMS: enter phone number → verify with a code
3. Inbound number/email alias assigned and displayed
4. User saves "Harvous" as a contact
5. Nudge preferences: choose which outbound nudges to receive and how often

---

## Open Questions

- **Shared shortcode vs. dedicated numbers**: Dedicated numbers are cleaner UX but ~$1/month per user at scale. Shared shortcode is cheaper but requires a keyword prefix per user.
- **Reply threading**: Should a reply to a nudge ("that's a good one") create a note or start a conversation?
- **Media/MMS**: Photo texted in → OCR for scripture? Store as attachment?
- **Security**: Inbound email spoofing risk — unique-per-user addresses (harder to guess) are safer than sender-address verification alone.
- **Nudge fatigue**: Need strong defaults and easy opt-out. Start with weekly digest only, let users unlock more.
- **International SMS**: Costs vary significantly. May start US-only.

---

## Prior Art / Inspiration

- **Poke app** — SMS-first interaction model
- **Readwise** — daily digest emails from highlights, "On This Day" resurfacing
- **Shortwave** — smart email digests
- **Duolingo** — streak nudges done well (and done annoyingly — learn from both)
- **Drafts app** — frictionless capture, process later

---

## Potential Tagline

> "Text it to Harvous. It'll be there when you're ready to dig in."

---

## Status

Idea stage. No implementation started.

Good first proof of concept: Twilio inbound webhook → Netlify function → create note via existing notes API. That alone validates the free capture tier with minimal new infrastructure.
