import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import {
  prepareInlineNoteImageJpeg,
  NOTE_INLINE_IMAGE_MAX_OUTPUT_BYTES,
  NOTE_INLINE_IMAGE_MAX_WIDTH,
  isAllowedInlineImageMime,
} from '../../../server/utils/note-inline-image-upload';

describe('note-inline-image-upload', () => {
  it('isAllowedInlineImageMime accepts common types', () => {
    expect(isAllowedInlineImageMime('image/jpeg')).toBe(true);
    expect(isAllowedInlineImageMime('image/png')).toBe(true);
    expect(isAllowedInlineImageMime('text/plain')).toBe(false);
  });

  it('prepareInlineNoteImageJpeg downscales wide images under output cap', async () => {
    const wide = await sharp({
      create: { width: 1200, height: 600, channels: 3, background: { r: 10, g: 20, b: 30 } },
    })
      .jpeg()
      .toBuffer();

    const out = await prepareInlineNoteImageJpeg(wide);
    const meta = await sharp(out).metadata();

    expect(out.length).toBeLessThanOrEqual(NOTE_INLINE_IMAGE_MAX_OUTPUT_BYTES);
    expect(meta.width).toBeLessThanOrEqual(NOTE_INLINE_IMAGE_MAX_WIDTH);
    expect(meta.format).toBe('jpeg');
  });
});
