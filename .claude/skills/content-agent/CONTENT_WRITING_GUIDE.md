# Content Agent — Thread & Note Writing Guide

Use this when drafting **thread titles, subtitles, and note bodies** (onboarding, shared spaces, admin content, demo packs). For **UI/component work**, skip this file.

**Before drafting:** Read [`docs/BRAND_VOICE.md`](../../../docs/BRAND_VOICE.md) — it is the authoritative Harvous voice. (From repo root: `docs/BRAND_VOICE.md`.) This guide adds study-content patterns on top of that voice.

---

## 1. Harvous brand voice for study content

External sources (Bible Project, GotQuestions, Bible Engagement Project) inform **structure and depth**. **Delivery is always Harvous.**

### Core alignment

| Principle | In practice for notes |
|-----------|------------------------|
| Friend who gets it | Sound like a thoughtful peer, not a lecturer or preacher |
| Humans help humans. Tools only help. | Content equips people; it does not replace community or the Spirit |
| Humbly confident | Clear where the text is clear; honest where scholars disagree; avoid “the Bible obviously proves…” |
| No “insights” | Use thoughts, notes, reflections, discoveries, what you’re noticing |
| Positive framing | Prefer “here’s one way to read this” over “don’t misread this” |
| Warmly inclusive | “Whether you’re new to this or you’ve read it many times…” |
| Practically focused | Concrete next steps: read a passage, follow a helpful link, revisit a verse |

### Words to avoid in study copy

Revolutionary, transform, optimize, leverage, master, advanced, expert, powerful, ultimate, unlock, maximize, insights, professional (as hype), elite, best-in-class.

### Content-specific before / after

**Before (corporate Bible-speak):**  
“Unlock transformative insights through this powerful deep dive into advanced hermeneutics.”

**After (Harvous):**  
“Here’s a simple path through the passage—what it meant then, what it might mean for us now, and a few verses worth sitting with.”

**Before (preachy):**  
“You must apply this today or you’re missing God’s will.”

**After (Harvous):**  
“If one line sticks with you this week, that’s enough. You can always come back to the rest.”

**Before (cold academic):**  
“The pericope exhibits deuteronomistic themes.”

**After (Harvous):**  
“This story echoes themes you’ll see across the Old Testament—especially the idea that God keeps his promises even when people don’t.”

### Parenthetical asides

Use sparingly (about one per paragraph max): “(that’s a big word for…),” “(if you’re short on time, start here).”

---

## 2. Thread patterns

A **thread** is a small journey: several notes that belong together in one arc.

### Discussion questions (not in this guide)

**Do not** author standalone notes that are mainly discussion prompts or group question lists. That shape is **reserved for a future note type**. Keep threads to explanatory, narrative, and scripture-centered notes (`default` / `scripture`). You can still mention “talk about this in your group” in passing inside prose—just avoid a dedicated prompt-list note.

### Series shape

1. **Welcome / how to use** — who this is for, how to read the notes (order vs. jump around), kindness and safety where relevant (study ≠ counseling).
2. **Core notes** — each note one main idea or movement; titles ≤ 50 characters.
3. **Further reading** (optional) — when useful, weave labeled external links into a core or closing note; “we don’t endorse every sentence” where appropriate.

### Pacing

- **Bible Project–style arc:** Hook → context → text/literary connections → meaning woven through → gentle landing (no separate “application lecture”).
- **BEP-style rhythm:** Shorter notes, passage-first, room for daily or weekly return; written so a non-expert can follow (without a separate discussion-prompt note type).
- **Mixed audiences:** Offer an optional “if you want to go deeper” line (e.g. read Mark 14–16) without requiring it.

### Thread title & subtitle

- **Title:** Clear, human, under 50 characters when used as a card title.
- **Subtitle:** Optional; adds flavor or scope (e.g. “A short walk through Easter”).

---

## 3. Note type recipes

For **authored packs** (shared spaces, admin content, demos), use only **`default`** and **`scripture`** until other types are explicitly enabled for your task. See `CardNote` for UI behavior.

### `default`

- Main workhorse: explanations, narratives, welcome/housekeeping, “further reading” links inside prose when needed.
- **Not** for: long lists of group discussion questions (reserved for a future note type).
- Use semantic HTML: `<p>`, `<h2>` / `<h3>`, `<ul>` / `<ol>`, `<strong>`, `<em>`, `<a href="https://...">`.
- One primary purpose per note; if you need two big ideas, split into two notes.

### `scripture`

- Centered on a passage or set of verses: read, observe, wonder.
- Still use Harvous voice; scripture does the heavy lifting—your words frame and invite, not drown the text.
- Cite references clearly; quote key lines when it helps (see §4).

### `resource` (not ready)

**Do not** set `noteType: "resource"` on new authored content yet—the resource experience is **not shipped** for this workflow. If you need links or reading suggestions, put a short list inside a **`default`** note with context, or split across notes—still no dedicated “resource card” type in packs until product says otherwise.

---

## 4. Scripture reference guidelines

Inspired by **GotQuestions** (citation density with argument) and **The Bible Project** (every reference does work).

### When to cite

