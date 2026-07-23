import { describe, expect, it } from 'vitest';
import {
  APPEARANCE_COLOR_TO_DARK_IMAGE_ID,
  APPEARANCE_COLOR_TO_LIGHT_IMAGE_ID,
  spaceCoverFromThreadColor,
} from '../space-cover';

describe('spaceCoverFromThreadColor', () => {
  it('maps blue to space-cover variant 1 by default', () => {
    const cover = spaceCoverFromThreadColor('blue');
    expect(cover.light).toEqual({ kind: 'image-preset', presetId: 'blue-1' });
    expect(cover.dark).toEqual({ kind: 'image-preset', presetId: 'blue-1-dark' });
  });

  it('maps purple / orange / green / pink to family variant 1', () => {
    expect(spaceCoverFromThreadColor('purple').light).toEqual({
      kind: 'image-preset',
      presetId: 'purple-1',
    });
    expect(spaceCoverFromThreadColor('orange').dark).toEqual({
      kind: 'image-preset',
      presetId: 'orange-1-dark',
    });
    expect(spaceCoverFromThreadColor('green').light).toEqual({
      kind: 'image-preset',
      presetId: 'green-1',
    });
    expect(spaceCoverFromThreadColor('pink').dark).toEqual({
      kind: 'image-preset',
      presetId: 'pink-1-dark',
    });
  });

  it('selects a non-default variant within the family', () => {
    const cover = spaceCoverFromThreadColor('blue', 3);
    expect(cover.light).toEqual({ kind: 'image-preset', presetId: 'blue-3' });
    expect(cover.dark).toEqual({ kind: 'image-preset', presetId: 'blue-3-dark' });
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
