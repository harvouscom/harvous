# Database Schema Changes

## New Tables Added

The following tables have been added to the database schema:

1. **Tags** - Stores tag definitions
2. **NoteTags** - Junction table for many-to-many relationships between notes and tags

## How to Apply Changes

### Option 1: Restart Development Server
The simplest way is to restart your development server:

```bash
# Stop the current server (Ctrl+C)
# Then restart:
npm run dev
```

### Option 2: Manual Database Reset (if needed)
If the above doesn't work, you may need to reset the database:

```bash
# Stop the server first
# Then run:
npm run db:push
# or
npx astro db push
```

### Option 3: Check Database Status
You can check if the tables exist by looking at your database or running:

```bash
npx astro db studio
```

## What This Enables

Once the database changes are applied, you'll have:

- ✅ Auto-tag generation for Bible study content
- ✅ Tag management in NoteDetailsPanel
- ✅ Enhanced search with tag support
- ✅ 200+ curated Bible study keywords
- ✅ Smart tag suggestions based on content

## Troubleshooting

If you're still getting errors:

1. **Check the console** for specific error messages
2. **Verify database connection** in your `.env` file
3. **Try a clean restart** of the development server
4. **Check if the new tables exist** in your database

The code is designed to gracefully handle cases where the new tables don't exist yet, so the app should still work even before the database changes are applied.
