/** Redact dynamic path segments for anonymous diagnostics (client + server). */

import { RESERVED_PROTOTYPE_SEGMENTS } from '@/lib/prototype-path';

const NOTE_ID_RE = /\bnote_[a-zA-Z0-9_-]+\b/gi;
const THREAD_ID_RE = /\bthread_[a-zA-Z0-9_-]+\b/gi;
const SPACE_ID_RE = /\bspace_[a-zA-Z0-9_-]+\b/gi;

/**
 * Reserved single segments. Everything else at the root is a note slug (notes became
 * first-class at `/{id}`), so it must be redacted like `note_*` was — otherwise the id is
 * stored verbatim and the same error on N notes becomes N issue rows.
 *
 * Derived from the router's own list plus the non-prototype app roots, so a new reserved
 * route can't silently start being redacted as a note id.
 */
const RESERVED_ROOT_SEGMENTS = new Set<string>([
  ...RESERVED_PROTOTYPE_SEGMENTS,
  'sign-in',
  'sign-up',
  'spaces',
  'shared',
  'invitations',
  'addon',
  'upgrade',
  'status',
  'api',
  'prototype',
  'note',
  'thread',
  'assets',
]);

export function redactDiagnosticRoute(path: string): string {
  const withoutQuery = path.split('?')[0]?.split('#')[0] ?? path;
  const segments = withoutQuery.split('/').filter(Boolean);
  const redacted = segments.map((seg, index) => {
    if (/^user_[a-zA-Z0-9]+$/.test(seg)) return ':id';
    if (/^(note|thread|space)_[a-zA-Z0-9_-]+$/i.test(seg)) return ':id';
    if (/^[a-f0-9]{20,}$/i.test(seg)) return ':token';
    if (/^\d+$/.test(seg)) return ':id';
    if (seg.length > 40) return ':id';
    // Flat note route: a lone unreserved base62 segment at the root is a note slug.
    if (index === 0 && segments.length === 1 && !RESERVED_ROOT_SEGMENTS.has(seg.toLowerCase())
      && /^[0-9A-Za-z]{4,}$/.test(seg)) {
      return ':id';
    }
    return seg;
  });
  return '/' + redacted.join('/');
}

/**
 * Collapse the volatile parts of an error message so one root cause is one issue row.
 *
 * Signatures used to hash the raw message, so a build hash, a chunk number, a Clerk version
 * or a set of SQL params split a single problem across many rows (the identical
 * "Loading chunk 9573 failed …" appearing twice is this).
 *
 * Signature input only — the stored `message` keeps its full detail.
 */
export function normalizeDiagnosticMessageForSignature(message: string): string {
  return message
    // Drizzle's params tail: "Failed query: select … \nparams: a,b,c"
    .replace(/\s*params:.*$/is, '')
    // Vite/Rollup content hashes: Foo-CJECPRhB.js → Foo-[hash].js
    .replace(/-[A-Za-z0-9_-]{8,}\.(js|mjs|css)\b/g, '-[hash].$1')
    // Bundler chunk ids: "Loading chunk 9573 failed" → "Loading chunk [id] failed"
    .replace(/\bchunk\s+\d+\b/gi, 'chunk [id]')
    // Package versions in CDN URLs: @5.127.1 → @[version]
    .replace(/@\d+\.\d+\.\d+\b/g, '@[version]')
    // Any remaining long hex/base62 build fingerprint
    .replace(/\b[0-9a-f]{8,}\b/gi, '[hash]')
    .replace(/\s+/g, ' ')
    .trim();
}

export function scrubDiagnosticText(text: string): string {
  return text
    .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[email]')
    .replace(/\buser_[a-zA-Z0-9]+\b/g, '[user]')
    .replace(NOTE_ID_RE, '[note]')
    .replace(THREAD_ID_RE, '[thread]')
    .replace(SPACE_ID_RE, '[space]')
    .replace(/\b[0-9a-f]{24,}\b/gi, '[token]')
    .trim();
}
