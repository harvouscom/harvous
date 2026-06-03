import { detectScriptureReferences } from './scripture-detector';

/** Gap text between a scripture pill and a longer detected reference (e.g. ":2", " 2", "-14"). */
export function isOrphanScriptureSuffix(text: string): boolean {
  const t = text.trim();
  if (!t || t.length > 12) return false;
  if (/[a-zA-Z]/.test(t)) return false;
  if (!/\d/.test(t)) return false;
  return /^[\s:,\d\-–—]+$/.test(t);
}

/** Keys that continue typing a reference after a chapter-level pill. */
export function isScriptureReferenceContinuationKey(key: string): boolean {
  if (key.length !== 1) return false;
  return key === ':' || key === ',' || key === '-' || key === '–' || key === '—' || /^\d$/.test(key);
}

/**
 * If `suffix` completes `pillRef` into a valid longer reference, return the canonical merged reference.
 */
export function mergeReferenceWithOrphanSuffix(pillRef: string, suffix: string): string | null {
  if (!pillRef?.trim() || !suffix?.trim()) return null;
  if (!isOrphanScriptureSuffix(suffix)) return null;

  const combined = `${pillRef.trim()}${suffix.trim().startsWith(':') || suffix.trim().startsWith(',') ? '' : ' '}${suffix.trim()}`;
  const refs = detectScriptureReferences(combined);
  if (refs.length === 0) return null;

  const pillTrim = pillRef.trim();
  const pillLower = pillTrim.toLowerCase();
  let best: string | null = null;
  for (const r of refs) {
    const ref = r.reference.trim();
    if (ref.length <= pillTrim.length) continue;
    if (!ref.toLowerCase().startsWith(pillLower)) continue;
    if (!best || ref.length > best.length) {
      best = ref;
    }
  }
  return best;
}
