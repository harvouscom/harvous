import { describe, expect, it } from 'vitest';
import {
  APPEARANCE_COLOR_TO_DARK_IMAGE_ID,
  APPEARANCE_COLOR_TO_LIGHT_IMAGE_ID,
  spaceCoverFromThreadColor,
} from '../space-cover';

describe('spaceCoverFromThreadColor', () => {
  it('maps blue to breeze / cinder', () => {
    const cover = spaceCoverFromThreadColor('blue');
    expect(cover.light).toEqual({ kind: 'image-preset', presetId: 'breeze' });
    expect(cover.dark).toEqual({ kind: 'image-preset', presetId: 'cinder' });
  });

  it('maps purple to aurora / ember', () => {
    const cover = spaceCoverFromThreadColor('purple');
    expect(cover.light).toEqual({ kind: 'image-preset', presetId: 'aurora' });
    expect(cover.dark).toEqual({ kind: 'image-preset', presetId: 'ember' });
  });

  it('maps orange to drift / caldera', () => {
    const cover = spaceCoverFromThreadColor('orange');
    expect(cover.light).toEqual({ kind: 'image-preset', presetId: 'drift' });
    expect(cover.dark).toEqual({ kind: 'image-preset', presetId: 'caldera' });
  });

  it('maps green to meadow / depths', () => {
    const cover = spaceCoverFromThreadColor('green');
    expect(cover.light).toEqual({ kind: 'image-preset', presetId: 'meadow' });
    expect(cover.dark).toEqual({ kind: 'image-preset', presetId: 'depths' });
  });

  it('maps pink to dawn / flare', () => {
    const cover = spaceCoverFromThreadColor('pink');
    expect(cover.light).toEqual({ kind: 'image-preset', presetId: 'dawn' });
    expect(cover.dark).toEqual({ kind: 'image-preset', presetId: 'flare' });
  });

  it('keeps appearance color maps aligned with picker colors', () => {
    expect(APPEARANCE_COLOR_TO_LIGHT_IMAGE_ID.peach).toBe('drift');
    expect(APPEARANCE_COLOR_TO_DARK_IMAGE_ID.peach).toBe('caldera');
    expect(APPEARANCE_COLOR_TO_LIGHT_IMAGE_ID.mint).toBe('meadow');
    expect(APPEARANCE_COLOR_TO_DARK_IMAGE_ID.mint).toBe('depths');
    expect(APPEARANCE_COLOR_TO_LIGHT_IMAGE_ID.pink).toBe('dawn');
    expect(APPEARANCE_COLOR_TO_DARK_IMAGE_ID.pink).toBe('flare');
  });
});
