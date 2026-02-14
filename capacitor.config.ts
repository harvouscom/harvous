import type { CapacitorConfig } from '@capacitor/cli';

// SPA build (dist-spa/) is the Capacitor web dir.
// API calls from the SPA go to https://app.harvous.com/api/* (Netlify functions).
const config: CapacitorConfig = {
  appId: 'com.harvous.app',
  appName: 'Harvous',
  webDir: 'dist-spa',
  server: {
    androidScheme: 'https',
    backgroundColor: '#F7F7F6',
  },
  ios: {
    backgroundColor: '#F7F7F6',
    contentInset: 'automatic',
    allowsLinkPreview: false,
    scrollEnabled: true,
  },
  android: {
    backgroundColor: '#F7F7F6',
    allowMixedContent: false,
    captureInput: true,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1000,
      launchAutoHide: true,
      backgroundColor: '#F7F7F6',
      androidSplashResourceName: 'splash',
      showSpinner: false,
    },
    StatusBar: {
      style: 'default',
      backgroundColor: '#F7F7F6',
    },
  },
};

export default config;
