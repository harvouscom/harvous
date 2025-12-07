# Data Fix Scripts

This folder contains scripts for fixing data issues in production databases.

## Scripts

### `reprocess-scripture-verses.ts`

Reprocesses scripture notes that were created without verse content due to API timeout failures.

**Purpose**: Fixes scripture notes created before the mobile timeout fix was implemented, where notes were saved with just the reference text instead of actual verse content.

**Usage**:
```bash
# Dry run first to see what would be updated
npx tsx scripts/fixes/reprocess-scripture-verses.ts YOUR_USER_ID --dry-run

# Actually run the reprocessing
npx tsx scripts/fixes/reprocess-scripture-verses.ts YOUR_USER_ID
```

**What it does**:
1. Finds all scripture notes for the specified user
2. Checks if `ScriptureMetadata.originalText` is missing or just contains the reference
3. Fetches the actual verse text from Bible.org API using timeout-enabled fetch
4. Updates both `Note.content` and `ScriptureMetadata.originalText` with the fetched verse

**Related Issue**: See `/Users/heyderekj/.cursor/plans/scripture_fetch_mobile_fix_ba8cd6bf.plan.md`

## Guidelines

- Always test with `--dry-run` first
- Run on a single user account first to verify behavior
- Scripts should be idempotent (safe to run multiple times)
- Include clear error handling and logging
- Document what issue the script fixes and when it should be run

