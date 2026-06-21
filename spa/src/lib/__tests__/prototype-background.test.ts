import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applyColorSchemePreference,
  isDarkAppearance,
  PROTO_COLOR_SCHEME_KEY,
  readColorSchemePreference,
  writeColorSchemePreference,
} from '../prototype-background';

describe('prototype color scheme preference', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-color-scheme');
  });

  afterEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-color-scheme');
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('defaults to system when localStorage is empty', () => {
    expect(readColorSchemePreference()).toBe('system');
  });

  it('applyColorSchemePreference(light) sets data-color-scheme on html', () => {
    applyColorSchemePreference('light');
    expect(document.documentElement.getAttribute('data-color-scheme')).toBe('light');
  });

  it('applyColorSchemePreference(system) removes data-color-scheme', () => {
    applyColorSchemePreference('light');
    applyColorSchemePreference('system');
    expect(document.documentElement.hasAttribute('data-color-scheme')).toBe(false);
  });

  it('isDarkAppearance returns false when forced light even if OS prefers dark', () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockReturnValue({
        matches: true,
        media: '(prefers-color-scheme: dark)',
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }),
    );

    applyColorSchemePreference('light');
    expect(isDarkAppearance()).toBe(false);
  });

  it('isDarkAppearance follows OS when no override is set', () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockReturnValue({
        matches: true,
        media: '(prefers-color-scheme: dark)',
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }),
    );

    expect(isDarkAppearance()).toBe(true);
  });

  it('writeColorSchemePreference persists light and applies the attribute', () => {
    writeColorSchemePreference('light');
    expect(localStorage.getItem(PROTO_COLOR_SCHEME_KEY)).toBe('light');
    expect(document.documentElement.getAttribute('data-color-scheme')).toBe('light');
  });

  it('writeColorSchemePreference(system) clears localStorage', () => {
    writeColorSchemePreference('dark');
    writeColorSchemePreference('system');
    expect(localStorage.getItem(PROTO_COLOR_SCHEME_KEY)).toBeNull();
    expect(document.documentElement.hasAttribute('data-color-scheme')).toBe(false);
  });
});
