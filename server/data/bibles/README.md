# Bible JSON (verse corpora)

Harvous stores full-Bible text as JSON arrays of `{ "book", "chapter", "verse", "text" }` (canonical book names match `src/data/bible-chapters.json`). These files are **not** read at runtime in production; they are **imported into Postgres** via `server/scripts/seed-bible-verses.ts`, and the app serves text from the `BibleVerses` table.

## Data sources

| Translation | Source | Notes |
|-------------|--------|-------|
| **KJV** | Public-domain text (committed) | Clean, no Strong's numbers. Do **not** re-download from Bolls — Bolls serves the Strong's-numbered KJV. |
| **ESV, NIV, NLT, NKJV, BSB, NET** | Downloaded from [Bolls.life](https://bolls.life) API | `npm run bible:download:bolls -- ESV` (no API key required) |
| **NASB 1995, CSB, AMP, MSG** | Downloaded from [Bolls.life](https://bolls.life) API | `npm run bible:download:bolls -- NASB` (no API key required) |
| **NET** (alt) | [labs.bible.org](https://labs.bible.org) | `node server/data/bibles/_download_net.mjs` (NET only) |

### Downloading / re-downloading from Bolls.life

One translation (deletes existing file first to force a clean re-download):

```bash
rm server/data/bibles/CSB.json
npm run bible:download:bolls -- CSB
```

All ten Bolls-sourced translations in sequence:

```bash
npm run bible:download:bolls:all
```

Then seed into Postgres:

```bash
npx tsx server/scripts/seed-bible-verses.ts        # all translations
npx tsx server/scripts/seed-bible-verses.ts CSB     # one translation
```

### Alternative download paths (API.Bible, AI generation)

The repo also contains `_download_api_bible.mjs` (requires `API_BIBLE_KEY`) and `_generate_translation.mjs` (AI generation via Claude). These exist as alternative pipelines but the committed JSON files are sourced from Bolls.life.

### Versification notes

Not all translations have the same verse count. This is expected:

- **NLT** (~31,064 verses): merges consecutive verse pairs in census/genealogy passages (e.g. Numbers 1:20–21 → verse 20 only)
- **MSG** (~31,015 verses): merges verse ranges freely as a paraphrase
- **ESV, NIV, BSB, CSB, NET** (~31,086 verses): omit a handful of verses that textual critics consider later additions
- **KJV, NKJV** (31,102 verses): traditional full versification

## After generating or updating a `.json` file

1. Run the seed against the target database:

   ```bash
   npx tsx server/scripts/seed-bible-verses.ts
   npx tsx server/scripts/seed-bible-verses.ts NASB
   ```

2. Ensure the translation id exists in `src/data/translations.ts` (registry + copyright strings).
