# Capacitor.js Strategic Analysis - iOS & Android Native Apps

> **SUPERSEDED (2026) — kept for historical reasoning only.** The team took
> the native-first path instead: `native/Harvous/` is a SwiftUI app targeting
> iOS + macOS directly against the shared Hono API, not a Capacitor wrapper
> around this web app. See `native/docs/future/ARCHITECTURE_ROADMAP.md` for
> the native app's own roadmap.

**Status:** Planning / Future Feature  
**Complexity:** High  
**Estimated Effort:** 20-32 days (MVP) | 6-9 weeks (full offline-first)  
**Last Updated:** January 2026

---

## 📋 Executive Summary

This document provides strategic analysis for converting Harvous from a PWA to native iOS and Android apps using Capacitor.js. For step-by-step implementation instructions, see [`../CAPACITOR_IMPLEMENTATION_GUIDE.md`](../CAPACITOR_IMPLEMENTATION_GUIDE.md).

**Key Takeaway:** Your app is already 60% ready for mobile. The React Islands architecture, clean separation of concerns, and existing PWA work provide a solid foundation. The main challenges are authentication, SSR-to-hybrid architecture, and platform-specific polish.

---

## 🏗️ Major Architectural Challenges

### 1. SSR to Hybrid Architecture ⚠️ **BIGGEST CHALLENGE**

**Current State:**
- Astro with `output: "server"` mode
- Netlify adapter for SSR
- Dynamic routes (`/[id].astro`) rendered server-side
- Middleware handles auth redirects

**The Problem:**
Capacitor apps are **bundled static assets** that run locally on the device. Server-side rendering doesn't exist in the traditional sense.

**Solution Options:**

#### Option A: Full Static Export (Simplest but Limited)
```typescript
// astro.config.mjs
export default defineConfig({
  output: "static"  // Pre-render everything at build time
});
```

**Pros:**
- Simplest conversion
- No API server needed for content
- True offline-first

**Cons:**
- Dynamic routes (`/[id].astro`) must be pre-rendered or handled differently
- Authentication flows need complete redesign
- Can't use server-side database queries
- Large build size if you have many notes/threads

**Verdict:** ❌ Not practical for Harvous due to dynamic content

#### Option B: Hybrid Static + Remote API ✅ **RECOMMENDED**
```typescript
// astro.config.mjs
export default defineConfig({
  output: "static",
  // Build static shell, API calls to hosted backend
});
```

**Architecture:**
- Frontend: Static Astro + React components bundled with Capacitor
- Backend: Keep current Netlify deployment as API server
- App makes HTTP requests to `https://harvous.com/api/*` endpoints
- Database stays on Turso (remote access via API)

**Static build requirement:** Capacitor runs only static assets; there is no server. To build for Capacitor, Astro must output a static site. Use conditional config: when `BUILD_TARGET=capacitor` (or equivalent env), set `output: "static"` in `astro.config.mjs`; otherwise keep `output: "server"` for web. See [CAPACITOR_IMPLEMENTATION_GUIDE.md](../CAPACITOR_IMPLEMENTATION_GUIDE.md) for the exact config snippet and script.

**Dynamic routes (e.g. `/[id].astro`):** Astro static requires `getStaticPaths()`; with unbounded ids (thread_*, note_*, space_*) use a single app shell—e.g. `getStaticPaths()` returns one path (e.g. id: 'dashboard') and all content for a given id is loaded client-side via API; other paths 404 or redirect to shell and client loads by id.

**Pros:**
- Minimal architecture changes
- Leverages existing backend infrastructure
- Easier to maintain (one codebase for web + mobile)
- Can share session/auth state between platforms
- Progressive rollout (web works as-is)

**Cons:**
- Requires internet connection for most features
- API latency on mobile networks
- Need CORS configuration (though less restrictive in native)

**Verdict:** ✅ **Best approach for MVP**

#### Option C: Full Offline-First (Most Complex)
```typescript
// Use @capacitor-community/sqlite for local database
import { CapacitorSQLite } from '@capacitor-community/sqlite';
```

**Architecture:**
- Local SQLite database on device
- Sync engine for cloud backup
- Conflict resolution for multi-device users
- Background sync when online

**Pros:**
- True offline functionality
- Fast performance (no network calls)
- Better user experience in poor connectivity

