# Messaging & Email Capture for Harvous

## The Idea

Allow users to add notes and query their Harvous directly by messaging a bot or emailing a dedicated address — as friction-free as texting a friend.

Also send outbound nudges and digests back to users based on their activity and saved content — no AI required.

---

## Why This Is Compelling

Harvous is a Bible study and reflection tool. The moments of insight don't always happen at a desk. They happen:

- During a sermon, when you want to capture a thought quickly
- On a walk, when a verse comes to mind
- In a conversation, when you want to remember something for later
- At night, when you don't want to open an app

Messaging and email are the lowest-friction capture surfaces that exist. Everyone knows how to use them. No app switch needed.

---

## Three Entry Points (Inbound)

### 1. Telegram Bot ⭐ Primary Recommendation
- User connects their Telegram account to Harvous in settings
- Messaging the Harvous bot creates notes, routes to threads, queries their Harvous
- Group chats map directly to shared Harvous spaces — everyone in the group can contribute notes
- **Free** — Telegram Bot API has no per-message cost
- Rich replies with inline buttons, formatting, and media support

### 2. Email
- User gets a dedicated inbound email address (e.g., `u-abc123@in.harvous.com`)
- Emailing it creates a note from the subject/body
- Reply-to-query pattern for premium users: email a question, get a reply back
- Low cost via Postmark or Mailgun inbound routing

### 3. SMS — Universal Fallback
- For Harvesters who won't install Telegram
- User verifies their phone number in settings
- Texting a dedicated number creates notes
- Less capable than Telegram (no groups, no rich replies, character limits)
- Has per-message cost via Twilio — may be US-only initially

---

## Why Telegram First

| | Telegram | SMS | Email |
|---|---|---|---|
| Cost | **Free** | ~$0.01/msg | Low |
| Group support | **✓ Native** | ✗ | Limited |
| Rich replies + buttons | **✓** | ✗ | Partial |
| Deep links as buttons | **✓** | URL only | URL only |
| International | **✓ Free** | Expensive | ✓ |
| Media/photo support | **✓** | MMS only | ✓ |
| Setup friction | Install Telegram | Just text | Just email |
| No smartphone needed | ✗ | ✓ | ✓ |

Telegram is free, richer, supports groups natively, and works globally. Build it first. Add SMS later as the universal fallback for users who won't install Telegram.

---

## Feature Tiers

### Free — Capture
The core capture flow. Keep it free to maximize adoption and habit formation.

- Message or email → creates a note
- Thread routing via `#hashtag`
- Scripture reference auto-detection (same pipeline as in-app)
- Confirmation reply with deep link button
- Group chat → shared Harvous space (Telegram)
- Outbound nudges and digests (rule-based, no AI — see below)

### Premium — Ask
Querying requires LLM synthesis across notes. This is where AI cost kicks in.

- `?query` → AI-powered answer synthesized from your notes
- Email a question, get a thoughtful reply drawing from what you've written
- Conversational follow-ups in Telegram

---

## Interaction Patterns

### Note Creation (Free)
```
Telegram/SMS: "John 3:16 is the verse I keep coming back to — love this"
→ Detects scripture reference, creates note
→ Reply: "Note saved ✓" [View in Harvous →]
```

### Thread Routing (Free)
```
Telegram/SMS: "#sermon Great point about grace today"
→ Creates note in thread named "sermon"
→ Reply: "Added to Sermon ✓" [View thread →]
```

### Group Chat → Shared Space (Telegram, Free)
```
Group: "Sunday Sermon Notes"
→ Anyone in the group types their note
→ Bot saves it to the linked Harvous shared space
→ Bot confirms: "@derek's note saved ✓" [View space →]
```

### AI Query (Premium)
```
Telegram/SMS: "?what have I written about grace?"
→ LLM synthesizes across your notes and replies inline

Email subject: "What did I write about John?"
→ AI reply drawing from matching notes
```

---

## Outbound Nudges & Digests (Free, Rule-Based)

These don't require AI — just scheduled queries against existing data. Think of them as Harvous reaching back out to you. Every message includes a deep link or inline button back to the specific note, thread, or view — the nudge is the hook, the app is the destination.

### Weekly Digest
```
Telegram/Email: "Here's what you captured this week"
→ List of notes from the last 7 days, grouped by thread
→ Each note has a [View →] inline button (Telegram) or deep link (email)
→ "View all → harvous.com/threads/sermon"
```

### On This Day
```
Telegram: "A year ago you wrote: 'Faith is trusting God even when...' — John 11:25"
[View note →]  [Save as new note →]
```

### Streak / Activity Nudge
```
Telegram: "You haven't added a note in 5 days. Your last one was in Romans."
[Pick up where you left off →]
```

