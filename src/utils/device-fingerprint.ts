/**
 * Device Fingerprinting Utility
 *
 * Generates a stable, privacy-respecting device identifier for auth continuity.
 * Used to prevent "Detect new device" warnings in PWA/mobile contexts where
 * Clerk's cookie-based session doesn't persist reliably.
 *
 * Privacy: Device ID is app-specific, not cross-site tracking
 */

import { getDBConnection, type DBConfig } from './indexeddb-pool';
import { isPWA } from './content-list-helpers';

export interface DeviceFingerprint {
  deviceId: string;
  createdAt: number;
  lastSeen: number;
  isPWA: boolean;
  userAgent: string;
  screenResolution: string;
  timezone: string;
  language: string;
  version: number; // Schema version for future migrations
}

const STORAGE_KEY = 'harvous-device-fingerprint';
const DB_NAME = 'harvous-device-auth';
const DB_VERSION = 1;
const FINGERPRINT_STORE = 'deviceFingerprint';
const isDev = import.meta.env.DEV;

const DB_CONFIG: DBConfig = {
  name: DB_NAME,
  version: DB_VERSION,
  onUpgrade: (db: IDBDatabase) => {
    if (!db.objectStoreNames.contains(FINGERPRINT_STORE)) {
      db.createObjectStore(FINGERPRINT_STORE, { keyPath: 'id' });
    }
  }
};

// Use centralized PWA detection from content-list-helpers
function isPWAMode(): boolean {
  return isPWA();
}

/**
 * Generate canvas fingerprint (stable, privacy-friendly)
 */
async function getCanvasFingerprint(): Promise<string> {
  try {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return 'no-canvas';

    canvas.width = 200;
    canvas.height = 50;

    // Draw text with various styles
    ctx.textBaseline = 'top';
    ctx.font = '14px Arial';
    ctx.fillStyle = '#f60';
    ctx.fillRect(125, 1, 62, 20);
    ctx.fillStyle = '#069';
    ctx.fillText('Harvous Auth', 2, 15);
    ctx.fillStyle = 'rgba(102, 204, 0, 0.7)';
    ctx.fillText('Device ID', 4, 17);

    // Get image data
    const dataURL = canvas.toDataURL();

    // Hash the canvas data
    return hashString(dataURL);
  } catch (e) {
    return 'canvas-error';
  }
}

/**
 * Generate WebGL fingerprint
 */
async function getWebGLFingerprint(): Promise<string> {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (!gl) return 'no-webgl';

    const debugInfo = (gl as any).getExtension('WEBGL_debug_renderer_info');
    if (!debugInfo) return 'no-debug-info';

    const vendor = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL);
    const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);

    return hashString(`${vendor}|${renderer}`);
  } catch (e) {
    return 'webgl-error';
  }
}

/**
 * Generate audio context fingerprint (optimized with reduced timeout)
 */
async function getAudioFingerprint(): Promise<string> {
  try {
    const AudioContext = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!AudioContext) return 'no-audio';

    const context = new AudioContext();
    const oscillator = context.createOscillator();
    const analyser = context.createAnalyser();
    const gainNode = context.createGain();
    const scriptProcessor = context.createScriptProcessor(4096, 1, 1);

    gainNode.gain.value = 0; // Mute
    oscillator.connect(analyser);
    analyser.connect(scriptProcessor);
    scriptProcessor.connect(gainNode);
    gainNode.connect(context.destination);

    oscillator.start(0);

    return new Promise((resolve) => {
      scriptProcessor.onaudioprocess = function(event) {
        const output = event.outputBuffer.getChannelData(0);
        const hash = hashString(Array.from(output.slice(0, 30)).join(','));

        oscillator.stop();
        scriptProcessor.disconnect();
        context.close();

        resolve(hash);
      };

      // Reduced timeout from 1000ms to 300ms for faster fingerprinting
      setTimeout(() => {
        try {
          oscillator.stop();
          context.close();
        } catch (e) {}
        resolve('audio-timeout');
      }, 300);
    });
  } catch (e) {
    return 'audio-error';
  }
}

/**
 * Simple hash function (FNV-1a)
 */
function hashString(str: string): string {
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return (hash >>> 0).toString(36);
}

/**
 * Screen size bucket: stable across orientation, zoom, resize (reduces fingerprint volatility)
 */
function getScreenBucket(): string {
  if (typeof screen === 'undefined') return 'unknown';
  const min = Math.min(screen.width, screen.height);
  return min < 768 ? 'mobile' : 'desktop';
}

/**
 * Generate complete device fingerprint (stabilized: no audio/WebGL/PWA in hash, screen bucketed)
 */
async function generateDeviceFingerprint(_skipAudio?: boolean): Promise<string> {
  const canvasFingerprint = await getCanvasFingerprint();

  const components = [
    navigator.userAgent,
    getScreenBucket(),
    navigator.language,
    Intl.DateTimeFormat().resolvedOptions().timeZone,
    navigator.hardwareConcurrency?.toString() || 'unknown',
    canvasFingerprint,
    typeof Storage !== 'undefined' ? 'storage' : 'no-storage',
    navigator.platform,
  ];

  const combined = components.join('|');

  // Use SHA-256 if available (more secure), otherwise use simple hash
  try {
    const encoder = new TextEncoder();
    const data = encoder.encode(combined);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  } catch (e) {
    // Fallback to simple hash
    return hashString(combined);
  }
}

