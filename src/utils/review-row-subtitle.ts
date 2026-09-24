import { NOTE_WRITTEN_SOURCE } from '@/utils/study-bible-source-copy';
import { verseRungFor } from '@/utils/review-prompts';

const WRITTEN_PREFIX = 'Written ';

export interface ReviewRowSubtitleInput {
  prompt: string;
  kind?: string | null;
  ladderStep?: number | null;
  promptKey?: string | null;
  noteLabel?: string | null;
  noteContext?: string | null;
  noteTitle?: string | null;
  scriptureReference?: string | null;
  /** Abbreviation of the translation this passage was asked in. */
  translation?: string | null;
  noteWrittenAt?: string | null;
  cue?: string | null;
}

export function writtenAtLabel(iso: string, now: Date = new Date()): string | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const sameYear = date.getFullYear() === now.getFullYear();
  return date.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
}

export function reviewRowSubtitle(
  item: ReviewRowSubtitleInput,
  now: Date = new Date(),
): string | null {
  if (rungIdentityIsTheAnswer(item)) return null;

  const context = item.noteContext?.trim();
  if (context) return context;

  const identity =
    item.noteLabel?.trim() || item.noteTitle?.trim() || item.scriptureReference?.trim() || null;

  if (identity) {
    return item.prompt.includes(identity) ? null : identity;
  }

  if (item.noteWrittenAt) {
    const written = writtenAtLabel(item.noteWrittenAt, now);
    if (written) return `${WRITTEN_PREFIX}${written}`;
  }
  return null;
}

export function reviewRowSource(
  item: { sourceLabel?: string | null; kind?: string | null; ladderStep?: number | null },
  subtitle: string | null,
): string | null {
  const source = item.sourceLabel?.trim() || null;
  if (!source) return null;
  if (item.kind === 'verse' && rungIdentityIsTheAnswer(item)) return null;
  if (!subtitle) return source;
  return source === NOTE_WRITTEN_SOURCE ? null : source;
}

export function reviewRowRecallLabel(
  item: { recallState?: string | null; framing?: { template: string } | null },
  labels: Record<string, string>,
): string | null {
  const state = item.recallState;
  if (!state || state === 'new') return null;
  if (item.framing?.template === 'holding') return null;
  return labels[state] ?? null;
}

export const REVIEW_SUBJECT_HIDDEN_NOTE = 'One of your notes';
export const REVIEW_SUBJECT_HIDDEN_VERSE = 'One of your passages';

/** The stem of a recognize/locate row: a quoted line, never a bare run-on. */
export function formatReviewCue(cue: string | null | undefined): string | null {
  const trimmed = cue?.trim();
  if (!trimmed) return null;
  const inner = trimmed.replace(/^[“”"'‘’]+/, '').replace(/[“”"'‘’]+$/, '').trim();
  if (!inner) return null;
  return `“${inner}”`;
}

/**
 * The name the dock must keep on screen for a write box.
 *
 * Framing says why the item is here. It must not replace the passage. The Activity row already
 * leads with `reviewRowSubject`; the dock used framing instead, so a "write this from memory"
 * card could sit under "You keep coming back to this one." and name no verse at all.
 *
 * Locate / book / recognize still return null — the quoted cue is the handle there, and printing
 * the reference would be the answer.
 */
export function reviewDockAnchor(
  item: ReviewRowSubtitleInput & { kind?: string | null },
): string | null {
  if (rungIdentityIsTheAnswer(item)) return null;
  const reference = item.scriptureReference?.trim() || null;
  if ((item.kind === 'verse' || item.kind === 'chapter') && reference) {
    const version = item.translation?.trim();
    return version ? `${reference} · ${version}` : reference;
  }
  return item.noteLabel?.trim() || item.noteTitle?.trim() || reference || null;
}

/** True when the prompt sentence already carries the anchor, so the line under it would repeat. */
export function reviewPromptNamesAnchor(prompt: string, anchor: string | null | undefined): boolean {
  const name = anchor?.split(' · ')[0]?.trim();
  return Boolean(name && prompt.includes(name));
}

export function reviewRowSubject(
  item: ReviewRowSubtitleInput & { kind?: string | null },
  now: Date = new Date(),
): string {
  if (rungIdentityIsTheAnswer(item)) {
    const cue = formatReviewCue(item.cue);
    if (cue) return cue;
    return item.kind === 'verse' ? REVIEW_SUBJECT_HIDDEN_VERSE : REVIEW_SUBJECT_HIDDEN_NOTE;
  }

  const reference = item.scriptureReference?.trim();
  if ((item.kind === 'verse' || item.kind === 'chapter') && reference) {
    const version = item.translation?.trim();
    return version ? `${reference} · ${version}` : reference;
  }

  const named = item.noteLabel?.trim() || item.noteTitle?.trim() || reference;
  if (named) return named;

  const written = item.noteWrittenAt ? writtenAtLabel(item.noteWrittenAt, now) : null;
  if (written) return `${WRITTEN_PREFIX}${written}`;

  return REVIEW_SUBJECT_HIDDEN_NOTE;
}

export function rungIdentityIsTheAnswer(item: {
  kind?: string | null;
  ladderStep?: number | null;
  promptKey?: string | null;
}): boolean {
  // No note rung has the note as its answer any more: every one asks what the note belongs to.
  if (item.kind !== 'verse') return false;
  const key = item.promptKey ?? verseRungFor(item.ladderStep ?? 0).key;
  return key === 'verse.locate' || key === 'verse.book';
}
