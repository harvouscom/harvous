# Growth & Malleability Roadmap

Making Harvous malleable enough that people replace their current note-taking — following the Obsidian playbook of letting users shape the tool to fit them.

**Related docs:**
- [TIPTAP_UPGRADE_AND_RICH_MEDIA.md](./TIPTAP_UPGRADE_AND_RICH_MEDIA.md) — Tiptap upgrade + embed node extensions
- [NOTE_TEMPLATES.md](./NOTE_TEMPLATES.md) — Template system (built-in done, user templates future)
- [SCRIPTURE_NOTES_FUTURE_IMPROVEMENTS.md](./SCRIPTURE_NOTES_FUTURE_IMPROVEMENTS.md) — Overlap handling, merge, Bible reader view
- [CHURCH_ORG_AND_CURRICULUM.md](./CHURCH_ORG_AND_CURRICULUM.md) — Clerk organizations for churches

---

## 1. Multiple Bible Translations

### Problem
Harvous only supports NET Bible (via Bible.org API). Anyone who studies in ESV, NIV, KJV, NKJV, or NLT hits immediate friction. Translation loyalty is the #1 switching barrier.

### Current State
- Bible.org API (`https://labs.bible.org/api/`) serves NET only
- Hardcoded `'NET'` in:
  - `src/components/react/contexts/NewNotePanelContext.tsx` (line 59) — default state
  - `src/utils/scripture-note-utils.ts` (line 86) — note creation
  - `server/utils/process-scripture-references.ts` — reference processing
  - `server/routes/tags-scripture.ts` (line 267) — API endpoint
- `ScriptureMetadata.translation` column exists but always stores `'NET'`
- `src/components/react/note-panel/hooks/useScriptureDetection.ts` has placeholder `fetchNewVersion()` (line 129) with comment "for future — when multiple translations are supported"
- `VerseTextCache` caches by reference only — no translation dimension

### Target Translations
KJV, NKJV, ESV, NIV, NLT (+ keep NET)

### API Source
**API.Bible** (by American Bible Society): free tier, 2500+ translations including all targets above.
- Endpoint: `https://api.scripture.api.bible/v1/bibles/{bibleId}/passages/{passageId}`
- Requires API key (free registration)
- Each translation has a unique `bibleId`
- Attribution requirements vary per translation — store per-translation attribution text

**KJV fallback**: Public domain, could be bundled locally for offline/instant access.

### Data Model Changes

**VerseTextCache** — add `translation` to cache key:
```sql
-- Current: keyed by reference only
-- New: composite key on (reference, translation)
ALTER TABLE "VerseTextCache" ADD COLUMN "translation" text NOT NULL DEFAULT 'NET';
-- Update unique constraint to include translation
```

**UserMetadata** (or new user preferences) — add `defaultTranslation`:
```sql
ALTER TABLE "UserMetadata" ADD COLUMN "defaultTranslation" text NOT NULL DEFAULT 'NET';
```

**ScriptureMetadata** — already has `translation` column, just start writing real values.

### User Experience

1. **Settings page**: dropdown to pick default translation (KJV, NKJV, ESV, NIV, NLT, NET)
2. **Per-note override**: in note creation panel, small translation badge next to scripture reference — tap to change for this note only
3. **Scripture pill interaction**: tap pill → see verse text → small toggle to view in another translation without changing the note
4. **Compare mode** (future): view same verse in 2-3 translations side by side — also feeds into harvous.com/compare SEO pages

### Files to Modify

| File | Change |
|------|--------|
| `server/utils/fetch-verse-text.ts` | Add `translation` param, route to API.Bible or Bible.org based on translation, update cache lookup to include translation |
| `server/routes/tags-scripture.ts` | Accept `translation` in request body, pass through to processing |
| `server/utils/process-scripture-references.ts` | Accept and pass `translation` param |
| `src/components/react/contexts/NewNotePanelContext.tsx` | Read user's `defaultTranslation` instead of hardcoded `'NET'` |
| `src/components/react/note-panel/hooks/useScriptureDetection.ts` | Implement `fetchNewVersion()` — call API with selected translation |
| `src/utils/scripture-note-utils.ts` | Accept translation param in note creation utils |
| `server/db/schema.ts` | Update `VerseTextCache` schema (add translation column + composite unique) |
| `spa/src/pages/ProfilePage.tsx` (or settings) | Add default translation selector UI |
| New: `server/utils/api-bible.ts` | API.Bible client — fetch verse by bibleId + passage reference |
| New: `src/data/translations.ts` | Translation registry: `{ id, name, abbreviation, apiBibleId, attribution, isPublicDomain }` |

