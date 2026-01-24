# Capacitor Setup Guide for Harvous iOS/Android Apps

This guide walks you through setting up Capacitor to build native iOS and Android apps from your Harvous web app.

---

## Prerequisites

Before starting, ensure you have:

- ✅ **Node.js 20+** installed
- ✅ **Git** installed
- ✅ **Xcode** (for iOS development) - macOS only
- ✅ **Android Studio** (for Android development)
- ✅ **Deployed Netlify backend** with working API routes
- ✅ **Branch `thefluxcapacitor` merged/tested** (contains dual-mode auth)

---

## Phase 1: Install Capacitor

### Step 1: Install Capacitor Dependencies

```bash
npm install @capacitor/core @capacitor/cli
npm install @capacitor/ios @capacitor/android
```

### Step 2: Initialize Capacitor

```bash
npx cap init
```

You'll be prompted for:
- **App name**: `Harvous` (user-facing name)
- **App ID**: `com.harvous.app` (reverse domain format)
- **Web asset directory**: `dist`

This creates a `capacitor.config.ts` file.

### Step 3: Update Capacitor Config

Edit `capacitor.config.ts`:

```typescript
import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.harvous.app',
  appName: 'Harvous',
  webDir: 'dist',
  server: {
    // CRITICAL for Clerk authentication in mobile WebView
    allowNavigation: [
      'accounts.clerk.dev',
      '*.clerk.accounts.dev',
      'your-netlify-site.netlify.app'  // Replace with your actual domain
    ],
    // Override origin for Capacitor (required for Clerk)
    hostname: 'capacitor://localhost'
  },
  ios: {
    contentInset: 'automatic',
    // Allows opening links in Safari if needed
    allowsLinkPreview: true
  },
  android: {
    // Android-specific settings
    allowMixedContent: false,
    backgroundColor: '#ffffff'
  }
};

export default config;
```

**Replace `your-netlify-site.netlify.app` with your actual Netlify domain!**

---

## Phase 2: Configure Environment Variables

### Step 1: Create `.env.capacitor` File

Create a new file at the root:

```bash
# .env.capacitor

# Build target flag
PUBLIC_BUILD_TARGET=capacitor

# Your deployed Netlify API endpoint
PUBLIC_API_URL=https://your-netlify-site.netlify.app

# Clerk public key (same as web)
PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
```

**Important:** The `PUBLIC_API_URL` MUST be your deployed Netlify site. Capacitor can't call `localhost` API routes.

### Step 2: Update Build Script

Add to `package.json` scripts:

```json
{
  "scripts": {
    "build:capacitor": "BUILD_TARGET=capacitor npm run build",
    "cap:ios": "npm run build:capacitor && npx cap sync ios && npx cap open ios",
    "cap:android": "npm run build:capacitor && npx cap sync android && npx cap open android"
  }
}
```

---

## Phase 3: Add iOS Platform

### Step 1: Add iOS Platform

```bash
npx cap add ios
```

This creates an `ios/` directory with an Xcode project.

### Step 2: Build for Capacitor

```bash
npm run build:capacitor
```

This builds your Astro site in static mode with `BUILD_TARGET=capacitor` set.

### Step 3: Sync to iOS

```bash
npx cap sync ios
```

This copies your built `dist/` folder into the iOS app.

### Step 4: Open in Xcode

```bash
npx cap open ios
```

This opens Xcode with your project.

### Step 5: Configure Xcode (First Time Setup)

In Xcode:

1. **Select your team** (for code signing)
   - Click project name in left sidebar
   - Select "Signing & Capabilities" tab
   - Choose your Apple Developer team

2. **Set deployment target**
   - Minimum: iOS 13.0 or higher

3. **Run on simulator**
   - Select a simulator device (e.g., iPhone 15 Pro)
   - Click the Play button (▶️) or press `Cmd+R`

---

## Phase 4: Add Android Platform

### Step 1: Add Android Platform

```bash
npx cap add android
```

This creates an `android/` directory with an Android Studio project.