- Every **claim about what “the Bible says”** should be tied to a book/chapter (and verse when it matters).
- **Cross-references** when they illuminate echoes or themes—not to show off.
- **Key verses:** short quote + reference, or reference only if the audience will recognize it.

### How much

- **Explanatory note:** roughly **8–20 references** in a full note is a healthy band; adjust for length. Avoid long stretches with zero scripture; avoid lists of citations with no connective prose.
- **Welcome / housekeeping note:** fewer refs OK.

### Format

- **No parentheses around references.** Use the reference in the sentence or set off with a comma or em dash—never `(John 3:16)` / `(Romans 3:23)`. In **TipTap HTML** for authored packs, use **plain text** for references—do not wrap them in `<strong>`; detection and pills work without bold, and the card stays visually calm.
- **Chapter-only strings are not enough for pills.** Harvous detection expects `Book chapter:verse` (with an optional verse range in the same chapter), e.g. **1 Corinthians 15:1–58**, not bare **1 Corinthians 15** or **Mark 14–16**. Multi-chapter spans must be written as separate chapter ranges (Mark 14:1–72, Mark 15:1–47, …) or left as prose without expecting a pill.
- In markdown examples below, bold marks the reference for readability only: **John 3:16**, “As **Romans 3:23** puts it, …”, or “…everyone—**Romans 3:23** is blunt about that.”
- Inline: “Paul says something stark in **1 Corinthians 15**…”
- Block quote for centerpiece text (keep HTML valid; escape `&` as `&amp;` in attributes if needed).

### Honesty

- Where historians or interpreters **disagree**, say so simply—then show what you find helpful without mocking skeptics or other traditions.
- Do not claim “science proves” or “history proves” resurrection (or similar) in a lab sense; frame evidence carefully (see Easter shared-space approval checklist in-repo).

---

## 5. Three source models (structure only)

### The Bible Project — deep narrative / literary notes

- **Entry:** Relatable moment or common misread.
- **Move through:** Context (who, when) → how the story or letter works → connections to other parts of Scripture → meaning for God’s character and our lives **woven in**, not bolted on as “Application.”
- **Terms:** Hebrew/Greek **inline**, briefly defined, then reused in plain English.
- **Harvous filter:** Curious and clear; never stiff or superior.

### GotQuestions — “What does X mean?” notes

- **One question, one focused answer**; answer in the first **2–3 sentences**, then support.
- **Scripture as evidence** in logical order; stack references when they reinforce one point (still **without parentheses** around refs—e.g. **Romans 5:6**, **Romans 5:10**, not wrapped in parens).
- **Harvous filter:** Soften absolute pundit tone; prefer “many Christians read this as…” where charity helps.

### Bible Engagement Project (AG) — group-friendly rhythm

- **Passage first:** What the text says → plain-language reflection; pace like a short devotional people can return to.
- **Discussion lists:** The BEP-style “round the circle” question lists belong in a **future note type**—do not replicate that as a standalone authored note here.
- **Harvous filter:** No “curriculum voice” (“Session 3 objectives”); keep it like a real conversation in print—warm, accessible, non-expert-friendly.

---

## 6. Anti-patterns

- **Dedicated discussion-prompt notes** — numbered question lists for groups belong in a future note type, not in authored `default` packs.
- **Using `resource` note type** in published/admin content before the product supports it.
- **Preachy or guilt-based** closings; **platitudes** with no text anchor.
- **Decorative scripture** — citations that don’t support the sentence they’re in.
- **Parentheses around references** — e.g. `(John 3:16)`; use bare refs or bold refs in prose instead (see §4).
- **Skeleton outlines** — only headings and bullet stubs with no human sentences.
- **Hype or SEO Bible** — “ultimate guide,” “transform your faith.”
- **Mocking** skeptics, other faiths, or “people who don’t get it.”
- **Fake precision** — dates or claims not warranted by the text or mainstream scholarship.
- **Medical/legal/counseling** role confusion — for sensitive topics, recommend trusted people or crisis resources; keep the note a **study conversation**.

---

## 7. Harvous-specific constraints

- **Title:** **≤ 50 characters** hard product limit; shorter is fine.
- **Content:** HTML string suitable for TipTap/rich display (no markdown in DB for these flows unless a script converts it).
- **Shared / admin packs:** Use `noteType: "default"` or `"scripture"` only. **Do not** use `"resource"` until that type is ready for your pipeline.
- **Featured / join copy:** Align with marketing-agent + `docs/BRAND_VOICE.md` for dashboard-facing strings.

---

## Quick checklist before shipping content

- [ ] Read or recall `docs/BRAND_VOICE.md` — sounds like a friend, humble, no banned hype words, no “insights.”
- [ ] Thread has a clear arc; each note has one main job; no dedicated discussion-prompt note.
- [ ] Scripture references support claims; density fits the note type; **no parentheses** around refs.
- [ ] Hard passages or disagreements named honestly where relevant.
- [ ] Titles ≤ 50 chars; HTML is valid and readable in a card.
- [ ] Inclusive, kind tone; crisis/safety boundaries if topic is heavy.

---

**Reminder:** You’re not replacing pastors, scholars, or the community. You’re helping someone **remember and return** to what matters—with voice that fits Harvous.