/**
 * Open IndexedDB connection (uses connection pool)
 */
function openDB(): Promise<IDBDatabase> {
  return getDBConnection(DB_CONFIG);
}

/**
 * Store fingerprint in IndexedDB
 */
async function storeInIndexedDB(fingerprint: DeviceFingerprint): Promise<void> {
  try {
    const db = await openDB();
    const transaction = db.transaction([FINGERPRINT_STORE], 'readwrite');
    const store = transaction.objectStore(FINGERPRINT_STORE);

    await new Promise<void>((resolve, reject) => {
      const request = store.put({ id: 'current', ...fingerprint });
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.warn('[DeviceFingerprint] Failed to store in IndexedDB:', error);
  }
}

/**
 * Retrieve fingerprint from IndexedDB
 */
async function getFromIndexedDB(): Promise<DeviceFingerprint | null> {
  try {
    const db = await openDB();
    const transaction = db.transaction([FINGERPRINT_STORE], 'readonly');
    const store = transaction.objectStore(FINGERPRINT_STORE);

    const fingerprint = await new Promise<DeviceFingerprint | null>((resolve, reject) => {
      const request = store.get('current');
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });

    return fingerprint;
  } catch (error) {
    console.warn('[DeviceFingerprint] Failed to retrieve from IndexedDB:', error);
    return null;
  }
}

/**
 * Store fingerprint in localStorage (fallback)
 */
function storeInLocalStorage(fingerprint: DeviceFingerprint): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(fingerprint));
  } catch (error) {
    console.warn('[DeviceFingerprint] Failed to store in localStorage:', error);
  }
}

/**
 * Retrieve fingerprint from localStorage
 */
function getFromLocalStorage(): DeviceFingerprint | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return null;
    return JSON.parse(stored) as DeviceFingerprint;
  } catch (error) {
    console.warn('[DeviceFingerprint] Failed to retrieve from localStorage:', error);
    return null;
  }
}

/**
 * Get or create device fingerprint
 * Returns existing fingerprint if available, otherwise generates new one
 */
export async function getOrCreateDeviceId(skipAudio: boolean = false): Promise<string> {
  try {
    // Try IndexedDB first (most reliable)
    let fingerprint = await getFromIndexedDB();

    // Fallback to localStorage
    if (!fingerprint) {
      fingerprint = getFromLocalStorage();
    }

    // If we have a fingerprint, update lastSeen and return (skip expensive checks)
    if (fingerprint) {
      fingerprint.lastSeen = Date.now();
      fingerprint.isPWA = isPWAMode();

      // Store updated fingerprint
      await storeInIndexedDB(fingerprint);
      storeInLocalStorage(fingerprint);

      if (isDev) console.log('[DeviceFingerprint] Existing device ID found:', fingerprint.deviceId.substring(0, 8) + '...');
      return fingerprint.deviceId;
    }

    // Generate new fingerprint (for first-time visitors, run all checks)
    if (isDev) console.log('[DeviceFingerprint] Generating new device ID...');
    const deviceId = await generateDeviceFingerprint(skipAudio);

    const newFingerprint: DeviceFingerprint = {
      deviceId,
      createdAt: Date.now(),
      lastSeen: Date.now(),
      isPWA: isPWAMode(),
      userAgent: navigator.userAgent,
      screenResolution: getScreenBucket(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      language: navigator.language,
      version: 1,
    };

    // Store in multiple locations for redundancy
    await storeInIndexedDB(newFingerprint);
    storeInLocalStorage(newFingerprint);

    if (isDev) console.log('[DeviceFingerprint] New device ID created:', deviceId.substring(0, 8) + '...');
    return deviceId;
  } catch (error) {
    console.error('[DeviceFingerprint] Error getting/creating device ID:', error);
    // Fallback to simple hash
    return hashString(navigator.userAgent + Date.now());
  }
}

/**
 * Get existing device ID (without creating new one)
 */
export async function getDeviceId(): Promise<string | null> {
  try {
    // Try IndexedDB first
    const fingerprint = await getFromIndexedDB();
    if (fingerprint) return fingerprint.deviceId;

    // Fallback to localStorage
    const localFingerprint = getFromLocalStorage();
    if (localFingerprint) return localFingerprint.deviceId;

    return null;
  } catch (error) {
    console.error('[DeviceFingerprint] Error getting device ID:', error);
    return null;
  }
}

/**
 * Clear device fingerprint (on logout)
 */
export async function clearDeviceFingerprint(): Promise<void> {
  try {
    // Clear IndexedDB
    const db = await openDB();
    const transaction = db.transaction([FINGERPRINT_STORE], 'readwrite');
    const store = transaction.objectStore(FINGERPRINT_STORE);

    await new Promise<void>((resolve, reject) => {
      const request = store.delete('current');
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });

    // Clear localStorage
    localStorage.removeItem(STORAGE_KEY);

    console.log('[DeviceFingerprint] Device fingerprint cleared');
  } catch (error) {
    console.error('[DeviceFingerprint] Error clearing device fingerprint:', error);
  }
}

/**
 * Get device fingerprint details (for debugging/display)
 */
export async function getDeviceFingerprint(): Promise<DeviceFingerprint | null> {
  try {
    const fingerprint = await getFromIndexedDB();
    if (fingerprint) return fingerprint;

    return getFromLocalStorage();
  } catch (error) {
    console.error('[DeviceFingerprint] Error getting device fingerprint:', error);
    return null;
  }
}
