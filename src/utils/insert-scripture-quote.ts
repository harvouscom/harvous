import { getMarkRange } from '@tiptap/core';
import type { Editor } from '@tiptap/core';
import type { Mark, Node as ProseMirrorNode } from '@tiptap/pm/model';
import { normalizeScriptureReference } from '@/utils/scripture-detector';
import { scriptureReferenceContainsReference } from '@/utils/scripture-verse-keys';
import { scriptureQuoteAccentKey, scriptureQuoteReferenceValue } from '@/utils/scripture-quote-values';

// Moved so seed-HTML builders can use them without loading TipTap; re-exported for callers here.
export { scriptureQuoteAccentKey, scriptureQuoteReferenceValue } from '@/utils/scripture-quote-values';

export type ScriptureQuoteInsertContext = {
  excerpt: string;
  reference: string;
  translation: string;
  sourceNoteId: string;
  sourcePillBoundaries?: { from: number; to: number } | null;
  sourcePillReference?: string | null;
  sourcePillTranslation?: string | null;
  attributionPillAccent?: string | null;
  lastEditorSelection?: { from: number; to: number; at: number } | null;
};

const RECENT_SELECTION_MS = 30_000;

function normalizeRef(ref: string): string {
  return (normalizeScriptureReference(ref) ?? ref).trim().toLowerCase();
}

function refsMatch(a: string, b: string): boolean {
  return normalizeRef(a) === normalizeRef(b);
}

/** True when pill and quote cite the same passage (exact or subset/superset range). */
export function quoteReferencesAlign(pillRef: string, quoteRef: string): boolean {
  if (refsMatch(pillRef, quoteRef)) return true;
  if (scriptureReferenceContainsReference(pillRef, quoteRef)) return true;
  if (scriptureReferenceContainsReference(quoteRef, pillRef)) return true;
  return false;
}

function pillMatchesQuoteContext(
  pillRef: string,
  pillTranslation: string | null | undefined,
  ctx: Pick<
    ScriptureQuoteInsertContext,
    'sourcePillReference' | 'sourcePillTranslation' | 'reference' | 'translation'
  >,
): boolean {
  const quoteRef = ctx.reference;
  const quoteTrans = ctx.translation;
  if (ctx.sourcePillReference && quoteReferencesAlign(pillRef, ctx.sourcePillReference)) {
    return translationsMatch(pillTranslation, ctx.sourcePillTranslation ?? quoteTrans);
  }
  if (!quoteReferencesAlign(pillRef, quoteRef)) return false;
  return translationsMatch(pillTranslation, quoteTrans);
}

function blockContainsMatchingPill(
  block: ProseMirrorNode,
  ctx: Pick<
    ScriptureQuoteInsertContext,
    'sourcePillReference' | 'sourcePillTranslation' | 'reference' | 'translation'
  >,
): boolean {
  let match = false;
  block.descendants((node) => {
    if (match || !node.isText) return;
    const mark = node.marks.find((m) => m.type.name === 'scripturePill');
    if (!mark) return;
    if (pillMatchesQuoteContext(String(mark.attrs.reference ?? ''), mark.attrs.translation, ctx)) {
      match = true;
    }
  });
  return match;
}

/** Block (or same-block text) immediately before a blockquote insert site. */
function hasMatchingPillAdjacentBeforeInsert(
  doc: Editor['state']['doc'],
  insertPos: number,
  ctx: Pick<
    ScriptureQuoteInsertContext,
    'sourcePillReference' | 'sourcePillTranslation' | 'reference' | 'translation'
  >,
): boolean {
  const pos = clampQuoteInsertPos(doc, insertPos);
  if (pos <= 0) return false;

  const $pos = doc.resolve(pos);

  if ($pos.parent.isTextblock) {
    let matchBeforeCursor = false;
    doc.nodesBetween($pos.start(), pos, (node) => {
      if (matchBeforeCursor || !node.isText) return;
      const mark = node.marks.find((m) => m.type.name === 'scripturePill');
      if (mark && pillMatchesQuoteContext(String(mark.attrs.reference ?? ''), mark.attrs.translation, ctx)) {
        matchBeforeCursor = true;
      }
    });
    if (matchBeforeCursor) return true;

    if ($pos.parentOffset === 0) {
      const blockStart = $pos.before($pos.depth);
      const $block = doc.resolve(blockStart);
      if ($block.index() > 0) {
        const prev = $block.parent.child($block.index() - 1);
        if (blockContainsMatchingPill(prev, ctx)) return true;
      }
    } else if (blockContainsMatchingPill($pos.parent, ctx)) {
      return true;
    }
  }

  if ($pos.depth === 1 && $pos.index() > 0) {
    const prev = $pos.parent.child($pos.index() - 1);
    if (blockContainsMatchingPill(prev, ctx)) return true;
  }

  return false;
}