**Cons:**
- 🚨 **Massive undertaking**: 6-9 weeks additional effort
- Complete data layer rewrite
- Complex sync logic (what if user edits on web + mobile?)
- Conflict resolution UI
- Testing complexity (sync edge cases)
- Migration path for existing users

**Verdict:** ⏰ **Phase 2 feature** - implement after MVP launch

---

### 2. Authentication Migration 🔐

**Current Implementation:**
```typescript
// src/middleware.ts
export const onRequest = clerkMiddleware((auth, context, next) => {
  if (!auth().userId) {
    return Response.redirect(signInUrl);  // Server redirect
  }
  return next();
});
```

**Challenges:**

1. **Server Middleware Doesn't Exist in Capacitor**
   - No server to run middleware
   - Can't redirect before page loads
   
2. **OAuth Flows Need Native Handling**
   - Google Sign-In, Apple Sign-In use custom URL schemes
   - Need deep linking configuration
   
3. **Token Storage**
   - Web: Cookies (automatic, secure)
   - Native: Need secure storage plugin

**Solution Architecture: Dual-mode API auth (JWT for native)**

Protected UI is enforced by redirect on 401 from the API and/or a single session check at app/layout load—not by an AuthGuard wrapper or server middleware (middleware does not run in a static/Capacitor build).

**Required Changes:**

1. **Client (Capacitor):** All API requests must use `PUBLIC_API_URL` (full Netlify URL) as base—relative `/api/...` resolves to capacitor://localhost and fails. Use Clerk's `getToken()` and send `Authorization: Bearer <token>` on every request to your API.

