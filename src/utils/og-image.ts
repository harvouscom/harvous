/**
 * OG Image generation using satori + @resvg/resvg-wasm + satori-html.
 *
 * Production (esbuild api.cjs): WASM + fonts are inlined via --loader:.wasm=binary
 * and --loader:.ttf=binary so Netlify does not need sidecar files.
 * Dev (tsx): loads the same assets from disk under node_modules / server/assets.
 */

import type { ReactNode } from 'react';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import satori from 'satori';
import { Resvg, initWasm } from '@resvg/resvg-wasm';
import { html } from 'satori-html';

// OG image dimensions (standard for social platforms)
export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;

// Thread color hex values (pastel colors matching the app)
export const THREAD_COLORS: Record<string, string> = {
  paper: '#F3F2EC',
  blue: '#C3E4FF',
  yellow: '#F9DE78',
  green: '#C7ECBB',
  pink: '#F7CEEE',
  orange: '#FCD8A0',
  purple: '#E8C9FF',
};

export const DEFAULT_COLOR = '#C3E4FF';

/** Public-page / site tokens for share cards */
export const OG_PAPER = '#f7f6f3';
export const OG_INK = '#1a1916';
export const OG_INK_SOFT = '#5a584f';
export const OG_ACCENT = '#3869e6';
export const OG_CARD = '#ffffff';
export const OG_RULE = '#e7e4dc';

// Harvous logo SVG path
export const HARVOUS_LOGO_PATH =
  'M44.8037 63.9941H0.0078125V0H44.8037V63.9941ZM34.5645 31.168C25.6988 34.2637 18.5024 41.2949 15.3711 50.543L14.2842 53.752H34.5645V31.168ZM10.2471 37.8643C15.8921 29.2487 24.5827 23.0353 34.5645 20.4824V10.2393H10.2471V37.8643Z';

function asBytes(value: unknown): Uint8Array | null {
  if (!value) return null;
  if (value instanceof Uint8Array) return value;
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(value)) return new Uint8Array(value);
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  return null;
}

function readFirstExisting(paths: string[]): Uint8Array | null {
  for (const candidate of paths) {
    if (candidate && existsSync(candidate)) {
      return new Uint8Array(readFileSync(candidate));
    }
  }
  return null;
}

/**
 * Load resvg WASM bytes.
 * Prefer disk in dev; fall back to the esbuild-inlined binary require in prod.
 */
function loadResvgWasm(): Uint8Array {
  const fromDisk = readFirstExisting([
    typeof __dirname !== 'undefined' ? join(__dirname, 'index_bg.wasm') : '',
    join(process.cwd(), 'netlify', 'functions', 'index_bg.wasm'),
    join(process.cwd(), 'node_modules', '@resvg', 'resvg-wasm', 'index_bg.wasm'),
  ]);
  if (fromDisk) return fromDisk;

  try {
    // Literal require path — esbuild --loader:.wasm=binary inlines into api.cjs
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const embedded = asBytes(require('@resvg/resvg-wasm/index_bg.wasm'));
    if (embedded?.byteLength) return embedded;
  } catch {
    // tsx cannot require .wasm — disk path above covers local dev
  }

  throw new Error(
    'Could not load @resvg/resvg-wasm (missing index_bg.wasm on disk and not inlined in bundle)',
  );
}

/**
 * Load Reddit Sans TTF bytes (regular or bold).
 */
function loadFontBytes(kind: 'regular' | 'bold'): Uint8Array {
  const fileName = kind === 'bold' ? 'RedditSans-Bold.ttf' : 'RedditSans-Regular.ttf';
  const fromDisk = readFirstExisting([
    typeof __dirname !== 'undefined' ? join(__dirname, fileName) : '',
    join(process.cwd(), 'netlify', 'functions', fileName),
    join(process.cwd(), 'server', 'assets', 'fonts', fileName),
  ]);
  if (fromDisk) return fromDisk;

  try {
    // Literal require paths — esbuild --loader:.ttf=binary inlines into api.cjs
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const regular = asBytes(require('../../server/assets/fonts/RedditSans-Regular.ttf'));
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const bold = asBytes(require('../../server/assets/fonts/RedditSans-Bold.ttf'));
    const embedded = kind === 'bold' ? bold : regular;
    if (embedded?.byteLength) return embedded;
  } catch {
    // fall through
  }

  throw new Error(`Could not load OG font ${fileName}`);
}