/**
 * The scripturePill mark when `block` is a paragraph holding that one pill and nothing else
 * but whitespace — a pill on its own line, the shape a note starts from. Null for a pill
 * inside a sentence, which cannot move without taking the sentence apart.
 */
export function pillOnlyParagraphMark(block: ProseMirrorNode): Mark | null {
  if (block.type.name !== 'paragraph' || block.childCount === 0) return null;
  let pill: Mark | null = null;
  let ok = true;
  block.forEach((child) => {
    if (!ok) return;
    if (!child.isText) {
      ok = false;
      return;
    }
    const mark = child.marks.find((m) => m.type.name === 'scripturePill');
    if (!mark) {
      if ((child.text ?? '').trim()) ok = false;
      return;
    }
    if (pill && String(pill.attrs.reference ?? '') !== String(mark.attrs.reference ?? '')) {
      ok = false;
      return;
    }
    pill = mark;
  });
  return ok ? pill : null;
}

/**
 * The exact pill — same passage, same translation — alone on the line the quote is going under.
 *
 * Inserting a quote there used to leave the pill on top and the quote below it, a heading over
 * the words rather than a citation of them. Found here, the pill's line is replaced by the quote
 * with that same pill under it, the shape every quote with an attribution has. Exact only: a
 * pill for the whole chapter stays where it is above a verse quoted from it, since it is
 * naming more than the quote is.
 */
function findPillSourceLineAtInsert(
  doc: Editor['state']['doc'],
  insertPos: number,
  ctx: Pick<ScriptureQuoteInsertContext, 'reference' | 'translation'>,
): { from: number; to: number; mark: Mark; text: string } | null {
  const pos = clampQuoteInsertPos(doc, insertPos);
  const $pos = doc.resolve(pos);

  const candidate = (index: number): { from: number; to: number; mark: Mark; text: string } | null => {
    if (index < 0 || index >= doc.childCount) return null;
    const block = doc.child(index);
    const mark = pillOnlyParagraphMark(block);
    if (!mark) return null;
    const pillRef = String(mark.attrs.reference ?? '');
    if (!refsMatch(pillRef, ctx.reference)) return null;
    if (!translationsMatch(mark.attrs.translation, ctx.translation)) return null;
    let from = 0;
    for (let i = 0; i < index; i += 1) from += doc.child(i).nodeSize;
    let text = '';
    block.forEach((child) => {
      if (child.marks.some((m) => m.type.name === 'scripturePill')) text += child.text ?? '';
    });
    return { from, to: from + block.nodeSize, mark, text: text || pillRef };
  };

  if ($pos.depth === 0) return candidate($pos.index() - 1);
  if ($pos.depth !== 1) return null;
  // Caret on the pill's own line, after the pill.
  const own = candidate($pos.index(0));
  if (own && $pos.parentOffset > 0) return own;
  // Caret at the start of the line below it.
  if ($pos.parentOffset === 0 || !$pos.parent.textContent.trim()) {
    return candidate($pos.index(0) - 1);
  }
  return null;
}

function translationsMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  const left = (a ?? '').trim().toUpperCase();
  const right = (b ?? '').trim().toUpperCase();
  if (!left || !right) return true;
  return left === right;
}

/** Clamp insert position to valid doc bounds. */
export function clampQuoteInsertPos(doc: Editor['state']['doc'], pos: number): number {
  const max = doc.content.size;
  return Math.max(0, Math.min(pos, max));
}

/** Resolve where a passage quote should land (recent caret vs after source pill). */
export function resolveScriptureQuoteInsertPos(
  editor: Editor,
  ctx: Pick<
    ScriptureQuoteInsertContext,
    'lastEditorSelection' | 'sourcePillBoundaries'
  >,
): number {
  const now = Date.now();
  const last = ctx.lastEditorSelection;
  const pill = ctx.sourcePillBoundaries;

  if (last && now - last.at < RECENT_SELECTION_MS) {
    const pos = clampQuoteInsertPos(editor.state.doc, last.to);
    if (
      pill &&
      pos >= pill.from &&
      pos <= pill.to
    ) {
      return clampQuoteInsertPos(editor.state.doc, pill.to);
    }
    return pos;
  }
  if (pill) {
    return clampQuoteInsertPos(editor.state.doc, pill.to);
  }
  return clampQuoteInsertPos(editor.state.doc, editor.state.selection.from);
}

