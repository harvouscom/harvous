export const prerender = false;

import { type APIRoute } from 'astro';
// import { getReferrerDisplayName } from '@/utils/referral-code';
// TODO: re-enable when OG image generation is restored
// import {
//   createOgImageResponse,
//   logoSvg,
//   truncateText,
//   escapeHtml,
// } from '@/utils/og-image';

export const GET: APIRoute = async (_context) => {
  // OG image temporarily disabled – will come back to this
  return new Response('OG image temporarily disabled', {
    status: 200,
    headers: { 'Content-Type': 'text/plain' }
  });
}