### Implementation Order
1. Create translation registry (`translations.ts`) with all 6 translations and their API.Bible IDs
2. Add `translation` column to `VerseTextCache` + migration
3. Add `defaultTranslation` to user preferences + settings UI
4. Update `fetch-verse-text.ts` to accept translation and route to API.Bible
5. Wire translation through the full chain: context → detection hook → processing → API
6. Add per-note translation override UI
7. Scripture pill translation toggle (tap to compare)

---

## 2. Styled Embed Cards with Source Recognition

> **Note:** The [TIPTAP_UPGRADE_AND_RICH_MEDIA.md](./TIPTAP_UPGRADE_AND_RICH_MEDIA.md) doc covers the Tiptap node extension architecture for embeds. This section adds two things not covered there: **(a) all embeds are styled cards with no iframes** and **(b) source recognition for known domains**.

### Design Constraint: No Iframes
All embed types render as styled attachment cards. No iframes, no inline players. Click opens externally. This keeps the editor fast, consistent, and mobile-friendly.

Update to the existing embed doc's `VideoEmbed` spec:
- **Was**: "Thumbnail with play button overlay; expands to iframe on click"
- **Should be**: Card with thumbnail, title, duration, channel name. Click opens YouTube/Vimeo in browser. Same card style as link embeds and PDF embeds.

### Source Recognition System

A registry of known domains that get special treatment (branded cards with logo/colors):

```typescript
// src/data/known-sources.ts
export const KNOWN_SOURCES: Record<string, KnownSource> = {
  'bibleproject.com': {
    name: 'The Bible Project',
    shortName: 'BibleProject',
    icon: '/icons/bibleproject.svg', // or inline SVG
    accentColor: '#1A1A2E',
    category: 'study',
  },
  'blueletterbible.org': {
    name: 'Blue Letter Bible',
    shortName: 'BLB',
    accentColor: '#003366',
    category: 'reference',
  },
  'gotquestions.org': {
    name: 'GotQuestions.org',
    accentColor: '#2E7D32',
    category: 'reference',
  },
  'desiringgod.org': {
    name: 'Desiring God',
    accentColor: '#1B1B1B',
    category: 'teaching',
  },
  'biblegateway.com': {
    name: 'Bible Gateway',
    accentColor: '#00457C',
    category: 'reference',
  },
  // ... more sources
};

export function getKnownSource(url: string): KnownSource | null {
  const domain = new URL(url).hostname.replace('www.', '');
  return KNOWN_SOURCES[domain] ?? null;
}
```

**Card rendering with source recognition:**
- If URL matches a known source → show branded badge (source name + accent color strip) on the card
- If URL doesn't match → show generic card with favicon + domain name
- All cards share the same layout: thumbnail (optional) | title + description + source badge

**Future: Church-Registered Domains (Clerk Orgs)**

When Clerk organizations are implemented for churches:
- Church admins register their org's domains (e.g., `mychurch.org`, `subsplash.com/mychurch`)
- Stored in an `OrgDomains` table: `{ orgId, domain, displayName, accentColor? }`
- Any org member who pastes a URL from a registered domain gets a branded card
- `getKnownSource()` checks both the static registry and the user's org domains

### Files to Create/Modify

| File | Change |
|------|--------|
| New: `src/data/known-sources.ts` | Static registry of known Bible study domains |
| `src/components/react/TiptapEmbedCard.tsx` (new) | Shared card component for all embed types — renders title, description, thumbnail, source badge |
| Existing embed node extensions | Use `TiptapEmbedCard` as the NodeView renderer, pass `type` prop for card variant |
| `server/routes/resource.ts` | Enhance `/api/resource/metadata` response to include `knownSource` if domain matches |

---

## 3. Template Enhancements

> **Note:** The [NOTE_TEMPLATES.md](./NOTE_TEMPLATES.md) doc covers the existing template system and the "Save as Template" + user templates plan. This section adds ideas not covered there.

### 3a. Template Variables / Placeholders

Templates could include dynamic placeholders that auto-fill or prompt the user:

```html
<!-- In template content HTML -->
<h2>Study of {{book}} {{chapter}}</h2>
<p><em>Date: {{date}}</em></p>
<h3>Key Verse</h3>
<p>{{verse_reference}}</p>
```

**Built-in variables:**
| Variable | Auto-fill | Fallback |
|----------|-----------|----------|
| `{{date}}` | Today's date | — |
| `{{book}}` | — | Prompt user |
| `{{chapter}}` | — | Prompt user |
| `{{verse_reference}}` | — | Prompt user |
| `{{topic}}` | — | Prompt user |
| `{{translation}}` | User's default translation | — |

