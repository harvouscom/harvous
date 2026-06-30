import { getMarkRange } from '@tiptap/core';
import type { Editor } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { normalizeScriptureReference } from '@/utils/scripture-detector';
import { scriptureReferenceContainsReference } from '@/utils/scripture-verse-keys';
import { isStudyHighlightAccentKey, type StudyHighlightAccentKey } from '@/utils/study-highlight-accents';

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

export function scriptureQuoteAccentKey(accent: string | null | undefined): StudyHighlightAccentKey {
  if (accent && isStudyHighlightAccentKey(accent)) return accent;
  return 'neutral';
}

function buildQuoteContent(
  excerpt: string,
  reference: string,
  translation: string,
  sourceNoteId: string,
  attributionPillAccent: string | null | undefined,
  includeAttribution: boolean,
) {
  const trimmed = excerpt.replace(/\s+/g, ' ').trim();
  if (!trimmed) return null;

  const nodes: Record<string, unknown>[] = [
    {
      type: 'blockquote',
      attrs: {
        scriptureQuoteAccent: scriptureQuoteAccentKey(attributionPillAccent),
        scriptureQuoteReference: normalizeScriptureReference(reference) ?? reference,
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

  if (includeAttribution) {
    const normRef = normalizeScriptureReference(reference) ?? reference;
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

  nodes.push({ type: 'paragraph' });
  return nodes;
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

function tryInsertQuoteContent(editor: Editor, insertPos: number, content: Record<string, unknown>[]): boolean {
  const pos = clampQuoteInsertPos(editor.state.doc, insertPos);
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
  const omitAttribution = shouldOmitScriptureQuoteAttribution(editor.state.doc, insertPos, insertCtx);
  const content = buildQuoteContent(
    ctx.excerpt,
    ctx.reference,
    ctx.translation,
    ctx.sourceNoteId,
    ctx.attributionPillAccent,
    !omitAttribution,
  );
  if (!content) return null;

  if (!tryInsertQuoteContent(editor, insertPos, content)) {
    return null;
  }

  try {
    editor.view.dispatch(editor.state.tr.setStoredMarks([]));
  } catch {
    /* ignore */
  }
  return editor.state.selection.to;
}