async function loadFonts() {
  const fontData = loadFontBytes('regular');
  const fontBoldData = loadFontBytes('bold');

  return [
    {
      name: 'Reddit Sans',
      data: fontData,
      weight: 400 as const,
      style: 'normal' as const,
    },
    {
      name: 'Reddit Sans',
      data: fontBoldData,
      weight: 700 as const,
      style: 'normal' as const,
    },
  ];
}

let fontsCache: Awaited<ReturnType<typeof loadFonts>> | null = null;
let wasmInitPromise: Promise<void> | null = null;

async function getFonts() {
  if (!fontsCache) {
    fontsCache = await loadFonts();
  }
  return fontsCache;
}

async function ensureWasm() {
  if (!wasmInitPromise) {
    wasmInitPromise = initWasm(loadResvgWasm()).catch((err) => {
      wasmInitPromise = null;
      throw err;
    });
  }
  await wasmInitPromise;
}

/**
 * Generate an OG image from an HTML string
 * @param htmlString - HTML string to render (using inline styles)
 * @returns PNG image as Buffer
 */
export async function generateOgImage(htmlString: string): Promise<Buffer> {
  const fonts = await getFonts();
  await ensureWasm();

  const element = html(htmlString);

  const svg = await satori(element as ReactNode, {
    width: OG_WIDTH,
    height: OG_HEIGHT,
    fonts,
  });

  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: OG_WIDTH },
  });
  const pngData = resvg.render();
  const pngBuffer = Buffer.from(pngData.asPng());
  pngData.free();
  resvg.free();

  return pngBuffer;
}

/**
 * Create a Response object with the OG image
 * @param htmlString - HTML string to render
 * @returns Response with PNG image
 */
export async function createOgImageResponse(htmlString: string): Promise<Response> {
  try {
    const png = await generateOgImage(htmlString);
    return new Response(new Uint8Array(png), {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=86400, s-maxage=86400',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Error generating OG image:', message, error);
    return new Response(`Error generating image: ${message}`, {
      status: 500,
      headers: { 'Content-Type': 'text/plain' },
    });
  }
}

export function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Generate HTML for Harvous logo SVG
 */
export function logoSvg(width: number, height: number, fill: string = OG_INK, opacity: number = 1): string {
  return `<svg width="${width}" height="${height}" viewBox="0 0 45 64" fill="none" style="opacity: ${opacity}"><path d="${HARVOUS_LOGO_PATH}" fill="${fill}"/></svg>`;
}

/**
 * Generate HTML for Harvous branding footer
 */
export function brandingFooter(ink: string = OG_INK): string {
  return `
    <div style="display: flex; align-items: center; gap: 12px; margin-top: auto;">
      ${logoSvg(28, 40, ink, 0.75)}
      <span style="font-size: 22px; font-weight: 600; color: ${ink}; opacity: 0.75;">Harvous</span>
    </div>
  `;
}

/**
 * Generate fallback OG image HTML
 */
export function fallbackImageHtml(message: string): string {
  return `
    <div style="height: 100%; width: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; background: ${OG_PAPER}; font-family: 'Reddit Sans', system-ui, sans-serif;">
      <div style="display: flex; flex-direction: column; align-items: center; gap: 24px;">
        ${logoSvg(64, 90)}
        <p style="font-size: 32px; font-weight: 600; color: ${OG_INK_SOFT}; margin: 0;">${escapeHtml(message)}</p>
      </div>
    </div>
  `;
}
