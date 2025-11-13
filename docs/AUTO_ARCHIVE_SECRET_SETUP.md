# Auto-Archive Secret Token Setup Guide

This guide walks you through setting up a secret token to secure your auto-archive endpoint.

## Step 1: Generate a Secure Token

Open your terminal and run:

```bash
openssl rand -hex 32
```

This will generate a random 64-character hexadecimal string. **Copy this token** - you'll need it for both GitHub and Netlify.

Example output:
```
a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456
```

**Important:** Save this token somewhere secure (like a password manager) - you won't be able to see it again after adding it to GitHub/Netlify.

---

## Step 2: Add Token to GitHub Secrets

1. **Go to your GitHub repository**
   - Navigate to: `https://github.com/harvouscom/harvous` (or your repo URL)

2. **Open Settings**
   - Click the **Settings** tab at the top of the repository

3. **Navigate to Secrets**
   - In the left sidebar, click **Secrets and variables**
   - Then click **Actions**

4. **Add the Secret**
   - Click **New repository secret** button
   - **Name:** `AUTO_ARCHIVE_SECRET_TOKEN`
   - **Secret:** Paste the token you generated in Step 1
   - Click **Add secret**

5. **Optional: Add Site URL Secret** (if you want to override the default)
   - Click **New repository secret** again
   - **Name:** `AUTO_ARCHIVE_SITE_URL`
   - **Secret:** `https://app.harvous.com`
   - Click **Add secret**

---

## Step 3: Add Token to Netlify Environment Variables

1. **Go to Netlify Dashboard**
   - Navigate to: `https://app.netlify.com`
   - Select your **harvous** site

2. **Open Site Settings**
   - Click **Site configuration** in the top menu
   - Click **Environment variables** in the left sidebar

3. **Add the Environment Variable**
   - Click **Add a variable** button
   - **Key:** `AUTO_ARCHIVE_SECRET_TOKEN`
   - **Value:** Paste the **same token** you used in GitHub (from Step 1)
   - **Scopes:** Check **All scopes** (or at least **Production** and **Deploy previews**)
   - **Mark as secret:** ✅ Check this box (important!)
   - Click **Create variable**

---

## Step 4: Verify the Setup

### Test the Endpoint Locally (Development)

1. **Add token to your local `.env` file:**
   ```env
   AUTO_ARCHIVE_SECRET_TOKEN=your-token-here
   ```

2. **Test the endpoint:**
   ```bash
   curl -X POST http://localhost:4321/api/inbox/auto-archive \
     -H "Authorization: Bearer your-token-here"
   ```

3. **Expected response:**
   ```json
   {
     "success": true,
     "message": "Auto-archived X item(s)",
     "archivedCount": 0
   }
   ```

### Test Without Token (Should Fail)

If you try without the token (or with wrong token):
```bash
curl -X POST http://localhost:4321/api/inbox/auto-archive
```

**Expected response:** `401 Unauthorized` (if token is set)

---

## Step 5: Test GitHub Actions Workflow

1. **Push your changes to GitHub**
   ```bash
   git add .github/workflows/auto-archive.yml
   git commit -m "feat: add auto-archive GitHub Actions workflow"
   git push
   ```

2. **Manually trigger the workflow**
   - Go to your GitHub repository
   - Click the **Actions** tab
   - Find **Auto-Archive Inbox Items** workflow
   - Click **Run workflow** → **Run workflow** (green button)

3. **Check the workflow run**
   - Click on the workflow run to see logs
   - You should see: "Calling auto-archive endpoint: https://app.harvous.com/api/inbox/auto-archive"
   - Status should be green ✅ if successful

---

## Step 6: Verify It's Working

After the workflow runs:

1. **Check the workflow logs** in GitHub Actions
   - Should show successful response with archived count

2. **Check your Netlify function logs** (if available)
   - Or check your application logs

3. **Verify items were archived**
   - Check your inbox - items older than 14 days should be in Archive tab

---

## Troubleshooting

### Issue: "401 Unauthorized" in workflow

**Solution:**
- Verify the token in GitHub Secrets matches the token in Netlify environment variables
- Make sure the token is exactly the same (no extra spaces)
- Check that `AUTO_ARCHIVE_SECRET_TOKEN` is set in both places

### Issue: Workflow runs but no items archived

**Possible reasons:**
- No items are older than 14 days yet
- Items are already archived
- Items have been added to Harvous (status = 'added')

**Test:** Create a test item that's older than 14 days, or temporarily modify the code to use 1 day instead of 14 for testing.

### Issue: Workflow fails to connect

**Solution:**
- Verify `AUTO_ARCHIVE_SITE_URL` is set correctly (or default `https://app.harvous.com` is correct)
- Check that your Netlify site is accessible
- Verify the endpoint path: `/api/inbox/auto-archive`

---

## Security Best Practices

✅ **Do:**
- Use a strong, random token (64+ characters)
- Store the token securely (password manager)
- Mark as secret in Netlify
- Use the same token in both GitHub and Netlify
- Rotate the token periodically (every 6-12 months)

❌ **Don't:**
- Commit the token to git
- Share the token publicly
- Use simple/guessable tokens
- Reuse tokens from other services

---

## Quick Reference

**GitHub Secret Name:** `AUTO_ARCHIVE_SECRET_TOKEN`  
**Netlify Env Var Name:** `AUTO_ARCHIVE_SECRET_TOKEN`  
**Endpoint:** `https://app.harvous.com/api/inbox/auto-archive`  
**Schedule:** Daily at 2 AM UTC  
**Workflow File:** `.github/workflows/auto-archive.yml`

---

## Need Help?

If you run into issues:
1. Check the workflow logs in GitHub Actions
2. Verify both secrets are set correctly
3. Test the endpoint manually with curl
4. Check Netlify function logs (if available)