/** True when attribution pill would duplicate a matching pill beside the insert site. */
export function shouldOmitScriptureQuoteAttribution(
  doc: Editor['state']['doc'],
  insertPos: number,
  ctx: Pick<
    ScriptureQuoteInsertContext,
    'sourcePillBoundaries' | 'sourcePillReference' | 'sourcePillTranslation' | 'reference' | 'translation'
  >,
): boolean {
  if (hasMatchingPillAdjacentBeforeInsert(doc, insertPos, ctx)) return true;

  if (!ctx.sourcePillBoundaries) return false;

  const { from, to } = ctx.sourcePillBoundaries;
  const pos = clampQuoteInsertPos(doc, insertPos);
  if (pos < from || pos > to + 4) return false;

  let pillRef = ctx.sourcePillReference ?? null;
  let pillTrans = ctx.sourcePillTranslation ?? null;
  if (!pillRef) {
    doc.nodesBetween(from, to, (node) => {
      if (pillRef || !node.isText) return;
      const mark = node.marks.find((m) => m.type.name === 'scripturePill');
      if (mark) {
        pillRef = String(mark.attrs.reference ?? '');
        pillTrans = mark.attrs.translation;
      }
    });
  }
  if (!pillRef) return false;

  return pillMatchesQuoteContext(pillRef, pillTrans, ctx);
}

function buildQuoteContent(
  excerpt: string,
  reference: string,
  translation: string,
  sourceNoteId: string,
  attributionPillAccent: string | null | undefined,
  includeAttribution: boolean,
  includeTrailingParagraph: boolean,
  /** The pill being moved under the quote: its own attrs and label, so nothing about it changes. */
  movedPill?: { attrs: Record<string, unknown>; text: string } | null,
) {
  const trimmed = excerpt.replace(/\s+/g, ' ').trim();
  if (!trimmed) return null;

  const nodes: Record<string, unknown>[] = [
    {
      type: 'blockquote',
      attrs: {
        scriptureQuoteAccent: scriptureQuoteAccentKey(attributionPillAccent),
        scriptureQuoteReference: scriptureQuoteReferenceValue(reference),
        scriptureQuoteTranslation: translation,
      },
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: trimmed }],
        },
      ],
    },
  ];

  if (movedPill) {
    nodes.push({
      type: 'paragraph',
      content: [{ type: 'text', text: movedPill.text, marks: [{ type: 'scripturePill', attrs: movedPill.attrs }] }],
    });
  } else if (includeAttribution) {
    const normRef = scriptureQuoteReferenceValue(reference) ?? reference;
    nodes.push({
      type: 'paragraph',
      content: [
        {
          type: 'text',
          text: normRef,
          marks: [
            {
              type: 'scripturePill',
              attrs: {
                reference: normRef,
                noteId: sourceNoteId || 'pending',
                translation,
                pillAccent: attributionPillAccent ?? null,
              },
            },
          ],
        },
      ],
    });
  }

  if (includeTrailingParagraph) nodes.push({ type: 'paragraph' });
  return nodes;
}

/**
 * Whether the quote needs a blank paragraph after it.
 *
 * Only when the quote lands at the very end of the note, where it would otherwise be the last
 * block and leave the caret nowhere to keep typing. Anywhere else the note already continues,
 * and adding one puts a blank line between the quote and the reader's own next sentence —
 * which is the "inserting a quote adds an extra line" report. It used to be appended
 * unconditionally, and `canonicalizeNoteHtmlLineBreaks` rewrites `<p></p>` to `<p><br></p>`, so
 * it persisted as a visible gap rather than collapsing.
 *
 * `size - 1` rather than `size` because the last block's closing token counts toward
 * `content.size`, so a caret at the end of the final paragraph sits one short of it.
 */
export function quoteInsertNeedsTrailingParagraph(
  doc: Editor['state']['doc'],
  insertPos: number,
): boolean {
  return clampQuoteInsertPos(doc, insertPos) >= doc.content.size - 1;
}

