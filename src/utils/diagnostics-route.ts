/** Redact dynamic path segments for anonymous diagnostics (client + server). */

const NOTE_ID_RE = /\bnote_[a-zA-Z0-9_-]+\b/gi;
const THREAD_ID_RE = /\bthread_[a-zA-Z0-9_-]+\b/gi;
const SPACE_ID_RE = /\bspace_[a-zA-Z0-9_-]+\b/gi;

export function redactDiagnosticRoute(path: string): string {
  const withoutQuery = path.split('?')[0]?.split('#')[0] ?? path;
  const segments = withoutQuery.split('/').filter(Boolean);
  const redacted = segments.map((seg) => {
    if (/^user_[a-zA-Z0-9]+$/.test(seg)) return ':id';
    if (/^(note|thread|space)_[a-zA-Z0-9_-]+$/i.test(seg)) return ':id';
    if (/^[a-f0-9]{20,}$/i.test(seg)) return ':token';
    if (/^\d+$/.test(seg)) return ':id';
    if (seg.length > 40) return ':id';
    return seg;
  });
  return '/' + redacted.join('/');
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
