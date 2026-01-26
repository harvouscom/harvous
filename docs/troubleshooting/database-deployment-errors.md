# Database Deployment Errors

## Netlify Build Failures: UNIQUE Constraint Errors

### Problem
Netlify build fails with `SQLITE_CONSTRAINT: UNIQUE constraint failed` when running `db:push` during deployment.

**Example Error**:
```
SQLITE_CONSTRAINT: SQLite error: UNIQUE constraint failed: NoteThreads.noteId, NoteThreads.threadId
```

### Root Cause
The database contains duplicate rows that violate a unique constraint being added by the schema push. For example, duplicate `(noteId, threadId)` pairs in the `NoteThreads` table.

### Why This Happens
- Database migrations should not run during CI/CD builds as they can fail due to existing data
- Unique constraints cannot be added when duplicate data exists
- Running `db:push` in the build process is risky and can cause deployment failures

### Solution

1. **Remove `db:push` from Netlify build** (already done):
   - The `netlify.toml` build command no longer includes `npm run db:push`
   - Database migrations should be run manually, not during automated builds

2. **Clean up duplicate data** before pushing schema changes:
   
   **Option A: Use the API endpoint** (if you have admin access):
   ```bash
   curl https://app.harvous.com/api/admin/cleanup-duplicate-note-threads
   ```
   
   **Option B: Run the cleanup script locally**:
   ```bash
   # Make sure ASTRO_DB_REMOTE_URL points to your production database
   npx astro db execute db/cleanup-note-threads-duplicates.mts
   ```

3. **Push schema changes manually** after cleanup:
   ```bash
   npm run db:push
   ```

### Prevention
- Always run database migrations manually before deploying
- Never include `db:push` in CI/CD build commands
- Clean up duplicate data before adding unique constraints
- Test schema changes locally first

### Related Files
- `netlify.toml` - Build configuration (does not include `db:push`)
- `db/cleanup-note-threads-duplicates.mts` - Standalone cleanup script
- `src/pages/api/admin/cleanup-duplicate-note-threads.ts` - API endpoint for cleanup
