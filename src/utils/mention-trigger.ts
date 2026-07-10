import { TextSelection, type EditorState } from '@tiptap/pm/state';

export interface MentionTrigger {
  /** Document position of the `@` character. */
  from: number;
  /** Caret position (end of the query). */
  to: number;
  /** Text typed after the `@`, may be empty. */
  query: string;
}

// `@` must sit at the start of the block or after whitespace/opening paren so emails
// (a@b.com) and mid-word `@` never trigger. Query stops at whitespace or another `@`.
const TRIGGER_RE = /(^|[\s (])@([^\s @￼]{0,50})$/;

// Marks whose text must never host a mention trigger — typing `@` inside an existing
// pill or draft should not open the picker.
const BLOCKING_MARKS = ['scripturePill', 'mentionPill', 'scriptureDraft', 'noteLink'];

/**
 * Find an active `@query` mention trigger ending at the caret, or null.
 * Pure function of the editor state — collapsed text selections only.
 */
export function findMentionTrigger(state: EditorState): MentionTrigger | null {
  const { selection } = state;
  if (!(selection instanceof TextSelection) || !selection.empty) return null;

  const $from = selection.$from;
  const parent = $from.parent;
  if (!parent.isTextblock) return null;

  // ￼ placeholder for leaf nodes so pills/atoms break the scan window.
  const textBefore = parent.textBetween(0, $from.parentOffset, undefined, '￼');
  const match = TRIGGER_RE.exec(textBefore);
  if (!match) return null;

  const atOffset = match.index + match[1].length;

  // Reject when the `@` sits inside pill/draft-marked text. Inspect the parent's child at
  // that offset directly — $pos.marks() is unreliable at inclusive:false boundaries.
  const child = parent.childAfter(atOffset);
  if (child.node && child.node.marks.some(m => BLOCKING_MARKS.includes(m.type.name))) {
    return null;
  }

  return {
    from: $from.start() + atOffset,
    to: selection.from,
    query: match[2],
  };
}
