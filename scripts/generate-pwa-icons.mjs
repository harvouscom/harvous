#!/usr/bin/env node

/**
 * Generate the PWA and notification icon set from the one source mark.
 *
 * Four things need different artwork and the manifest had only one of them:
 *
 *   icon-192 / icon-512 (`purpose: any`)  — the app icon as drawn, full bleed.
 *   icon-*-maskable (`purpose: maskable`) — Android crops every icon to its own shape
 *       (circle, squircle, teardrop), so a full-bleed mark loses its corners. Maskable art
 *       keeps everything meaningful inside the middle 80%, and the platform is free to cut
 *       the rest. Here that means the glyph scaled down onto the same gradient.
 *   badge-96 — Android's status bar draws the badge as a *silhouette*: it keeps the alpha
 *       channel and throws the colours away. A full-colour icon there renders as a grey
 *       blob, so this is the glyph's own shape, white on transparent.
 *
 * Run after changing public/images/harvous-2-icon.png:
 *
 *   node scripts/generate-pwa-icons.mjs
 */

import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = join(root, 'public/images/harvous-2-icon.png');
const OUT_DIR = join(root, 'public/images/icons');

/** Sampled from the source's own corners, so the padded art matches the mark it came from. */
const GRADIENT_TOP = '#00A7FF';
const GRADIENT_BOTTOM = '#016EFF';

/**
 * The glyph is near-white and the field is saturated blue, so luminance separates them
 * cleanly. Anything above this is glyph.
 */
const GLYPH_LUMA_THRESHOLD = 170;

/** Share of the canvas the mark occupies in a maskable icon — the rest is Android's to crop. */
const MASKABLE_SCALE = 0.78;

function gradientSvg(size) {
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="0.35" y2="1">
          <stop offset="0" stop-color="${GRADIENT_TOP}"/>
          <stop offset="1" stop-color="${GRADIENT_BOTTOM}"/>
        </linearGradient>
      </defs>
      <rect width="${size}" height="${size}" fill="url(#g)"/>
    </svg>`,
  );
}

/**
 * The mark as white-on-transparent at `size`.
 *
 * Built by thresholding luminance into an alpha channel rather than by tracing: the source
 * is a raster, and its glyph is the only light thing in it.
 */
async function glyphAlpha(size) {
  const mask = await sharp(SOURCE)
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .removeAlpha()
    .greyscale()
    .threshold(GLYPH_LUMA_THRESHOLD)
    .toColourspace('b-w')
    .raw()
    .toBuffer();

  return sharp({
    create: { width: size, height: size, channels: 3, background: '#FFFFFF' },
  })
    .joinChannel(mask, { raw: { width: size, height: size, channels: 1 } })
    .png()
    .toBuffer();
}

async function writeAnyIcon(size, name) {
  await sharp(SOURCE).resize(size, size, { fit: 'cover' }).png().toFile(join(OUT_DIR, name));
  console.log(`[icons] ${name} (${size}×${size}, any)`);
}

async function writeMaskableIcon(size, name) {
  const inner = Math.round(size * MASKABLE_SCALE);
  const offset = Math.round((size - inner) / 2);
  const glyph = await glyphAlpha(inner);

  await sharp(gradientSvg(size))
    .composite([{ input: glyph, top: offset, left: offset }])
    .png()
    .toFile(join(OUT_DIR, name));
  console.log(`[icons] ${name} (${size}×${size}, maskable, mark at ${Math.round(MASKABLE_SCALE * 100)}%)`);
}

/**
 * The status-bar badge.
 *
 * Trimmed to the glyph and re-padded, because the app icon carries a lot of blue field the
 * silhouette does not need: dropped in as-is the mark would fill barely half of an already
 * 24-pixel-tall status bar slot. Rendered at 4× and downsampled so the diagonal stays smooth
 * at the size Android actually draws it.
 */
async function writeBadge(size, name) {
  const supersampled = size * 4;
  const glyph = await glyphAlpha(supersampled);
  const trimmed = await sharp(glyph).trim({ threshold: 1 }).png().toBuffer();
  const margin = Math.round(supersampled * 0.06);

  // Two pipelines, not one chain: sharp keeps a single resize per pipeline, so a second
  // `.resize()` would silently replace the first rather than run after it.
  const padded = await sharp(trimmed)
    .resize(supersampled - margin * 2, supersampled - margin * 2, {
      fit: 'contain',
      background: { r: 255, g: 255, b: 255, alpha: 0 },
    })
    .extend({
      top: margin,
      bottom: margin,
      left: margin,
      right: margin,
      background: { r: 255, g: 255, b: 255, alpha: 0 },
    })
    .png()
    .toBuffer();

  await sharp(padded).resize(size, size).png().toFile(join(OUT_DIR, name));
  console.log(`[icons] ${name} (${size}×${size}, monochrome silhouette)`);
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  await writeAnyIcon(192, 'icon-192.png');
  await writeAnyIcon(512, 'icon-512.png');
  await writeMaskableIcon(192, 'icon-192-maskable.png');
  await writeMaskableIcon(512, 'icon-512-maskable.png');
  await writeBadge(96, 'badge-96.png');
}

main().catch((error) => {
  console.error('[icons] failed:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
