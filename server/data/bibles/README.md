# Bible JSON (verse corpora)

Harvous stores full-Bible text as JSON arrays of `{ "book", "chapter", "verse", "text" }` (canonical book names match `src/data/bible-chapters.json`). These files are **not** read at runtime in production; they are **imported into Postgres** via `server/scripts/seed-bible-verses.ts`, and the app serves text from the `BibleVerses` table.

## Reproducible generators in this repo

| Translation | Script | Notes |
|-------------|--------|--------|
| **NET** | `node server/data/bibles/_download_net.mjs` | Uses [labs.bible.org](https://labs.bible.org) (NET only). Writes `NET.json`. |
| **ESV, NIV, KJV, NKJV, NLT, BSB** | *(committed JSON — same approach as below)* | AI-generated verse text per chapter, saved as Harvous JSON. |
| **NASB 1995, CSB, AMP, MSG** | `npm run bible:generate -- NASB` or `npm run bible:generate:all` | AI generation via Claude (`ANTHROPIC_API_KEY` in `.env`). Resumes from partial files if interrupted. |

### Generating NASB 1995 / CSB / AMP / MSG

1. Add **`ANTHROPIC_API_KEY`** to `.env`.
2. Run one translation: **`npm run bible:generate -- NASB`** (translation id `NASB` = NASB 1995 in app metadata)
   Or all four in sequence: **`npm run bible:generate:all`**
   (Each translation: ~1,189 chapter API calls, roughly 25–40 min. Auto-resumes if interrupted.)
3. Run **`npx tsx server/scripts/seed-bible-verses.ts`** to load into Postgres.

Scripts load `.env` from the repo root automatically.

## After generating or updating a `.json` file

1. Run the seed against the target database (all translations with files, or one):

   ```bash
   npx tsx server/scripts/seed-bible-verses.ts
   npx tsx server/scripts/seed-bible-verses.ts NASB
   ```

2. Ensure the translation id exists in `src/data/translations.ts` (registry + copyright strings).

## Listing bible IDs (API.Bible)

Prefer **`npm run bible:list-api-bibles`** (prints all English bibles your key can access). Or:

```bash
curl -sS -H "api-key: $API_BIBLE_KEY" "https://api.scripture.api.bible/v1/bibles?name=NASB"  # pick NASB 1995 from results
```

Use the `id` field from a bible your application is allowed to access.
