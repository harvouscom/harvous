/**
 * Vitest setup file
 * Runs before all tests to configure the test environment
 */

import { expect, afterEach, vi } from 'vitest';
import '@testing-library/jest-dom';
import 'fake-indexeddb/auto';

// Mock window.navigator.onLine
Object.defineProperty(window, 'navigator', {
  writable: true,
  value: {
    ...window.navigator,
    // navigator props live on the prototype as getters, so the spread above drops them;
    // restore the few that consumers (and react-dom at import time) read.
    userAgent: window.navigator.userAgent || 'jsdom',
    platform: window.navigator.platform || '',
    onLine: true,
  },
});

// Mock window.posthog for PostHog feature flags
Object.defineProperty(window, 'posthog', {
  writable: true,
  value: {
    isFeatureEnabled: vi.fn(() => false),
    getFeatureFlag: vi.fn(() => undefined),
    capture: vi.fn(),
    captureException: vi.fn(),
    identify: vi.fn(),
    reset: vi.fn(),
  },
});

// jsdom doesn't implement matchMedia; stub a non-matching MediaQueryList so code that
// probes display-mode / color-scheme (e.g. PWA / reduced-motion detection) doesn't throw.
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString();
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});

// Mock sessionStorage
const sessionStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString();
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();

Object.defineProperty(window, 'sessionStorage', {
  value: sessionStorageMock,
});

// Clean up after each test
afterEach(() => {
  vi.clearAllMocks();
  localStorageMock.clear();
  sessionStorageMock.clear();
});

