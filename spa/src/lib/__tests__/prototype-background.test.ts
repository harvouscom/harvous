import { readFileSync } from 'fs';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../appearance-image-presets-data', () => ({
  default: {
    basePath: '/images/prototype-backgrounds',
    presets: [
      {
        id: 'hills',
        label: 'Hills',
        file: 'hills.webp',
        mode: 'light',
        tintLight: '#c8d4e8',
        tintDark: '#1a2430',
      },
      {
        id: 'night-sky',
        label: 'Night Sky',
        file: 'night-sky.webp',
        mode: 'dark',
        tintDark: '#0a1525',
      },
    ],
  },
}));

import {
  applyColorSchemePreference,
  imagePresetApplyValue,
  imagePresetById,
  imagePresetCatalogTint,
  imagePresetUrl,
  isDarkAppearance,
  isImagePresetSelected,
  IMAGE_PRESETS_LIGHT,
  IMAGE_PRESETS_DARK,
  PROTO_BG_KEY,
  PROTO_BG_LIGHT_KEY,
  PROTO_BG_DARK_KEY,
  PROTO_COLOR_SCHEME_KEY,
  readBackgroundForMode,
  readActiveBackground,
  readColorSchemePreference,
  writeBackgroundForMode,
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

describe('prototype image preset backgrounds', () => {
  const hills = imagePresetById('hills')!;
  const nightSky = imagePresetById('night-sky')!;

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

  it('IMAGE_PRESETS_LIGHT / IMAGE_PRESETS_DARK filter by mode', () => {
    expect(IMAGE_PRESETS_LIGHT.map((p) => p.id)).toEqual(['hills']);
    expect(IMAGE_PRESETS_DARK.map((p) => p.id)).toEqual(['night-sky']);
  });

  it('imagePresetUrl uses the preset intrinsic mode', () => {
    expect(imagePresetUrl(hills)).toBe('/images/prototype-backgrounds/light/hills.webp');
    expect(imagePresetUrl(nightSky)).toBe('/images/prototype-backgrounds/dark/night-sky.webp');
  });

  it('imagePresetCatalogTint returns the tint for the preset mode', () => {
    expect(imagePresetCatalogTint(hills)).toBe('#c8d4e8');
    expect(imagePresetCatalogTint(nightSky)).toBe('#0a1525');
  });

  it('isImagePresetSelected matches stored preset id', () => {
    const bg = imagePresetApplyValue(hills);
    expect(isImagePresetSelected(hills, bg)).toBe(true);
    expect(isImagePresetSelected(nightSky, bg)).toBe(false);
  });
});

describe('per-mode background storage', () => {
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

  it('writeBackgroundForMode and readBackgroundForMode round-trip', () => {
    const hills = imagePresetById('hills')!;
    const bg = imagePresetApplyValue(hills);
    writeBackgroundForMode('light', bg);
    expect(readBackgroundForMode('light')).toEqual(bg);
    expect(readBackgroundForMode('dark')).toBeNull();
  });

  it('uses separate localStorage keys per mode', () => {
    writeBackgroundForMode('light', { kind: 'color', value: '#c2dcf8' });
    writeBackgroundForMode('dark', { kind: 'color', value: '#152536' });
    expect(localStorage.getItem(PROTO_BG_LIGHT_KEY)).toContain('#c2dcf8');
    expect(localStorage.getItem(PROTO_BG_DARK_KEY)).toContain('#152536');
  });

  it('readActiveBackground returns the correct mode bg', () => {
    // Use hex values outside `LEGACY_COLOR_HEX_TO_PRESET_ID` so this only exercises mode
    // selection, not the separate legacy-hex → preset-id normalization on read.
    writeBackgroundForMode('light', { kind: 'color', value: '#123456' });
    writeBackgroundForMode('dark', { kind: 'color', value: '#654321' });

    applyColorSchemePreference('light');
    expect(readActiveBackground()).toEqual({ kind: 'color', value: '#123456' });

    applyColorSchemePreference('dark');
    expect(readActiveBackground()).toEqual({ kind: 'color', value: '#654321' });
  });

  it('migrates legacy single-key color to per-mode on read', () => {
    localStorage.setItem(PROTO_BG_KEY, JSON.stringify({ kind: 'color', value: '#c2dcf8' }));
    const bg = readBackgroundForMode('light');
    expect(bg).toEqual({ kind: 'color', value: '#c2dcf8' });
  });

  it('writeBackgroundForMode(null) clears the key', () => {
    writeBackgroundForMode('light', { kind: 'color', value: '#c2dcf8' });
    writeBackgroundForMode('light', null);
    expect(localStorage.getItem(PROTO_BG_LIGHT_KEY)).toBeNull();
    expect(readBackgroundForMode('light')).toBeNull();
  });

  it('Paper (null light) does not fall back to legacy single-key cream', () => {
    localStorage.setItem(PROTO_BG_KEY, JSON.stringify({ kind: 'color', value: '#f6ecd6' }));
    writeBackgroundForMode('dark', imagePresetApplyValue(imagePresetById('night-sky')!));
    writeBackgroundForMode('light', null);

    expect(localStorage.getItem(PROTO_BG_KEY)).toBeNull();
    expect(readBackgroundForMode('light')).toBeNull();
    applyColorSchemePreference('light');
    expect(readActiveBackground()).toBeNull();
  });
});

describe('sync-appearance-image-presets output', () => {
  it('writes a loadable catalog global assignment', () => {
    const catalogPath = join(process.cwd(), 'public/scripts/prototype-image-presets-catalog.js');
    const source = readFileSync(catalogPath, 'utf8');
    expect(source).toContain('window.__HARVOUS_APPEARANCE_IMAGE_PRESETS');
    const payload = source.replace(/^[\s\S]*=\s*/, '').replace(/;\s*$/, '');
    const catalog = JSON.parse(payload);
    expect(catalog.basePath).toBe('/images/prototype-backgrounds');
    expect(Array.isArray(catalog.presets)).toBe(true);
  });
});