2. **API routes:** Support two modes: if the request has an `Authorization: Bearer` token, verify the JWT (e.g. via Clerk's verifyToken or your backend validation), extract `userId`, and proceed; if no Bearer token (web), use `locals.auth()` from cookies/session as today.

3. **Unauthenticated UI:** Do not use an AuthGuard wrapper. Handle unauthenticated state by: redirecting to sign-in when the app receives 401 from the API, and/or a single check at app/layout load that redirects to sign-in if there is no session.

4. **Deep linking for OAuth:** Use `capacitor://localhost` and `capacitor://localhost/sign-in` as allowed origins and redirect URLs in the Clerk dashboard. Configure OAuth so the app stays in-app after sign-in (see [CAPACITOR_IMPLEMENTATION_GUIDE.md](../CAPACITOR_IMPLEMENTATION_GUIDE.md) and [CAPACITOR_SETUP_GUIDE.md](CAPACITOR_SETUP_GUIDE.md)).

5. **Optional:** Secure token storage (e.g. `@capacitor/preferences` or `@aparajita/capacitor-secure-storage`) if you need to persist the token across app restarts.

**Checklist:**
- [ ] API base is PUBLIC_API_URL when in Capacitor (safeFetch/buildAPIUrl or API client is Capacitor-aware)
- [ ] API routes accept and verify Bearer JWT when request has Authorization header
- [ ] Client sends Bearer JWT for all API calls when running in Capacitor (e.g. detect via Capacitor.isNativePlatform())
- [ ] Redirect to sign-in on 401 or when no session at app load

**Effort Estimate:** 3-5 days

---

### 3. Database Strategy 🗄️

**Current:** Astro DB (Turso) accessed server-side via `db/config.ts`

**Mobile Options:**

| Approach | Complexity | Offline Support | Performance | Maintenance |
|----------|-----------|----------------|-------------|-------------|
| **Remote API Only** | Low | ❌ No | Medium | Easy |
| **Remote + Cache** | Medium | ⚠️ Read-only | Good | Medium |
| **Local SQLite + Sync** | High | ✅ Full | Excellent | Complex |

**Recommendation for MVP:** Remote API with aggressive caching

```typescript
// src/utils/api-client.ts
import { Preferences } from '@capacitor/preferences';

export const fetchNotes = async (userId: string) => {
  // Try cache first (fast)
  const cached = await Preferences.get({ key: `notes_${userId}` });
  if (cached.value) {
    const { data, timestamp } = JSON.parse(cached.value);
    const age = Date.now() - timestamp;
    
    // Return cached if < 5 minutes old
    if (age < 5 * 60 * 1000) {
      return data;
    }
  }
  
  // Fetch from API
  const response = await fetch(`${API_BASE}/api/notes/user/${userId}`);
  const data = await response.json();
  
  // Update cache
  await Preferences.set({
    key: `notes_${userId}`,
    value: JSON.stringify({ data, timestamp: Date.now() })
  });
  
  return data;
};
```

**Effort Estimate:** 
- Remote API only: 1-2 days
- With caching: 2-3 days  
- Full SQLite + sync: 3-4 weeks 🚨

---

## 📱 Technical Implementation Checklist

### Phase 1: Setup & Configuration (Day 1-2)

- [ ] Install Capacitor packages
- [ ] Initialize Capacitor config
- [ ] Add iOS and Android platforms
- [ ] Update `.gitignore`
- [ ] Create mobile-specific Astro config
- [ ] Configure build scripts

**Scripts to add:**
```json
{
  "scripts": {
    "build:web": "astro build --remote",
    "build:mobile": "astro build --config astro.config.mobile.mjs",
    "cap:sync": "npm run build:mobile && cap sync",
    "cap:ios": "npm run cap:sync && cap open ios",
    "cap:android": "npm run cap:sync && cap open android",
    "cap:dev:ios": "cap run ios",
    "cap:dev:android": "cap run android"
  }
}
```

### Phase 2: Code Adaptations (Day 3-7)

- [ ] **Service Worker Handling**
  ```typescript
  // Disable SW in native context
  if (!Capacitor.isNativePlatform()) {
    // Register service worker
    navigator.serviceWorker.register('/sw.js');
  }
  ```

- [ ] **Environment Detection Utility**
  ```typescript
  // src/utils/platform.ts
  import { Capacitor } from '@capacitor/core';
  
  export const isNative = () => Capacitor.isNativePlatform();
  export const platform = () => Capacitor.getPlatform(); // 'ios' | 'android' | 'web'
  export const isIOS = () => platform() === 'ios';
  export const isAndroid = () => platform() === 'android';
  ```

- [ ] **API Base URL Management**
  ```typescript
  // src/utils/api-config.ts
  export const API_BASE = isNative()
    ? import.meta.env.PUBLIC_API_URL || 'https://harvous.com'
    : '';
  ```

- [ ] **Asset Path Handling**
  ```typescript
  // For native file access
  import { Capacitor } from '@capacitor/core';
  
  const iconPath = Capacitor.convertFileSrc('/favicon.svg');
  ```

- [ ] **IndexedDB (Dexie) Compatibility Check**
  - Test in iOS Safari WebView
  - Test in Android WebView
  - Add fallbacks if needed

### Phase 3: Native Features & Plugins (Day 8-10)

**Essential Plugins:**
```bash
npm install @capacitor/splash-screen
npm install @capacitor/status-bar  
npm install @capacitor/keyboard
npm install @capacitor/app           # Deep linking, app state
npm install @capacitor/preferences   # Key-value storage
npm install @capacitor/haptics       # Tactile feedback
```

**Nice-to-Have Plugins:**
```bash
npm install @capacitor/share         # Native share sheet
npm install @capacitor/clipboard     # Better clipboard
npm install @capacitor/toast         # Native toast messages
```

**Configuration Example:**
```typescript
// capacitor.config.ts
import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.harvous.app',
  appName: 'Harvous',
  webDir: 'dist',
  server: {
    // For dev with live reload - REMOVE in production
    // url: 'http://localhost:4321',
    // cleartext: true
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: '#F7F7F6',
      showSpinner: false
    },
    StatusBar: {
      style: 'light',
      backgroundColor: '#F7F7F6'
    },
    Keyboard: {
      resize: 'body',
      resizeOnFullScreen: true
    }
  }
};

export default config;
```

### Phase 4: Authentication Implementation (Day 11-15)

- [ ] Implement dual-mode API auth (JWT verification on API side; client sends Bearer token in Capacitor)
- [ ] Optional: secure storage for token if needed
- [ ] Configure deep linking for OAuth (capacitor://localhost; see Implementation Guide)
- [ ] Test Google Sign-In on iOS
- [ ] Test Google Sign-In on Android
- [ ] Handle auth state persistence
- [ ] Redirect to sign-in on 401 or at root when no session
- [ ] Test sign-out flow

### Phase 5: Platform-Specific Polish (Day 16-20)

**iOS Requirements:**
- [ ] App icons (all sizes: 20x20 to 1024x1024)
- [ ] Launch screen/storyboard
- [ ] Safe area insets for notch/Dynamic Island
- [ ] Dark mode support (currently missing!)
- [ ] Native back gesture handling
- [ ] Keyboard dismissal behavior
- [ ] Privacy descriptions in Info.plist

**Android Requirements:**
- [ ] Adaptive icons (foreground + background)
- [ ] Splash screen (various densities)
- [ ] Back button handling
- [ ] Status bar theming
- [ ] Keyboard behavior
- [ ] Edge-to-edge layout (Android 10+)
- [ ] Permissions in AndroidManifest.xml

### Phase 6: Testing & Bug Fixes (Day 21-25)

- [ ] Test on iOS device (not just simulator)
- [ ] Test on Android device (not just emulator)
- [ ] Test authentication flows
- [ ] Test note creation/editing
- [ ] Test navigation (back/forward)
- [ ] Test thread management
- [ ] Test space organization
- [ ] Test scripture detection
- [ ] Test offline behavior (airplane mode)
- [ ] Test different screen sizes
- [ ] Test on older OS versions (iOS 14+, Android 8+)
- [ ] Memory leak testing
- [ ] Performance profiling

---

## 📊 Effort Breakdown

### Minimum Viable Mobile App (Hybrid Approach)

| Task | Effort | Notes |
|------|--------|-------|
| Setup & Configuration | 2-3 days | Capacitor init, build configs |
| Auth Migration | 3-5 days | JWT dual-mode API auth, OAuth, storage |
| Code Adaptations | 5-7 days | SW handling, API config, asset paths |
| iOS-Specific Polish | 3-4 days | Icons, safe areas, dark mode |
| Android-Specific Polish | 2-3 days | Icons, back button, permissions |
| Testing & Bug Fixes | 5-10 days | Device testing, edge cases |
| **TOTAL** | **20-32 days** | ~4-6 weeks of focused work |

### Full Offline-First App (Local SQLite)

| Additional Task | Effort | Notes |
|----------------|--------|-------|
| SQLite Schema Migration | 1 week | Recreate Astro DB schema in SQLite |
| Data Sync Engine | 2-3 weeks | Upload/download, conflict resolution |
| Offline UI/UX | 1 week | Sync indicators, conflict UI |
| Testing & Edge Cases | 2 weeks | Multi-device sync, conflicts |
| **ADDITIONAL** | **6-9 weeks** | On top of MVP effort |

---

## 🎯 Recommended Implementation Strategy

### Phase 1: MVP Launch (4-6 weeks)

**Goal:** Get native apps in stores with core functionality

**Approach:**
1. ✅ Hybrid static + remote API
2. ✅ Keep Turso remote (no local database)
3. ✅ Focus on iOS first (stricter review = Android easier after)
4. ✅ Aggressive caching for perceived performance
5. ✅ Basic offline indicators ("You're offline")

**Features:**
- ✅ Full CRUD for notes/threads/spaces
- ✅ Authentication (Google, email)
- ✅ Scripture detection
- ✅ Rich text editing
- ✅ Navigation
- ⚠️ Limited offline (cached content only)

**Success Criteria:**
- App approved by both stores
- No critical bugs
- Basic feature parity with web
- Acceptable performance

### Phase 2: Enhanced Offline (2-3 weeks after MVP)

**Goal:** Improve offline experience without full sync

**Approach:**
1. Implement write queueing
2. Cache more aggressively (last 100 notes, all spaces)
3. Better offline UI (sync status, queued actions)

**Features:**
- ✅ Read cached content offline
- ✅ Create notes offline (sync when online)
- ✅ Queue edits (apply when reconnected)
- ⚠️ No conflict resolution (last-write-wins)

### Phase 3: Full Offline-First (After user feedback)

**Goal:** True offline-first with sync

**Only implement if:**
- Users request it heavily
- Analytics show poor connectivity is common
- Have 6-9 weeks of dedicated time

**Features:**
- ✅ Local SQLite database
- ✅ Full offline read/write
- ✅ Intelligent sync
- ✅ Conflict resolution UI
- ✅ Multi-device support

---

## 🍎 App Store Approval Considerations

### iOS App Store (1-3 days review)

**Critical Requirements:**
- [ ] **Guideline 2.1** - App Completeness
  - No placeholder content or "coming soon"
  - All features must work
  - No broken links
  
- [ ] **Guideline 4.2** - Minimum Functionality
  - Must provide value beyond website
  - **Your advantage:** Offline access, native feel, home screen icon
  
- [ ] **Guideline 5.1.1** - Privacy
  - Privacy policy URL (required)
  - Data collection disclosure
  - Privacy labels in App Store Connect

**Common Rejection Reasons:**
- ❌ Just a web wrapper (you're safe - React Islands + native plugins)
- ❌ Crashes or bugs
- ❌ Broken authentication
- ❌ Missing privacy policy
- ❌ Poor performance

**Tips:**
- Test on physical device before submission
- Record demo video for reviewers
- Provide test account credentials
- Explain features in App Review notes

### Google Play Store (Hours to 7 days review)

**Critical Requirements:**
- [ ] **Target SDK Version** - Must target Android 13+ (API 33)
- [ ] **Privacy Policy** - Required URL
- [ ] **Content Rating** - Complete questionnaire
- [ ] **Data Safety** - Disclose data collection

**Common Issues:**
- ❌ Permissions not justified
- ❌ Large APK size (use AAB instead)
- ❌ Missing privacy policy
- ❌ Misleading screenshots

**Tips:**
- Use App Bundle (.aab) not APK
- Enable Play App Signing
- Test on various Android versions
- Use internal testing track first

---

## 🚧 Known Compatibility Issues

### Service Worker Conflicts

**Problem:** `public/sw.js` won't work correctly in Capacitor
```javascript
// Current implementation assumes web context
self.addEventListener('fetch', (event) => {
  // Native apps don't use fetch events the same way
});
```

**Solution:**
```typescript
// public/scripts/pwa-startup.js
if ('serviceWorker' in navigator && !window.Capacitor) {
  navigator.serviceWorker.register('/sw.js');
}
```

### Clerk OAuth Redirects

**Problem:** OAuth flows redirect to web URLs, not app URLs

**Solution:** Use `capacitor://localhost` as the app origin. In Clerk dashboard, add allowed origins and redirect URLs: `capacitor://localhost`, `capacitor://localhost/sign-in`. Set `hostname: 'capacitor://localhost'` in `capacitor.config.ts` (see [CAPACITOR_IMPLEMENTATION_GUIDE.md](../CAPACITOR_IMPLEMENTATION_GUIDE.md) and [CAPACITOR_SETUP_GUIDE.md](CAPACITOR_SETUP_GUIDE.md)).

### Tiptap Editor on Mobile

**Potential Issues:**
- Keyboard toolbar overlap
- Selection handling
- Copy/paste behavior

**Testing Required:**
- Test on iOS Safari WebView
- Test on Android Chrome WebView
- Test with hardware keyboard (iPad)
- Test with voice input

### PostHog Analytics

**May need platform detection:**
```typescript
import { Capacitor } from '@capacitor/core';

posthog.init({
  api_host: 'https://app.posthog.com',
  persistence: Capacitor.isNativePlatform() ? 'localStorage' : 'cookie'
});
```

---

## 💰 Financial Considerations

### Development Costs

| Item | Cost |
|------|------|
| Apple Developer Account | $99/year |
| Google Play Developer Account | $25 one-time |
| **Developer Time** (20-32 days @ $100/hr) | $16,000 - $25,600 |
| **Total First Year** | ~$16,124 - $25,724 |

### Ongoing Costs

| Item | Cost |
|------|------|
| Apple Developer Renewal | $99/year |
| Google Play (no renewal) | $0/year |
| Maintenance/Updates | ~5-10 hours/month |
| **Total Annual** | ~$99 + dev time |

### Break-Even Analysis

**If monetizing:**
- Church plans at $20/month = 65-107 churches to break even first year
- Individual add-ons at $5/month = 269-428 users to break even first year

**If not monetizing:**
- Consider user growth impact
- Mobile apps significantly increase engagement
- Stickiness: Users check apps 3-5x more than websites

---

## 🎨 UI/UX Enhancements for Mobile

### Touch Targets

**Current Issue:** Some buttons may be too small for mobile

**Solution:**
```css
/* Minimum touch target: 44x44 points (iOS) / 48x48 dp (Android) */
.button-mobile {
  min-height: 44px;
  min-width: 44px;
  padding: 12px 16px;
}
```

### Safe Area Insets

**iOS Notch/Dynamic Island:**
```css
/* Add to layout components */
.header {
  padding-top: env(safe-area-inset-top);
}

.bottom-nav {
  padding-bottom: env(safe-area-inset-bottom);
}
```

### Keyboard Handling

**Problem:** Keyboard covers input fields

**Solution:**
```typescript
import { Keyboard } from '@capacitor/keyboard';

Keyboard.addListener('keyboardWillShow', (info) => {
  // Adjust viewport
  document.body.style.paddingBottom = `${info.keyboardHeight}px`;
});

Keyboard.addListener('keyboardWillHide', () => {
  document.body.style.paddingBottom = '0';
});
```

### Pull-to-Refresh

**Native feel:**
```bash
npm install @ionic/pwa-elements
```

```typescript
// Add to main pages
<IonRefresher onIonRefresh={handleRefresh}>
  <IonRefresherContent />
</IonRefresher>
```

---

## 📈 Success Metrics

### Track These Post-Launch

**Engagement:**
- [ ] Daily active users (mobile vs web)
- [ ] Session length (mobile vs web)
- [ ] Notes created per user
- [ ] Retention rate (D1, D7, D30)

**Performance:**
- [ ] App launch time
- [ ] Time to first interaction
- [ ] API response times
- [ ] Crash rate (target: <0.1%)

**Adoption:**
- [ ] App Store downloads
- [ ] Play Store downloads
- [ ] Conversion rate (web → mobile)
- [ ] App Store ratings

**Business:**
- [ ] Revenue per mobile user
- [ ] Upgrade rate (mobile vs web)
- [ ] Churn rate

---

## 🔗 Related Documentation

- **Implementation Guide:** [`../CAPACITOR_IMPLEMENTATION_GUIDE.md`](../CAPACITOR_IMPLEMENTATION_GUIDE.md) - Step-by-step setup instructions
- **Offline Mode:** [`./OFFLINE_MODE_IMPLEMENTATION.md`](./OFFLINE_MODE_IMPLEMENTATION.md) - Full offline-first architecture
- **Architecture:** [`../ARCHITECTURE.md`](../ARCHITECTURE.md) - Current app architecture
- **React Islands:** [`../REACT_ISLANDS_STRATEGY.md`](../REACT_ISLANDS_STRATEGY.md) - Component architecture

---

## 🎬 Next Steps

### When Ready to Implement:

**Prerequisites (codebase changes):** Static build when `BUILD_TARGET=capacitor` (see Implementation Guide for astro.config); API routes support dual-mode auth (Bearer JWT when in Capacitor). These must be implemented before or as part of following the Implementation Guide.

1. **Planning Phase** (1-2 days)
   - [ ] Review this document thoroughly
   - [ ] Review implementation guide
   - [ ] Decide on approach (recommend Hybrid MVP)
   - [ ] Set up developer accounts
   - [ ] Plan release timeline

2. **Preparation** (2-3 days)
   - [ ] Install Xcode and Android Studio
   - [ ] Set up certificates/keys
   - [ ] Create mobile-optimized build config (static build + JWT dual-mode auth)
   - [ ] Audit current codebase for mobile compatibility

3. **Development** (4-6 weeks)
   - Follow implementation guide
   - Regular testing on physical devices
   - Document platform-specific quirks

4. **Testing** (1-2 weeks)
   - Beta testing via TestFlight (iOS)
   - Internal testing via Play Console (Android)
   - Fix critical bugs
   - Performance optimization

5. **Launch** (1 week)
   - Submit to App Store
   - Submit to Play Store
   - Prepare marketing materials
   - Monitor analytics closely

---

## ⚡ Quick Decision Tree

**Q: Should we go native with Capacitor?**

✅ **Yes, if:**
- You want to increase engagement (mobile users check apps more)
- You need home screen presence
- You want to explore mobile-specific features (push notifications, haptics)
- You're ready for 4-6 weeks of focused development
- You have budget for $99/year (iOS) + $25 one-time (Android)

⏸️ **Wait, if:**
- Current PWA is working well for users
- No user requests for native apps
- Team is too busy with other features
- Budget is constrained

❌ **No, if:**
- PWA meets all needs
- No plans for mobile-specific features
- Can't maintain two platforms

**Recommendation for Harvous:** ✅ **Proceed with MVP approach**
- Good foundation (React Islands, PWA)
- Growing user base will benefit from mobile presence
- Bible study apps thrive on mobile
- Competition likely has native apps

---

**Last Updated:** January 2026  
**Author:** Strategic Analysis  
**Status:** Ready for Planning Phase 🚀