**Implementation:**
- On template selection, scan content for `{{...}}` patterns
- Auto-fill known variables (`date`, `translation`)
- For unknown variables, show a simple form: "Fill in: Book, Chapter" before inserting content
- Store template content with placeholders intact; resolve at insertion time

**Files:**
- New: `src/utils/template-variables.ts` — parse `{{...}}`, resolve auto-fill, return list of prompts needed
- Modify: `NewNotePanel.tsx` / `useNewNoteForm.ts` — after template selection, check for variables, show prompt if needed, then set content

### 3b. Church-Provided Templates (Future: Clerk Orgs)

When Clerk organizations are implemented:

**Schema:**
```sql
CREATE TABLE "OrgTemplates" (
  "id" text PRIMARY KEY,
  "orgId" text NOT NULL,       -- Clerk org ID
  "createdBy" text NOT NULL,   -- userId of admin who created it
  "name" text NOT NULL,
  "description" text,
  "content" text NOT NULL,     -- Tiptap HTML (same format as built-in templates)
  "category" text,             -- e.g., 'sermon', 'small-group', 'devotional'
  "isActive" boolean DEFAULT true,
  "createdAt" timestamp DEFAULT now(),
  "updatedAt" timestamp DEFAULT now()
);
```

**Flow:**
- Church admin (Clerk org admin role) creates templates in an org settings page
- Templates appear in the template picker for all org members, in a "From [Church Name]" section
- Admin can push a "weekly template" (e.g., sermon notes for this Sunday) — shows as suggested when members create a note that week
- Members cannot edit org templates, only use them

**API:**
- `GET /api/org-templates/list?orgId=...` — returns org templates for member's organization
- `POST /api/org-templates/create` — admin-only, creates org template
- `PATCH /api/org-templates/:id` — admin-only, updates
- `DELETE /api/org-templates/:id` — admin-only, removes

### 3c. Community Template Library (Future)

- Users opt-in to publish personal templates publicly
- Add `isPublic` boolean to `NoteTemplates` (user templates table from NOTE_TEMPLATES.md)
- Browse/search endpoint: `GET /api/templates/community?category=...&sort=popular`
- "Add to My Templates" = clone the template to the user's `NoteTemplates`
- Attribution: show creator name on community templates

---

## 4. Import from Other Apps

### Problem
People won't abandon years of notes. If they can't bring their history, they won't switch.

### Import Mapping Rules
Imported content must map cleanly to Harvous's structure:

| Source concept | Harvous target |
|---------------|----------------|
| Individual note/document | `Note` (type: `default`) |
| Collection/notebook/category | `Thread` (created if needed) |
| Any detected scripture references | Linked `ScriptureMetadata` + scripture pills in content |
| Bold, italic, lists, headings | Preserved as Tiptap HTML |
| Images | Stripped initially (until image embed support ships) |
| Links/URLs | Preserved as plain text links |

### Tier 1: Paste Import (Ship First)

Simplest possible import — no file parsing needed:

- "Import Notes" page with a large textarea: "Paste your notes here"
- User pastes plain text or rich text (HTML)
- Processing:
  1. Split by `---` or double newlines into individual notes (or treat as one note)
  2. Convert to Tiptap-compatible HTML (strip unsupported tags, downgrade headings)
  3. Run scripture detection on each note → auto-create scripture pills
  4. User picks a thread to import into (or create "Imported Notes" thread)
  5. Create notes via existing `POST /api/notes/create`

### Tier 2: File Import

**Apple Notes** (via export):
- Apple Notes → export as PDF or copy-paste (no native export format)
- Best approach: paste import (Tier 1) since Apple Notes has no clean export

**Google Keep** (via Google Takeout):
- Export format: individual HTML files in a folder, or JSON
- Parse HTML/JSON → extract title (first line or `title` field), content, labels (→ tags)
- Map Keep labels to Harvous threads or tags

**Notion** (via export):
- Export format: markdown files + CSV for databases
- Parse markdown → convert to Tiptap HTML using `@tiptap/markdown` (available after Tiptap upgrade)
- Notion page hierarchy → Harvous threads (top-level pages = threads, sub-pages = notes)

**Evernote** (via .enex export):
- Export format: XML with HTML content per note
- Parse XML → extract title, content (HTML), tags, notebook name
- Notebook → Thread, tags → Harvous tags

### Import Flow (All Tiers)

