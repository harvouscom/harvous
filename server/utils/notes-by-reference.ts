/**
 * "You've written on this passage before" — the pastor-prep half of the
 * teaching plan.
 *
 * Strictly the acting user's own notes. This is sermon prep, not analytics:
 * there is no orgId anywhere in this file and no path that reads another
 * person's writing. The church's hard line (see church-teaching-plan.ts) is that
 * a pastor never sees what the congregation wrote; that line holds here because
 * the only notes considered are the caller's.
 *
 * Matching is verse-key overlap, not string equality, so "Romans 8" finds a note
 * pilled with "Romans 8:1-11" and vice versa. Two storage shapes have to be
 * merged, exactly as `getCrossRefGaps` does: scripture pills embedded in note
 * HTML (current) and the legacy `NoteScriptureReferences` junction.
 */
import { verseKeysFromScriptureReference } from '@/utils/scripture-verse-keys';
import { extractScripturePillsFromHtml } from './crossref-gaps';

export interface ReferenceMatchNote {
  id: string;
  title: string | null;
  updatedAt: Date | string | null;
}

/** A note carrying scripture pills in its HTML body. */
export interface PillCandidate extends ReferenceMatchNote {
  content: string;
}

/** A row from the legacy junction, already joined to its reference parts. */
export interface LegacyCandidate extends ReferenceMatchNote {
  reference: string;
}

export interface ReferenceMatchResult {
  id: string;
  title: string | null;
  updatedAt: Date | string | null;
}

function timeOf(value: Date | string | null): number {
  if (!value) return 0;
  const d = value instanceof Date ? value : new Date(value);
  const t = d.getTime();
  return Number.isFinite(t) ? t : 0;
}

/**
 * Notes whose scripture overlaps `reference`, most recently updated first.
 *
 * Overlap, not containment: a note on Romans 8:1-11 is relevant when planning
 * Romans 8:18-30 only if they share verses — which they don't — but a note on
 * Romans 8 (whole chapter) shares verses with both. Sharing *any* verse is the
 * right bar for "have I been here before".
 */
export function matchNotesToReference(input: {
  reference: string;
  pillNotes: PillCandidate[];
  legacyNotes: LegacyCandidate[];
  /** Notes to leave out — e.g. the one being written from this very service. */
  excludeNoteIds?: string[];
}): ReferenceMatchResult[] {
  const targetKeys = new Set(verseKeysFromScriptureReference(input.reference));
  if (targetKeys.size === 0) return [];

  const excluded = new Set(input.excludeNoteIds ?? []);
  const byId = new Map<string, ReferenceMatchResult>();

  const overlaps = (candidateRef: string): boolean => {
    for (const key of verseKeysFromScriptureReference(candidateRef)) {
      if (targetKeys.has(key)) return true;
    }
    return false;
  };

  const remember = (note: ReferenceMatchNote) => {
    if (excluded.has(note.id) || byId.has(note.id)) return;
    byId.set(note.id, { id: note.id, title: note.title, updatedAt: note.updatedAt });
  };

  for (const note of input.pillNotes) {
    if (excluded.has(note.id) || byId.has(note.id)) continue;
    for (const pill of extractScripturePillsFromHtml(note.content ?? '')) {
      if (overlaps(pill.reference)) {
        remember(note);
        break;
      }
    }
  }

  // Legacy rows can duplicate a pill note; `remember` dedupes by id.
  for (const row of input.legacyNotes) {
    if (overlaps(row.reference)) remember(row);
  }

  return [...byId.values()].sort((a, b) => timeOf(b.updatedAt) - timeOf(a.updatedAt));
}
