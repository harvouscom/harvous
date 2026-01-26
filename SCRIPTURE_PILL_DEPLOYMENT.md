# Scripture Pill Fix Deployment Guide

## ✅ Completed

All code changes have been committed and pushed to production:
- Commit: `1d4931ed` - fix: resolve scripture pill duplication and count issues with defense-in-depth approach
- Version bumped: `1.46.0` → `1.46.1`
- Deployment triggered on push to main

## 📋 Next Steps

### Step 1: Wait for Deployment ⏳

Your deployment pipeline (likely Netlify based on astro.config.mjs) should now be building and deploying the changes.

**Check deployment status:**
- Visit your Netlify dashboard or deployment platform
- Wait for the build to complete (usually 3-5 minutes)
- Verify the deployment shows version 1.46.1

---

### Step 2: Run Cleanup API 🧹

Once deployment is complete, you need to clean up existing duplicate entries before the database migration can succeed.

**How to run the cleanup:**

1. **Log into your production site** as an admin user
2. **Visit the cleanup endpoint** in your browser:
   ```
   https://yourdomain.com/api/admin/cleanup-duplicate-scripture-refs
   ```

3. **Expected response:**
   ```json
   {
     "success": true,
     "message": "Cleanup complete! Deleted X duplicate entries.",
     "deleted": X,
     "duplicateGroups": Y,
     "report": [...]
   }
   ```

4. **If you get a redirect (302):**
   - The endpoint requires authentication
   - Make sure you're logged in as an admin
   - Try opening in the same browser where you're logged into the site

**Alternative: Use curl with auth**
If you have an API token or admin credentials:
```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  https://yourdomain.com/api/admin/cleanup-duplicate-scripture-refs
```

---

### Step 3: Run Database Migration 🗄️

After cleanup is successful, apply the unique constraint:

```bash
npm run db:push
```

**Expected output:**
```
Database schema is out of date.
Pushing database schema updates...
✅ Database schema updated successfully
```

**If it fails with UNIQUE constraint error:**
- The cleanup didn't remove all duplicates
- Run the cleanup API again
- Check the report to see which duplicates remain

---

### Step 4: Test in Production ✅

Create a test note to verify all fixes work:

**Test 1: New Note with Scripture**
1. Create a new note with "John 3:16" in the content
2. Save the note
3. Check the dashboard - the note should show "1 scripture note included" in dropdown
4. Click to expand - "John 3:16" should appear in the list

**Test 2: Duplicate Reference in Same Note**
1. Create a note with "John 3:16" mentioned twice
2. Save the note
3. Dropdown should show "1 scripture note included" (not 2)
4. Only 1 "John 3:16" should appear in the expanded list

**Test 3: Multiple Scriptures**
1. Create a note with "John 3:16, Romans 8:28, Philippians 4:13"
2. Save the note
3. Dropdown should show "3 scripture notes included"
4. All 3 should appear in the expanded list with no duplicates

**Test 4: Count Accuracy**
1. Check a note that previously showed wrong counts
2. Count should now be accurate
3. Expanding dropdown should show exact number of unique scriptures

---

## 🔍 Verification

### Check for Remaining Duplicates

You can verify the cleanup worked by checking the database:

**Via Astro Studio Dashboard:**
```sql
SELECT noteId, scriptureNoteId, COUNT(*) as count
FROM NoteScriptureReferences
GROUP BY noteId, scriptureNoteId
HAVING count > 1;
```

**Expected result:** 0 rows (no duplicates)

### Check Error Logs

Monitor your production logs for any errors related to:
- `Failed to create junction entry`
- `UNIQUE constraint failed`

The improved error handling will now log real errors while gracefully handling expected duplicate insert attempts.

---

## 📊 What Was Fixed

### Issues Resolved
1. ✅ **Off-count** - Dropdown now shows accurate count of unique scripture references
2. ✅ **Missing from dropdown** - All scripture pills in content now appear in dropdown
3. ✅ **Duplication** - No more duplicate scripture notes created during note creation

### Defense-in-Depth Layers
1. **Database** - Unique constraint prevents duplicates at source
2. **Process** - In-memory Set tracks processed references per save
3. **Data** - Dashboard query deduplicates before passing to UI
4. **UI** - CardNote component deduplicates before rendering

### Files Modified
- `db/config.ts` - Added unique index
- `src/utils/process-scripture-references.ts` - Deduplication + error handling
- `src/utils/dashboard-data.ts` - Query deduplication
- `src/components/react/CardNote.tsx` - UI deduplication
- `src/pages/api/admin/cleanup-duplicate-scripture-refs.ts` - Cleanup utility

---

## 🆘 Troubleshooting

### Cleanup API returns 302 redirect
- Endpoint requires authentication
- Log into your production site first
- Use the same browser/session to visit the API endpoint

### Migration still fails after cleanup
- Run cleanup API again - some duplicates may remain
- Check the cleanup report for which entries were kept/deleted
- Verify you're running the migration against the same database (production)

### Counts still wrong after deployment
- Hard refresh the page (Cmd+Shift+R or Ctrl+Shift+R)
- Clear browser cache
- The deduplication layers should handle existing duplicates even without the constraint

### New duplicates still being created
- Check if the deployment actually succeeded
- Verify version 1.46.1 is deployed
- Check browser console for JavaScript errors that might prevent code from running

---

## 📞 Support

If you encounter issues:
1. Check deployment logs for build errors
2. Check production error logs for runtime errors
3. Verify all 5 modified files were deployed
4. Test in a fresh incognito window to rule out caching

The fixes are backwards-compatible and defensive, so even if the migration fails, the other layers will prevent issues.