```
User clicks "Import" in settings/profile
  → Selects source (Paste, Google Keep, Notion, Evernote)
  → Provides content (paste text, upload files, or upload export archive)
  → Preview: shows detected notes with titles, scripture refs found, target thread
  → User confirms
  → Background processing:
     1. Create thread if needed ("Imported from [Source]")
     2. For each note:
        a. Convert content to Tiptap HTML
        b. Run scripture detection
        c. Create note via existing API
        d. Create scripture notes + pills for detected references
     3. Show completion summary: "Imported 47 notes, found 123 scripture references"
```

### Files

| File | Purpose |
|------|---------|
| New: `spa/src/pages/ImportPage.tsx` | Import UI — source selection, paste area, file upload, preview |
| New: `src/utils/import/paste-import.ts` | Parse pasted text/HTML into note candidates |
| New: `src/utils/import/google-keep-import.ts` | Parse Google Takeout HTML/JSON |
| New: `src/utils/import/notion-import.ts` | Parse Notion markdown export |
| New: `src/utils/import/evernote-import.ts` | Parse .enex XML |
| New: `src/utils/import/import-common.ts` | Shared: HTML sanitization, scripture detection, note creation |
| Existing: `src/utils/scripture-detector.ts` | Already handles scripture detection — reuse for imported content |
| Existing: `server/routes/notes.ts` | `POST /api/notes/create` — used as-is for each imported note |

### Implementation Order
1. Paste import (Tier 1) — covers most users, zero file parsing
2. Google Keep import — most common for casual note-takers
3. Notion import — most common for power users
4. Evernote import — legacy but still has users

---

## 5. Daily Verse Prompt + Journaling

### Concept
A gentle daily nudge that gives people a reason to open Harvous every day, even before they've built their own study habit. Ties directly into the existing XP/streak system.

### User Experience
1. **In-app banner** on dashboard (if user hasn't created a note today):
   "Today's verse: *Psalm 23:1 — The LORD is my shepherd; I shall not want.* — Journal about it?"
2. **One-tap action**: "Start journaling" → creates a new note pre-filled with:
   - Title: "Psalm 23:1" (triggers scripture detection)
   - Content: verse text in user's preferred translation
   - Template: could use SOAP or a simple "Daily Reflection" template
3. **Thread**: auto-creates or uses a "Daily Journal" thread (user can rename/move)
4. **Push notification** (Capacitor/PWA): morning notification with the verse — tap opens the app to the journaling prompt
5. **XP reward**: journaling from the daily prompt awards bonus XP + counts toward streak

### Verse Selection
- Curated list of ~365 verses (one per day of the year) — meaningful, varied across OT and NT
- Stored in a static data file: `src/data/daily-verses.ts`
- Deterministic by date (not random) so all users see the same verse → community feel
- Future: let users follow a reading plan instead (e.g., Bible in a Year)

### Data File

```typescript
// src/data/daily-verses.ts
export const DAILY_VERSES: DailyVerse[] = [
  { dayOfYear: 1, reference: 'Joshua 1:9', theme: 'courage' },
  { dayOfYear: 2, reference: 'Psalm 23:1', theme: 'provision' },
  { dayOfYear: 3, reference: 'Jeremiah 29:11', theme: 'hope' },
  // ... 365 entries
];

export function getTodaysVerse(): DailyVerse {
  const dayOfYear = getDayOfYear(new Date());
  return DAILY_VERSES[dayOfYear - 1];
}
```

### Files

| File | Purpose |
|------|---------|
| New: `src/data/daily-verses.ts` | 365-verse curated list + `getTodaysVerse()` |
| New: `src/components/react/DailyVersePrompt.tsx` | Dashboard banner component — shows verse, "Journal" CTA |
| Modify: `spa/src/pages/DashboardPage.tsx` | Render `DailyVersePrompt` if user hasn't journaled today |
| Existing: `server/utils/xp-system.ts` | Add XP event for daily verse journaling |
| Future: Push notification setup via Capacitor | Morning notification with verse text |

---

## Priority Summary

| # | Feature | Existing Doc? | New Work |
|---|---------|---------------|----------|
| 1 | Multiple translations | No | Full implementation (this doc, section 1) |
| 2 | Styled embed cards (no iframes) + source recognition | Partial ([TIPTAP_UPGRADE_AND_RICH_MEDIA.md](./TIPTAP_UPGRADE_AND_RICH_MEDIA.md)) | Source recognition + no-iframe constraint (this doc, section 2) |
| 3 | User templates (save as template) | Yes ([NOTE_TEMPLATES.md](./NOTE_TEMPLATES.md)) | Template variables + church templates (this doc, section 3) |
| 4 | Import from other apps | No | Full implementation (this doc, section 4) |
| 5 | Daily verse prompts | No | Full implementation (this doc, section 5) |