### Step 2: Sync to Android

```bash
npx cap sync android
```

### Step 3: Open in Android Studio

```bash
npx cap open android
```

This opens Android Studio with your project.

### Step 4: Configure Android Studio (First Time Setup)

In Android Studio:

1. **Wait for Gradle sync** to complete (may take a few minutes first time)

2. **Set up emulator** (if you don't have one):
   - Tools → Device Manager
   - Create Device → Select a device (e.g., Pixel 6)
   - Download system image (e.g., Android 13)

3. **Run on emulator**:
   - Select your emulator from dropdown
   - Click the Play button (▶️) or press `Shift+F10`

---

## Phase 5: Configure Clerk for Mobile

### Step 1: Update Clerk Dashboard Settings

Go to your Clerk Dashboard → Application → Settings:

1. **Add Allowed Origins**:
   ```
   capacitor://localhost
   ```

2. **Add Redirect URLs**:
   ```
   capacitor://localhost/
   capacitor://localhost/sign-in
   ```

3. **Configure OAuth** (if using social login):
   - iOS: Add custom URL scheme `com.harvous.app://`
   - Android: Add intent filter for `capacitor://localhost`

### Step 2: Test Authentication

1. Open app on simulator/emulator
2. Try signing in
3. Check that user is redirected back to app after Clerk auth

**Common issue:** If auth opens in Safari instead of staying in-app:
- Check `allowNavigation` in `capacitor.config.ts`
- Ensure Clerk dashboard has `capacitor://localhost` as allowed origin

---

## Phase 6: Testing Checklist

### Before Building

- [ ] Deployed Netlify backend is live
- [ ] All API routes work on Netlify
- [ ] `PUBLIC_API_URL` in `.env.capacitor` points to deployed site
- [ ] Clerk dashboard configured with mobile origins

### Test on Simulator/Emulator

- [ ] App launches without errors
- [ ] Sign in works (stays in app, doesn't open Safari)
- [ ] User sees their actual name (not "User")
- [ ] Can create notes/threads
- [ ] Can view existing content
- [ ] Panels and menus open
- [ ] Offline mode works (if enabled)

### Check Console Logs

In Xcode: View → Debug Area → Show Debug Area
In Android Studio: View → Tool Windows → Logcat

Look for:
- ❌ No React error #418
- ❌ No "<!DOCTYPE is not valid JSON" errors
- ❌ No 401 Unauthorized errors
- ✅ API calls returning 200/201
- ✅ JWT tokens being sent (check network requests)

---

## Common Issues & Solutions

### Issue 1: "Cannot read properties of undefined (reading 'Clerk')"

**Cause:** Clerk SDK not loading in mobile WebView

**Solution:**
```typescript
// In capacitor.config.ts, ensure allowNavigation includes:
allowNavigation: [
  'accounts.clerk.dev',
  '*.clerk.accounts.dev'
]
```

### Issue 2: "Network request failed" or API calls timing out

**Cause:** Trying to call `localhost` from mobile device

**Solution:**
- Set `PUBLIC_API_URL` to your deployed Netlify site
- Mobile simulators can't access `localhost` from your computer

### Issue 3: App opens Safari for authentication

**Cause:** Missing Clerk mobile configuration

**Solution:**
1. Add `capacitor://localhost` to Clerk allowed origins
2. Set `hostname: 'capacitor://localhost'` in `capacitor.config.ts`

### Issue 4: "401 Unauthorized" on all API calls

**Cause:** JWT tokens not being sent or verified

**Solution:**
1. Check `BUILD_TARGET=capacitor` env var is set during build
2. Verify `authenticatedFetch` is being used in components
3. Check API routes have dual-mode auth logic
4. Look for token verification errors in server logs

### Issue 5: White screen or app crashes on launch

**Cause:** Build issues or missing assets

**Solution:**
1. Run `npm run build:capacitor` again
2. Run `npx cap sync ios` or `npx cap sync android`
3. Clean build in Xcode/Android Studio
4. Check console for JavaScript errors

---

## Development Workflow

### Making Changes

1. **Edit code** in your Astro/React files

2. **Rebuild for Capacitor:**
   ```bash
   npm run build:capacitor
   ```

3. **Sync to platforms:**
   ```bash
   npx cap sync
   ```

4. **Reload app** in simulator/emulator

### Quick Sync Script

Add to `package.json`:
```json
{
  "scripts": {
    "cap:reload": "npm run build:capacitor && npx cap sync"
  }
}
```

Then just run: `npm run cap:reload`

---

## Advanced: Live Reload (Development)

For faster iteration during development:

### Step 1: Install Live Reload Plugin

```bash
npm install @capacitor/live-update
```

### Step 2: Update Capacitor Config

```typescript
const config: CapacitorConfig = {
  // ... existing config
  server: {
    url: 'http://YOUR_IP:4321',  // Your computer's local IP
    cleartext: true  // Allow HTTP in dev
  }
};
```

### Step 3: Start Dev Server

```bash
npm run dev
```

### Step 4: Run App

The app will now load from your dev server with live reload!

**Note:** Change back to `webDir: 'dist'` for production builds.

---

## Deployment

### iOS App Store

1. **Archive build** in Xcode:
   - Product → Archive
   - Wait for archive to complete

2. **Upload to App Store Connect**:
   - Window → Organizer
   - Select archive
   - Click "Distribute App"
   - Follow App Store submission flow

3. **Set up App Store listing** in App Store Connect

### Google Play Store

1. **Generate signed APK/Bundle** in Android Studio:
   - Build → Generate Signed Bundle/APK
   - Create/select keystore
   - Build release APK or AAB

2. **Upload to Google Play Console**:
   - Create app listing
   - Upload APK/AAB
   - Complete store listing details

---

## Security Checklist

Before going to production:

- [ ] Remove all console.log statements with sensitive data
- [ ] Enable ProGuard/R8 (Android) for code obfuscation
- [ ] Set up SSL pinning for API calls (advanced)
- [ ] Implement certificate pinning for Clerk domain
- [ ] Test with production Clerk keys (not development keys)
- [ ] Enable rate limiting on API endpoints
- [ ] Set up Crashlytics/Sentry for error tracking
- [ ] Test on real devices (not just simulators)

---

## Resources

- **Capacitor Docs**: https://capacitorjs.com/docs
- **Clerk Mobile Guide**: https://clerk.com/docs/references/javascript/overview
- **Ionic Forum** (Capacitor support): https://forum.ionicframework.com/
- **Astro + Capacitor**: Search GitHub for examples

---

## Need Help?

Common debugging steps:

1. **Check build output**: Look for errors in `npm run build:capacitor`
2. **Check sync output**: Look for warnings in `npx cap sync`
3. **Check device logs**: Use Xcode Console or Android Logcat
4. **Check network requests**: Use Safari Web Inspector (iOS) or Chrome DevTools (Android)
5. **Test on deployed Netlify**: Ensure backend works independently

**Safari Web Inspector for iOS**:
1. Safari → Preferences → Advanced → Show Develop menu
2. Develop → [Your Simulator] → localhost
3. See console logs and network requests

**Chrome DevTools for Android**:
1. Chrome → `chrome://inspect`
2. See your device under "Remote Target"
3. Click "Inspect" to see console

---

## Summary

You now have:
- ✅ Dual-mode authentication (SSR + Capacitor)
- ✅ 78 API routes supporting both modes
- ✅ 32 components using `authenticatedFetch`
- ✅ AuthGuard for client-side protection
- ✅ Complete setup guide for iOS/Android

**Next steps:**
1. Install Capacitor dependencies
2. Configure `capacitor.config.ts`
3. Deploy your backend to Netlify
4. Set `PUBLIC_API_URL` to deployed site
5. Run `npm run cap:ios` or `npm run cap:android`
6. Test authentication flow
7. Start building your mobile app! 🚀
