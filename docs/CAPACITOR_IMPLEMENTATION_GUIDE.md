# Capacitor Implementation Guide for iOS and Android

This guide walks through the complete process of converting Harvous from a PWA to native iOS and Android apps using Capacitor. It assumes you have **not yet set up developer accounts** for Apple or Google.

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Developer Account Setup](#developer-account-setup)
3. [Capacitor Installation](#capacitor-installation)
4. [Capacitor Configuration](#capacitor-configuration)
5. [iOS Setup](#ios-setup)
6. [Android Setup](#android-setup)
7. [Building for Production](#building-for-production)
8. [App Store Submission](#app-store-submission)
9. [Environment Variables for Mobile](#environment-variables-for-mobile)
10. [Common Issues & Troubleshooting](#common-issues--troubleshooting)
11. [Maintenance & Updates](#maintenance--updates)

---

## Prerequisites

### Required Software

**For iOS Development:**
- **macOS** (required - iOS development only works on Mac)
- **Xcode** (latest version from Mac App Store)
- **Xcode Command Line Tools**: `xcode-select --install`
- **CocoaPods** (iOS dependency manager): `sudo gem install cocoapods`

**For Android Development:**
- **Android Studio** (download from https://developer.android.com/studio)
- **Java Development Kit (JDK)** 17 or later
- **Android SDK** (installed via Android Studio)
- **Environment variables**:
  - `ANDROID_HOME` or `ANDROID_SDK_ROOT`
  - `JAVA_HOME`

**For Both:**
- **Node.js** >= 20.6.1 (already installed)
- **npm** or **pnpm**

### Verify Prerequisites

```bash
# Check Node.js version
node --version  # Should be >= 20.6.1

# Check npm
npm --version

# For iOS (Mac only)
xcode-select -p  # Should return a path
pod --version    # Should return version after installing CocoaPods

# For Android
java -version    # Should be JDK 17+
adb version      # Android Debug Bridge (installed with Android Studio)
```

---

## Developer Account Setup

### Apple Developer Account (iOS)

**Cost:** $99/year (individual) or $299/year (organization)

**Steps:**

1. **Visit Apple Developer Portal**
   - Go to https://developer.apple.com/programs/
   - Click "Enroll"

2. **Create Apple ID** (if you don't have one)
   - Use a professional email address
   - This will be your developer account email

3. **Enroll in Apple Developer Program**
   - Choose "Individual" or "Organization"
   - Individual: $99/year, requires personal info
   - Organization: $299/year, requires D-U-N-S number and legal entity
   - Complete payment and verification (can take 24-48 hours)

4. **Access Developer Portal**
   - Once approved, log in at https://developer.apple.com/account
   - You'll need this for:
     - App IDs
     - Certificates
     - Provisioning profiles
     - App Store Connect access

**Important Notes:**
- Approval can take 1-2 business days
- You can start development before approval, but need it for App Store submission
- Keep your Apple ID credentials secure - you'll need them for Xcode

### Google Play Developer Account (Android)

**Cost:** $25 one-time fee

**Steps:**

1. **Visit Google Play Console**
   - Go to https://play.google.com/console
   - Sign in with your Google account

2. **Pay Registration Fee**
   - One-time $25 payment
   - Payment is processed immediately

3. **Complete Developer Profile**
   - Account details
   - Contact information
   - Developer name (appears in Play Store)

4. **Accept Developer Agreement**
   - Read and accept terms

**Important Notes:**
- Approval is usually instant (within hours)
- You can start development immediately
- Keep your Google account secure

---

## Capacitor Installation

### Step 1: Install Capacitor Core and CLI

```bash
npm install @capacitor/core @capacitor/cli
```

### Step 2: Initialize Capacitor

```bash
npx cap init
```

This will prompt you for:
- **App name**: `Harvous` (or keep current)
- **App ID**: `com.harvous.app` (reverse domain notation - change if needed)
- **Web directory**: `dist` (Astro's output directory)

**Important:** The App ID (Bundle Identifier) must be unique and cannot be changed later without significant work. Use reverse domain notation:
- `com.yourcompany.harvous`
- `com.harvous.app`
- `io.harvous.app`

### Step 3: Install Platform Packages

```bash
# For iOS
npm install @capacitor/ios

# For Android
npm install @capacitor/android
```

### Step 4: Add Platforms

```bash
# Add iOS platform
npx cap add ios

# Add Android platform
npx cap add android
```

This creates:
- `ios/` directory (iOS native project)
- `android/` directory (Android native project)

### Step 5: Update package.json Scripts

Add these scripts to `package.json`:

```json
{
  "scripts": {
    "cap:sync": "npx cap sync",
    "cap:open:ios": "npx cap open ios",
    "cap:open:android": "npx cap open android",
    "cap:build:ios": "npm run build && npx cap sync ios",
    "cap:build:android": "npm run build && npx cap sync android"
  }
}
```

---

## Capacitor Configuration

### capacitor.config.ts

Create or update `capacitor.config.ts` in the project root:

```typescript
import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.harvous.app', // Must match what you set during init
  appName: 'Harvous',
  webDir: 'dist',
  server: {
    // For development - allows live reload
    // Remove in production or set to your production URL
    // url: 'http://localhost:4321',
    // cleartext: true
  },
  ios: {
    contentInset: 'automatic',
    scrollEnabled: true,
    // iOS-specific settings
    scheme: 'harvous',
    // Splash screen settings
    splash: {
      image: 'assets/splash.png',
      resizeMode: 'contain',
      backgroundColor: '#F7F7F6'
    }
  },
  android: {
    // Android-specific settings
    allowMixedContent: true,
    // Splash screen settings
    splash: {
      image: 'assets/splash.png',
      resizeMode: 'contain',
      backgroundColor: '#F7F7F6'
    },
    // Build configuration
    buildOptions: {
      keystorePath: undefined, // Set path to keystore for production
      keystoreAlias: undefined, // Set alias for production
      keystorePassword: undefined, // Set password for production
      keystoreType: undefined // Set type (usually 'jks' or 'pkcs12')
    }
  },
  plugins: {
    // Plugin configurations
    SplashScreen: {
      launchShowDuration: 2000,
      launchAutoHide: true,
      backgroundColor: '#F7F7F6',
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
      iosSpinnerStyle: 'small',
      spinnerColor: '#999999'
    }
  }
};

export default config;
```

### Update .gitignore

Add these entries to `.gitignore`:

```
# Capacitor
ios/
android/
.capacitor/
```

**Note:** You may want to commit `ios/` and `android/` if you need to track native code changes, but typically these are generated and can be ignored.

---

## iOS Setup

### Step 1: Install CocoaPods Dependencies

```bash
cd ios/App
pod install
cd ../..
```

**If you get errors:**
- Update CocoaPods: `sudo gem install cocoapods`
- Update repo: `pod repo update`
- Clean: `pod deintegrate && pod install`

### Step 2: Open in Xcode

```bash
npx cap open ios
```

Or manually:
```bash
open ios/App/App.xcworkspace
```

**Important:** Always open `.xcworkspace`, not `.xcodeproj`

### Step 3: Configure Signing & Capabilities

1. **Select Project in Navigator**
   - Click "App" (blue icon) in left sidebar

2. **General Tab**
   - **Display Name**: `Harvous` (what users see on home screen)
   - **Bundle Identifier**: `com.harvous.app` (must match `appId` in config)
   - **Version**: `0.121.2` (match your package.json version)
   - **Build**: `1` (increment for each build)

3. **Signing & Capabilities Tab**
   - **Team**: Select your Apple Developer account
   - **Automatically manage signing**: ✅ Checked
   - Xcode will create certificates and provisioning profiles automatically

4. **Capabilities** (if needed):
   - **Push Notifications** (if you plan to add them)
   - **Background Modes** (if needed)
   - **Keychain Sharing** (if needed)

### Step 4: Configure Info.plist

1. **Open Info.plist**
   - Navigate to `ios/App/App/Info.plist` in Xcode

2. **Add Required Keys** (if not present):
   - `NSAppTransportSecurity` - Allow HTTP connections (if needed for development)
   - `NSCameraUsageDescription` - If using camera
   - `NSPhotoLibraryUsageDescription` - If accessing photos
   - `NSLocationWhenInUseUsageDescription` - If using location

3. **Example Info.plist additions:**

```xml
<key>NSAppTransportSecurity</key>
<dict>
  <key>NSAllowsArbitraryLoads</key>
  <false/>
  <key>NSExceptionDomains</key>
  <dict>
    <key>your-api-domain.com</key>
    <dict>
      <key>NSIncludesSubdomains</key>
      <true/>
      <key>NSTemporaryExceptionAllowsInsecureHTTPLoads</key>
      <true/>
    </dict>
  </dict>
</dict>
```

### Step 5: Build and Test

1. **Select Target Device**
   - Choose simulator (e.g., "iPhone 15 Pro") or connected device

2. **Build**
   - Press `Cmd + B` or Product → Build

3. **Run**
   - Press `Cmd + R` or Product → Run

4. **Test on Device**
   - Connect iPhone/iPad via USB
   - Trust computer on device
   - Select device in Xcode
   - Run (may need to trust developer certificate on device)

---

## Android Setup

### Step 1: Install Android Studio

1. **Download Android Studio**
   - https://developer.android.com/studio
   - Install following the wizard

2. **Install SDK Components**
   - Open Android Studio
   - Tools → SDK Manager
   - Install:
     - Android SDK Platform 33 (or latest)
     - Android SDK Build-Tools
     - Android SDK Command-line Tools
     - Android Emulator

3. **Set Environment Variables**

**macOS/Linux:**
```bash
# Add to ~/.zshrc or ~/.bashrc
export ANDROID_HOME=$HOME/Library/Android/sdk
export PATH=$PATH:$ANDROID_HOME/emulator
export PATH=$PATH:$ANDROID_HOME/platform-tools
export PATH=$PATH:$ANDROID_HOME/tools
export PATH=$PATH:$ANDROID_HOME/tools/bin
```

**Windows:**
- System Properties → Environment Variables
- Add `ANDROID_HOME` = `C:\Users\YourUsername\AppData\Local\Android\Sdk`
- Add to PATH: `%ANDROID_HOME%\platform-tools`

### Step 2: Open in Android Studio

```bash
npx cap open android
```

Or manually:
- Open Android Studio
- File → Open → Select `android/` directory

### Step 3: Configure build.gradle

1. **Open `android/app/build.gradle`**

2. **Update Application ID:**
```gradle
android {
    namespace "com.harvous.app"
    defaultConfig {
        applicationId "com.harvous.app"
        minSdkVersion 22  // Minimum Android version
        targetSdkVersion 33  // Target Android version
        versionCode 1  // Increment for each release
        versionName "0.121.2"  // Match package.json version
    }
}
```

3. **Configure Signing** (for production - see Building for Production)

### Step 4: Configure AndroidManifest.xml

1. **Open `android/app/src/main/AndroidManifest.xml`**

2. **Add Permissions** (if needed):
```xml
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.CAMERA" />
<uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" />
```

3. **Configure Application:**
```xml
<application
    android:label="Harvous"
    android:icon="@mipmap/ic_launcher"
    android:roundIcon="@mipmap/ic_launcher_round"
    android:usesCleartextTraffic="true"  <!-- Remove in production -->
    ...>
</application>
```

### Step 5: Build and Test

1. **Build APK (Debug)**
   ```bash
   cd android
   ./gradlew assembleDebug
   ```
   APK will be at: `android/app/build/outputs/apk/debug/app-debug.apk`

2. **Run on Emulator**
   - Tools → Device Manager → Create Virtual Device
   - Select device → Run

3. **Run on Physical Device**
   - Enable Developer Options on Android device
   - Enable USB Debugging
   - Connect via USB
   - Run from Android Studio

---

## Building for Production

### iOS Production Build

#### Step 1: Create App Store Archive

1. **Select "Any iOS Device" or "Generic iOS Device"** in Xcode

2. **Product → Archive**
   - Wait for build to complete
   - Organizer window will open

3. **Distribute App**
   - Click "Distribute App"
   - Choose "App Store Connect"
   - Follow wizard to upload

#### Step 2: App Store Connect

1. **Create App Record**
   - Go to https://appstoreconnect.apple.com
   - My Apps → + (New App)
   - Fill in:
     - Platform: iOS
     - Name: Harvous
     - Primary Language: English
     - Bundle ID: Select the one you created
     - SKU: Unique identifier (e.g., `harvous-ios-001`)

2. **App Information**
   - Category
   - Privacy Policy URL
   - Support URL

3. **Prepare for Submission**
   - Screenshots (required sizes)
   - App description
   - Keywords
   - App icon
   - Age rating

### Android Production Build

#### Step 1: Create Keystore

```bash
cd android/app
keytool -genkey -v -keystore harvous-release-key.jks -keyalg RSA -keysize 2048 -validity 10000 -alias harvous
```

**Important:**
- Save keystore file securely (you cannot recover it)
- Remember password and alias
- Store credentials securely (password manager)

#### Step 2: Configure Signing

1. **Create `android/key.properties`:**
```properties
storePassword=your-keystore-password
keyPassword=your-key-password
keyAlias=harvous
storeFile=../app/harvous-release-key.jks
```

2. **Update `android/app/build.gradle`:**
```gradle
def keystoreProperties = new Properties()
def keystorePropertiesFile = rootProject.file('key.properties')
if (keystorePropertiesFile.exists()) {
    keystoreProperties.load(new FileInputStream(keystorePropertiesFile))
}

android {
    signingConfigs {
        release {
            keyAlias keystoreProperties['keyAlias']
            keyPassword keystoreProperties['keyPassword']
            storeFile keystoreProperties['storeFile'] ? file(keystoreProperties['storeFile']) : null
            storePassword keystoreProperties['storePassword']
        }
    }
    buildTypes {
        release {
            signingConfig signingConfigs.release
            minifyEnabled false
            proguardFiles getDefaultProguardFile('proguard-android.txt'), 'proguard-rules.pro'
        }
    }
}
```

3. **Add to `.gitignore`:**
```
android/key.properties
android/app/*.jks
android/app/*.keystore
```

#### Step 3: Build Release APK/AAB

```bash
cd android
./gradlew bundleRelease  # For App Bundle (recommended for Play Store)
# OR
./gradlew assembleRelease  # For APK (for direct distribution)
```

**Outputs:**
- AAB: `android/app/build/outputs/bundle/release/app-release.aab`
- APK: `android/app/build/outputs/apk/release/app-release.apk`

#### Step 4: Google Play Console

1. **Create App**
   - Go to https://play.google.com/console
   - Create app
   - Fill in details

2. **Upload AAB**
   - Production → Create release
   - Upload `app-release.aab`
   - Fill in release notes

3. **Complete Store Listing**
   - Screenshots
   - Description
   - Icon
   - Privacy policy

---

## App Store Submission

### iOS App Store

**Timeline:** 1-3 days for review (usually 24-48 hours)

**Checklist:**
- [ ] App builds and runs without crashes
- [ ] All features work correctly
- [ ] Privacy policy URL is set
- [ ] App description and screenshots are complete
- [ ] Age rating is accurate
- [ ] TestFlight beta testing (optional but recommended)
- [ ] App Store guidelines compliance

**Submission Steps:**
1. Archive app in Xcode
2. Upload to App Store Connect
3. Complete App Store listing
4. Submit for review
5. Wait for approval
6. Release to App Store

### Google Play Store

**Timeline:** Usually approved within hours (can take up to 7 days)

**Checklist:**
- [ ] App builds and runs without crashes
- [ ] All features work correctly
- [ ] Privacy policy URL is set
- [ ] Store listing is complete
- [ ] Content rating questionnaire completed
- [ ] Target audience and content guidelines compliance

**Submission Steps:**
1. Build release AAB
2. Upload to Play Console
3. Complete store listing
4. Submit for review
5. Wait for approval
6. Release to Play Store

---

## Environment Variables for Mobile

### Handling Environment Variables

Capacitor apps run in a native container, so environment variables need special handling.

#### Option 1: Build-Time Injection (Recommended)

1. **Create `src/utils/mobile-config.ts`:**
```typescript
// Mobile-specific configuration
export const mobileConfig = {
  clerkPublishableKey: import.meta.env.PUBLIC_CLERK_PUBLISHABLE_KEY || '',
  apiUrl: import.meta.env.PUBLIC_API_URL || 'https://your-production-url.com',
  // Add other public variables
};
```

2. **Use in Components:**
```typescript
import { mobileConfig } from '@/utils/mobile-config';

// Use mobileConfig.clerkPublishableKey instead of import.meta.env
```

#### Option 2: Capacitor Preferences Plugin

1. **Install Plugin:**
```bash
npm install @capacitor/preferences
```

2. **Set Values at Build Time:**
```typescript
import { Preferences } from '@capacitor/preferences';

// Set during app initialization
await Preferences.set({
  key: 'clerkKey',
  value: import.meta.env.PUBLIC_CLERK_PUBLISHABLE_KEY || ''
});
```

#### Option 3: Native Configuration Files

**iOS - Info.plist:**
```xml
<key>CLERK_PUBLISHABLE_KEY</key>
<string>pk_live_...</string>
```

**Android - strings.xml:**
```xml
<string name="clerk_publishable_key">pk_live_...</string>
```

**Access in JavaScript:**
```typescript
import { Capacitor } from '@capacitor/core';

if (Capacitor.isNativePlatform()) {
  // Read from native config
  const config = await Capacitor.getPlatform() === 'ios' 
    ? // Read from Info.plist
    : // Read from strings.xml
}
```

### Recommended Approach

For Harvous, use **Option 1 (Build-Time Injection)** because:
- Astro already handles environment variables
- No additional plugins needed
- Works consistently across web and native
- Easy to maintain

**Update `.env` for production:**
```env
PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_...  # Production key
CLERK_SECRET_KEY=sk_live_...  # Server-side only
ASTRO_DB_REMOTE_URL=libsql://...  # Production database
ASTRO_DB_APP_TOKEN=...  # Production token
```

---

## Common Issues & Troubleshooting

### iOS Issues

#### "No signing certificate found"
- **Solution:** Select your team in Xcode → Signing & Capabilities
- Ensure Apple Developer account is added to Xcode (Xcode → Settings → Accounts)

#### "Provisioning profile doesn't match"
- **Solution:** Clean build folder (Product → Clean Build Folder)
- Delete derived data: `rm -rf ~/Library/Developer/Xcode/DerivedData`

#### "CocoaPods not found"
- **Solution:** `sudo gem install cocoapods`
- Update: `sudo gem update cocoapods`

#### Build fails with "Command PhaseScriptExecution failed"
- **Solution:** 
  ```bash
  cd ios/App
  pod deintegrate
  pod install
  ```

#### App crashes on launch
- **Solution:** Check Xcode console for errors
- Verify all environment variables are set
- Check Info.plist for missing permissions

### Android Issues

#### "SDK location not found"
- **Solution:** Set `ANDROID_HOME` environment variable
- Verify Android Studio SDK location

#### "Gradle sync failed"
- **Solution:** 
  ```bash
  cd android
  ./gradlew clean
  ```
- Update Gradle wrapper if needed

#### "Keystore file not found"
- **Solution:** Verify `key.properties` path is correct
- Use absolute path if relative path doesn't work

#### Build fails with "Execution failed for task ':app:mergeReleaseResources'"
- **Solution:** 
  ```bash
  cd android
  ./gradlew clean
  ./gradlew assembleRelease
  ```

#### App crashes on launch
- **Solution:** Check Logcat in Android Studio
- Verify all permissions in AndroidManifest.xml
- Check environment variables

### General Issues

#### "Capacitor sync failed"
- **Solution:** 
  ```bash
  npm run build
  npx cap sync
  ```
- Ensure `dist/` directory exists and has content

#### "Plugin not found"
- **Solution:** 
  ```bash
  npm install @capacitor/[plugin-name]
  npx cap sync
  ```

#### Environment variables not working
- **Solution:** Use build-time injection (see Environment Variables section)
- Verify variables are prefixed with `PUBLIC_` for client-side access

#### CORS errors in native app
- **Solution:** Native apps don't have CORS restrictions
- If you see CORS errors, check your API server configuration
- Ensure API allows requests from your app's origin

---

## Maintenance & Updates

### Updating Capacitor

```bash
npm update @capacitor/core @capacitor/cli @capacitor/ios @capacitor/android
npx cap sync
```

### Updating Dependencies

**iOS:**
```bash
cd ios/App
pod update
cd ../..
```

**Android:**
- Update in `android/app/build.gradle`
- Sync Gradle in Android Studio

### Version Management

**iOS:**
- Update in Xcode: General → Version and Build
- Or in `ios/App/App.xcodeproj/project.pbxproj`

**Android:**
- Update in `android/app/build.gradle`: `versionCode` and `versionName`

**Keep in sync:**
- `package.json` version
- iOS version
- Android version
- App Store listings

### Deployment Workflow

1. **Update Version:**
   ```bash
   npm run version:bump  # Or manually update package.json
   ```

2. **Build Web App:**
   ```bash
   npm run build
   ```

3. **Sync Capacitor:**
   ```bash
   npx cap sync
   ```

4. **Update Native Versions:**
   - iOS: Xcode → General → Version
   - Android: `build.gradle` → `versionCode` and `versionName`

5. **Build Native Apps:**
   - iOS: Archive in Xcode
   - Android: `./gradlew bundleRelease`

6. **Submit to Stores:**
   - iOS: Upload via Xcode or App Store Connect
   - Android: Upload AAB to Play Console

### Testing Checklist

Before each release:
- [ ] Test on iOS device (not just simulator)
- [ ] Test on Android device (not just emulator)
- [ ] Test all authentication flows
- [ ] Test offline functionality
- [ ] Test push notifications (if implemented)
- [ ] Test on different screen sizes
- [ ] Test on different OS versions (iOS 15+, Android 8+)
- [ ] Verify environment variables are correct
- [ ] Check app icons and splash screens
- [ ] Test app store metadata

---

## Additional Resources

### Official Documentation
- **Capacitor:** https://capacitorjs.com/docs
- **iOS Development:** https://developer.apple.com/documentation/
- **Android Development:** https://developer.android.com/docs

### Community Resources
- **Capacitor Discord:** https://discord.gg/capacitor
- **Stack Overflow:** Tag `capacitor` or `ionic-capacitor`

### Harvous-Specific Notes
- Current version: `0.121.2`
- Build output: `dist/`
- App ID: `com.harvous.app` (change if needed)
- Uses Clerk for authentication
- Uses Astro DB (Turso) for database
- Deployed on Netlify (web version)

---

## Quick Reference Commands

```bash
# Install Capacitor
npm install @capacitor/core @capacitor/cli @capacitor/ios @capacitor/android
npx cap init

# Add platforms
npx cap add ios
npx cap add android

# Sync after web build
npm run build
npx cap sync

# Open in native IDEs
npx cap open ios
npx cap open android

# iOS CocoaPods
cd ios/App && pod install && cd ../..

# Android build
cd android && ./gradlew assembleDebug
cd android && ./gradlew bundleRelease

# Update Capacitor
npm update @capacitor/core @capacitor/cli @capacitor/ios @capacitor/android
npx cap sync
```

---

**Last Updated:** January 2025  
**Capacitor Version:** Latest (check https://capacitorjs.com/docs for current version)  
**Status:** Ready for implementation