### Thread Nudge
```
Telegram: "Your 'Romans' thread has 12 notes. You haven't added to it in 3 weeks."
[Open Romans →]
```

### Scripture Frequency Nudge
```
Email: "John 3:16 keeps showing up — you've referenced it in 4 different notes."
[See them all → harvous.com/search?ref=John+3:16]
```

### Reading Plan Tie-In (Future)
```
Telegram: "Tomorrow's reading is Romans 8. You have 3 notes that reference it."
[View your Romans notes →]
```

These nudges work entirely from structured data: note timestamps, thread names, scripture references already parsed and stored. No LLM needed. Click-through rate per nudge type is trackable to see which ones actually drive re-engagement.

---

## Technical Architecture

### Telegram Bot
- **Library**: [Grammy](https://grammy.dev) — TypeScript-first, lightweight, perfect for Netlify functions
- **Bot token**: free from @BotFather on Telegram
- Inbound webhook → Netlify function → parse message → create note via existing notes API
- User lookup: Telegram user ID → Harvous user (linked at setup)
- Group chat ID → Harvous shared space (linked by admin of the group)
- Outbound: Grammy sends rich replies with inline keyboard buttons

```ts
// Basic shape — /api/telegram/webhook.ts
const bot = new Bot(process.env.TELEGRAM_BOT_TOKEN);

bot.on("message:text", async (ctx) => {
  const user = await getUserFromTelegramId(ctx.from.id);
  const note = await createNote(user.id, ctx.message.text);

  await ctx.reply("Note saved ✓", {
    reply_markup: {
      inline_keyboard: [[
        { text: "View in Harvous →", url: `https://harvous.com/notes/${note.id}` }
      ]]
    }
  });
});
```

### Email Inbound
- **Postmark** inbound processing or **Mailgun** routes on `in.harvous.com`
- Catch-all on inbound domain — email prefix identifies the user
- Strip signatures, quoted replies
- Scripture detection runs same as in-app

### SMS (Fallback)
- **Twilio** or **Telnyx** — inbound webhook → Netlify function → notes API
- User lookup: verified phone number → Harvous user
- Plain text replies only, URLs for deep links

### Outbound Nudges
- Scheduled Netlify functions (cron) query DB for nudge conditions
- Grammy for Telegram outbound (inline buttons, rich formatting)
- Postmark/Resend for email outbound
- Twilio for SMS outbound (fallback users only)
- Per-user preferences: channel, nudge types, frequency caps
- Delivery log to avoid repeat sends

### Shared Infrastructure
- New DB table: `user_messaging_settings` — Telegram user ID, phone number (optional), email alias, notification preferences
- Rate limiting on inbound
- Spam filtering for email inbound

---

## User Setup Flow

**Telegram**
1. In settings: "Connect Telegram"
2. Tap the link → opens Telegram → starts a chat with @HarvousBot
3. Bot sends a one-time verification code → user pastes it back in Harvous
4. Connected. User can now message the bot or add it to a group

**Group Chat Setup (Telegram)**
1. Admin adds @HarvousBot to their Telegram group
2. Bot posts: "Hi! Link this group to a Harvous shared space to start saving notes."
3. Admin taps link → selects or creates a shared space in Harvous
4. Group is linked. All messages from group members save to that space.

**Email**
1. In settings: "Connect Email Capture"
2. Unique inbound address generated and shown
3. User saves it as a contact or email alias

**SMS**
1. In settings: "Connect SMS"
2. Enter phone number → verify with a code
3. Number is saved and linked to account

---

## Open Questions

- **Reply as note**: Should a reply to a Telegram nudge ("that's a good one") create a new note automatically?
- **Media**: Photo sent to Telegram bot → OCR for scripture text? Store as attachment?
- **Nudge fatigue**: Start with weekly digest only on by default. Let users opt into more.
- **Group moderation**: In a linked Telegram group, does every message get saved or only ones starting with a command? Probably opt-in per message is better — don't want casual conversation becoming notes.
- **SMS international**: Start US-only, Telegram covers international for free in the meantime.

---

## Prior Art / Inspiration

- **Poke app** — SMS/messaging-first interaction model
- **Readwise** — daily digest emails, "On This Day" resurfacing
- **Duolingo** — streak nudges done well (and done annoyingly — learn from both)
- **Notion's Slack integration** — save messages to a workspace
- **Drafts app** — frictionless capture, process later

---

## Potential Taglines

> "Message it to Harvous. It'll be there when you're ready to dig in."
> "Your small group's notes. One place."

---

## Status

Idea stage. No implementation started.

**Best first proof of concept**: Set up a Telegram bot with Grammy, connect it to the existing notes API, and test saving a note via message. Telegram setup takes minutes and costs nothing — lowest possible barrier to validate the concept.

**Build order**: Telegram → Email → SMS
