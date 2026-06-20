/**
 * Detect canonical verse keys from note prose (title + content) for knowledge-layer lookups.
 * Used by suggest-threads pre-save; merges with saved ScriptureMetadata when a noteId exists.
 */

import {
  detectScriptureReferences,
  normalizeScriptureReference,
  parseScriptureReference,
} from '@/utils/scripture-detector';
import type { VerseKey } from './scripture-knowledge';

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Extract data-scripture-reference attrs from TipTap HTML (pills may differ from plain text). */
function extractDataScriptureReferences(html: string): string[] {
  const out: string[] = [];
  const re = /data-scripture-reference\s*=\s*["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const v = m[1]?.trim();
    if (v) out.push(v);
  }
  return out;
}

function ingestReference(refSource: string, seen: Set<string>, out: VerseKey[]): void {
  const norm = normalizeScriptureReference(refSource.trim()) ?? refSource.trim();
  const parsed = parseScriptureReference(norm);
  if (!parsed) return;

  const chapter = parsed.chapter;
  const verse = parsed.verse;
  const verseNums = Array.isArray(verse) ? [verse[0]] : [verse];
  for (const v of verseNums) {
    const key = `${parsed.book}|${chapter}|${v}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ book: parsed.book, chapter, verse: v });
  }
}

/** Distinct verses cited in note text — detection only, no DB. */
export function detectVerseKeysFromNoteText(title: string, content: string): VerseKey[] {
  const raw = `${title || ''} ${content || ''}`.trim();
  if (!raw) return [];

  const plain = stripHtml(raw);
  const seen = new Set<string>();
  const out: VerseKey[] = [];

  for (const ref of detectScriptureReferences(plain)) {
    ingestReference(ref.reference, seen, out);
  }
  for (const attrRef of extractDataScriptureReferences(content || '')) {
    ingestReference(attrRef, seen, out);
  }

  return out;
}