/** Resolve live pill boundaries from stored dock session positions. */
export function resolveSourcePillBoundaries(
  editor: Editor,
  boundaries: { from: number; to: number },
): { from: number; to: number } {
  try {
    const markType = editor.state.schema.marks.scripturePill;
    if (!markType) return boundaries;
    const probe = Math.min(Math.max(boundaries.from + 1, 0), editor.state.doc.content.size);
    const $from = editor.state.doc.resolve(probe);
    const range = getMarkRange($from, markType);
    if (range && typeof range.from === 'number' && typeof range.to === 'number') {
      return { from: range.from, to: range.to };
    }
  } catch {
    /* ignore */
  }
  return boundaries;
}

/** Find a scripture pill in the doc, optionally matching reference text. */
export function findScripturePillBoundariesInDoc(
  editor: Editor,
  reference?: string | null,
): { from: number; to: number } | null {
  if (!editor?.state?.doc) return null;
  const markType = editor.state.schema.marks.scripturePill;
  if (!markType) return null;

  let found: { from: number; to: number } | null = null;
  editor.state.doc.descendants((node, pos) => {
    if (found || !node.isText) return;
    const mark = node.marks.find((m) => m.type === markType);
    if (!mark) return;
    if (reference && !refsMatch(String(mark.attrs.reference ?? ''), reference)) return;
    try {
      const range = getMarkRange(editor.state.doc.resolve(pos + 1), markType);
      if (range && typeof range.from === 'number' && typeof range.to === 'number') {
        found = { from: range.from, to: range.to };
      }
    } catch {
      found = { from: pos, to: pos + node.nodeSize };
    }
  });
  return found;
}

function rangeContainsScripturePill(
  doc: Editor['state']['doc'],
  from: number,
  to: number,
): boolean {
  let hasPill = false;
  doc.nodesBetween(from, to, (node) => {
    if (hasPill || !node.isText) return;
    if (node.marks.some((m) => m.type.name === 'scripturePill')) hasPill = true;
  });
  return hasPill;
}

function tryInsertQuoteContent(
  editor: Editor,
  insertPos: number | { from: number; to: number },
  content: Record<string, unknown>[],
): boolean {
  const pos =
    typeof insertPos === 'number' ? clampQuoteInsertPos(editor.state.doc, insertPos) : insertPos;
  if (editor.commands.insertContentAt(pos, content, { updateSelection: true })) {
    return true;
  }
  if (editor.chain().insertContentAt(pos, content).run()) {
    return true;
  }
  const endPos = editor.state.doc.content.size;
  return editor.commands.insertContentAt(endPos, content, { updateSelection: true });
}

/** Insert a blockquoted passage excerpt into the note body; returns caret position after insert. */
export function insertScriptureQuoteAt(editor: Editor, ctx: ScriptureQuoteInsertContext): number | null {
  if (!editor || editor.isDestroyed) return null;

  let pillBoundaries = ctx.sourcePillBoundaries ?? null;
  if (pillBoundaries && !rangeContainsScripturePill(editor.state.doc, pillBoundaries.from, pillBoundaries.to)) {
    pillBoundaries = findScripturePillBoundariesInDoc(editor, ctx.sourcePillReference ?? ctx.reference);
  }

  const insertCtx = { ...ctx, sourcePillBoundaries: pillBoundaries };
  const insertPos = resolveScriptureQuoteInsertPos(editor, insertCtx);
  const sourceLine = findPillSourceLineAtInsert(editor.state.doc, insertPos, ctx);
  const omitAttribution =
    !sourceLine && shouldOmitScriptureQuoteAttribution(editor.state.doc, insertPos, insertCtx);
  // Replacing the pill's line: a blank line is only needed if that line was the note's last.
  const needsTrailing = sourceLine
    ? sourceLine.to >= editor.state.doc.content.size
    : quoteInsertNeedsTrailingParagraph(editor.state.doc, insertPos);
  const content = buildQuoteContent(
    ctx.excerpt,
    ctx.reference,
    ctx.translation,
    ctx.sourceNoteId,
    ctx.attributionPillAccent ?? (sourceLine ? (sourceLine.mark.attrs.pillAccent as string | null) : null),
    !omitAttribution,
    needsTrailing,
    sourceLine ? { attrs: { ...sourceLine.mark.attrs }, text: sourceLine.text } : null,
  );
  if (!content) return null;

  if (!tryInsertQuoteContent(editor, sourceLine ? { from: sourceLine.from, to: sourceLine.to } : insertPos, content)) {
    return null;
  }

  try {
    editor.view.dispatch(editor.state.tr.setStoredMarks([]));
  } catch {
    /* ignore */
  }
  return editor.state.selection.to;
}
