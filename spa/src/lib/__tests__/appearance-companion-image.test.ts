/**
 * The picture a surface borrows from the reader's appearance.
 *
 * Three branches, and the one worth guarding is the middle: a reader who chose
 * a colour has never seen an image preset, so the pairing has to come from the
 * catalogue rather than from anything they stored. Per mode, because the light
 * and dark halves are different files.
 */
import { afterEach, describe, expect, it } from 'vitest';

import {
  appearanceCompanionImage,
  appearanceCompanionPresetId,
} from '../appearance-companion-image';
import {
  IMAGE_PRESETS_DARK,
  IMAGE_PRESETS_LIGHT,
  PROTO_BG_DARK_KEY,
  PROTO_BG_LIGHT_KEY,
} from '../prototype-background';

function chooseLight(bg: unknown): void {
  localStorage.setItem(PROTO_BG_LIGHT_KEY, JSON.stringify(bg));
}

function chooseDark(bg: unknown): void {
  localStorage.setItem(PROTO_BG_DARK_KEY, JSON.stringify(bg));
}

afterEach(() => {
  localStorage.clear();
});

describe('appearanceCompanionPresetId', () => {
  it('uses the very image the reader chose', () => {
    chooseLight({ kind: 'image-preset', presetId: 'meadow' });
    expect(appearanceCompanionPresetId('light')).toBe('meadow');

    chooseDark({ kind: 'image-preset', presetId: 'flare' });
    expect(appearanceCompanionPresetId('dark')).toBe('flare');
  });

  it('pairs a chosen colour with the catalogue image beside it, per mode', () => {
    chooseLight({ kind: 'color', value: '#c9e3b8', presetId: 'mint' });
    expect(appearanceCompanionPresetId('light')).toBe('meadow');

    chooseDark({ kind: 'color', value: '#1e2e22', presetId: 'mint' });
    expect(appearanceCompanionPresetId('dark')).toBe('depths');
  });

  it('falls back to the first image of the mode for Paper and for no choice', () => {
    expect(appearanceCompanionPresetId('light')).toBe(IMAGE_PRESETS_LIGHT[0].id);
    expect(appearanceCompanionPresetId('dark')).toBe(IMAGE_PRESETS_DARK[0].id);

    // Paper carries no preset pairing of its own.
    chooseLight({ kind: 'color', value: '#fcfbf7', presetId: 'paper' });
    expect(appearanceCompanionPresetId('light')).toBe(IMAGE_PRESETS_LIGHT[0].id);
  });

  it('reads the mode it was asked about, not the one that happens to be active', () => {
    chooseLight({ kind: 'image-preset', presetId: 'dawn' });
    chooseDark({ kind: 'image-preset', presetId: 'twilight' });
    expect(appearanceCompanionPresetId('light')).toBe('dawn');
    expect(appearanceCompanionPresetId('dark')).toBe('twilight');
  });
});

describe('appearanceCompanionImage', () => {
  it('resolves to a file in the appearance catalogue, with a colour to hold the space', () => {
    chooseLight({ kind: 'color', value: '#c2dcf8', presetId: 'sky' });
    const companion = appearanceCompanionImage('light');
    expect(companion?.presetId).toBe('breeze');
    expect(companion?.url).toMatch(/\.webp$/);
    expect(companion?.tint).toMatch(/^#/);
  });

  it('falls back to the neutral image when the stored preset has left the catalogue', () => {
    /* The background parser drops an image preset it cannot find
       (`parseProtoBg`), so a retired id reads here as "chose nothing" and takes
       the same path Paper does. Worth pinning: the alternative — a stored id
       reaching the DOM as a broken url — is a blank strip nobody can explain. */
    chooseLight({ kind: 'image-preset', presetId: 'a-preset-that-was-retired' });
    expect(appearanceCompanionImage('light')?.presetId).toBe(IMAGE_PRESETS_LIGHT[0].id);
  });
});
