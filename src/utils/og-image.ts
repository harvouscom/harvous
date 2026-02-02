/**
 * OG Image generation utility using satori + sharp + satori-html
 * Works reliably on Netlify serverless functions (unlike @vercel/og which is Vercel-optimized)
 */

import type { ReactNode } from 'react';
import satori from 'satori';
import sharp from 'sharp';
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

// Harvous logo SVG path
export const HARVOUS_LOGO_PATH = 'M44.8037 63.9941H0.0078125V0H44.8037V63.9941ZM34.5645 31.168C25.6988 34.2637 18.5024 41.2949 15.3711 50.543L14.2842 53.752H34.5645V31.168ZM10.2471 37.8643C15.8921 29.2487 24.5827 23.0353 34.5645 20.4824V10.2393H10.2471V37.8643Z';

/**
 * Load font data for satori
 * Note: satori requires TTF or OTF format (not woff/woff2)
 * We fetch Reddit Sans font TTF files from Google Fonts
 */
async function loadFonts() {
  // Load Reddit Sans Regular (weight 400) - TTF format from Google Fonts
  const fontResponse = await fetch(
    'https://fonts.gstatic.com/s/redditsans/v6/EYqgmaFOxq1T_-ETdN7EKSlnU2dHRsBCV5uxbYxmAQ.ttf'
  );

  if (!fontResponse.ok) {
    throw new Error(`Failed to load regular font: ${fontResponse.status}`);
  }
  const fontData = await fontResponse.arrayBuffer();

  // Load Reddit Sans Bold (weight 700)
  const fontBoldResponse = await fetch(
    'https://fonts.gstatic.com/s/redditsans/v6/EYqgmaFOxq1T_-ETdN7EKSlnU2dHRsBCV5uxiotmAQ.ttf'
  );

  if (!fontBoldResponse.ok) {
    throw new Error(`Failed to load bold font: ${fontBoldResponse.status}`);
  }
  const fontBoldData = await fontBoldResponse.arrayBuffer();

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

// Cache fonts to avoid re-fetching on every request
let fontsCache: Awaited<ReturnType<typeof loadFonts>> | null = null;

async function getFonts() {
  if (!fontsCache) {
    fontsCache = await loadFonts();
  }
  return fontsCache;
}

/**
 * Generate an OG image from an HTML string
 * @param htmlString - HTML string to render (using inline styles)
 * @returns PNG image as Buffer
 */
export async function generateOgImage(htmlString: string): Promise<Buffer> {
  const fonts = await getFonts();

  // Convert HTML string to satori-compatible element
  const element = html(htmlString);

  // Generate SVG using satori (satori-html VNode is compatible with satori's ReactNode)
  const svg = await satori(element as ReactNode, {
    width: OG_WIDTH,
    height: OG_HEIGHT,
    fonts,
  });

  // Convert SVG to PNG using sharp
  const pngBuffer = await sharp(Buffer.from(svg))
    .png()
    .toBuffer();

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
        'Cache-Control': 'public, max-age=86400, s-maxage=86400', // Cache for 24 hours
      },
    });
  } catch (error) {
    console.error('Error generating OG image:', error);
    // Return a simple error response - social platforms will use fallback
    return new Response('Error generating image', {
      status: 500,
      headers: { 'Content-Type': 'text/plain' },
    });
  }
}

// Helper functions for text formatting
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

// Escape HTML entities for safe rendering
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ============================================================================
// Pre-built HTML templates for OG images
// ============================================================================

/**
 * Generate HTML for Harvous logo SVG
 */
export function logoSvg(width: number, height: number, fill: string = '#2C2C2C', opacity: number = 1): string {
  return `<svg width="${width}" height="${height}" viewBox="0 0 45 64" fill="none" style="opacity: ${opacity}"><path d="${HARVOUS_LOGO_PATH}" fill="${fill}"/></svg>`;
}

/**
 * Generate HTML for Harvous branding footer
 */
export function brandingFooter(): string {
  return `
    <div style="display: flex; align-items: center; gap: 12px; margin-top: auto;">
      ${logoSvg(32, 45, '#2C2C2C', 0.7)}
      <span style="font-size: 24px; font-weight: 600; color: #2C2C2C; opacity: 0.7;">Harvous</span>
    </div>
  `;
}

/**
 * Generate fallback OG image HTML
 */
export function fallbackImageHtml(message: string): string {
  return `
    <div style="height: 100%; width: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; background: #F3F2EC; font-family: 'Reddit Sans', system-ui, sans-serif;">
      <div style="display: flex; flex-direction: column; align-items: center; gap: 24px;">
        ${logoSvg(64, 90)}
        <p style="font-size: 32px; font-weight: 600; color: #666666; margin: 0;">${escapeHtml(message)}</p>
      </div>
    </div>
  `;
}
