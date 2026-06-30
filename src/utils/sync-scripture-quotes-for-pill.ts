import type { Editor } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { isScriptureQuoteBlockquoteNode } from '@/components/react/TiptapScriptureQuoteBlockquote';
import { fetchVerseHtml } from '@/utils/fetch-verse-html';
import { stripHtml } from '@/utils/html-stripper';
import { scriptureQuoteAccentKey, quoteReferencesAlign } from '@/utils/insert-scripture-quote';
import { normalizeScriptureReference } from '@/utils/scripture-detector';

export type ScriptureQuoteAfterPill = { pos: number; node: ProseMirrorNode };

/** Scripture quote blockquotes in the block(s) immediately after the pill's paragraph. */
export function findScriptureQuotesAfterPillBlock(
  doc: ProseMirrorNode,
  pillFrom: number,
  pillTo: number,
): ScriptureQuoteAfterPill[] {
  const probe = Math.max(pillFrom, pillTo, 1);
  const clamped = Math.min(probe, Math.max(1, doc.content.size - 1));
  const $pos = doc.resolve(clamped);
  if ($pos.depth < 1) return [];

  const out: ScriptureQuoteAfterPill[] = [];
  let scanPos = $pos.after(1);
  while (scanPos < doc.content.size) {
    const node = doc.nodeAt(scanPos);
    if (!node || !isScriptureQuoteBlockquoteNode(node)) break;
    out.push({ pos: scanPos, node });
    scanPos += node.nodeSize;
  }
  return out;
}

export function passagePlainTextFromVerseHtml(html: string): string {
  return stripHtml(html, { preserveSpacing: true }).replace(/\s+/g, ' ').trim();
}

function applyQuoteBlockUpdate(
  tr: ReturnType<Editor['state']['tr']>,
  schema: Editor['state']['schema'],
  quotePos: number,
  quoteNode: ProseMirrorNode,
  attrs: Record<string, unknown>,
  plainText: string | null,
): void {
  tr.setNodeMarkup(quotePos, undefined, {
    ...quoteNode.attrs,
    ...attrs,
  });
  if (plainText == null || !plainText.trim()) return;
  const innerFrom = quotePos + 1;
  const innerTo = quotePos + quoteNode.nodeSize - 1;
  tr.replaceWith(innerFrom, innerTo, schema.nodes.paragraph.create({}, schema.text(plainText)));
}

/** Sync accent border on passage quotes tied to this pill. */
export function syncAdjacentScriptureQuoteAccents(
  editor: Editor,
  pillFrom: number,
  pillTo: number,
  pillAccent: string | null,
): boolean {
  if (!editor || editor.isDestroyed) return false;
  const quotes = findScriptureQuotesAfterPillBlock(editor.state.doc, pillFrom, pillTo);
  if (!quotes.length) return false;

  const accent = scriptureQuoteAccentKey(pillAccent);
  const tr = editor.state.tr;
  for (let i = quotes.length - 1; i >= 0; i -= 1) {
    const { pos, node } = quotes[i];
    tr.setNodeMarkup(pos, undefined, { ...node.attrs, scriptureQuoteAccent: accent });
  }
  tr.setMeta('addToHistory', false);
  editor.view.dispatch(tr);
  return true;
}

/** Sync accent + passage text when the pill reference or translation changes in the dock. */
export async function syncAdjacentScriptureQuotesForPillApply(
  editor: Editor,
  pillFrom: number,
  pillTo: number,
  reference: string,
  translation: string,
  pillAccent: string | null,
): Promise<boolean> {
  if (!editor || editor.isDestroyed) return false;
  const quotes = findScriptureQuotesAfterPillBlock(editor.state.doc, pillFrom, pillTo);
  if (!quotes.length) return false;

  const normRef = normalizeScriptureReference(reference) ?? reference;
  const accent = scriptureQuoteAccentKey(pillAccent);

  const tr = editor.state.tr;
  const { schema } = editor.state;
  for (let i = quotes.length - 1; i >= 0; i -= 1) {
    const { pos, node } = quotes[i];
    const storedRef =
      typeof node.attrs.scriptureQuoteReference === 'string'
        ? normalizeScriptureReference(node.attrs.scriptureQuoteReference) ??
          String(node.attrs.scriptureQuoteReference)
        : null;
    const refToFetch =
      storedRef && quoteReferencesAlign(normRef, storedRef) ? storedRef : normRef;

    const html = await fetchVerseHtml(refToFetch, translation);
    const plainText = html ? passagePlainTextFromVerseHtml(html) : null;

    applyQuoteBlockUpdate(
      tr,
      schema,
      pos,
      node,
      {
        scriptureQuoteAccent: accent,
        scriptureQuoteReference: refToFetch,
        scriptureQuoteTranslation: translation,
      },
      plainText,
    );
  }
  tr.setMeta('addToHistory', false);
  editor.view.dispatch(tr);
  return true;
}
