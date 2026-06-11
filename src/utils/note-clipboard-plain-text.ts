import type { Fragment, Node } from '@tiptap/pm/model';

/** Block separator — single newline matches native `joinPlainSegments` paragraph joins. */
const BLOCK_SEP = '\n';
/** Hard breaks (`<br>`) serialize as a newline in plain-text clipboard output. */
const LEAF_TEXT = '\n';

/** Plain text for clipboard copy from a ProseMirror fragment (selection slice content). */
export function noteClipboardPlainTextFromFragment(content: Fragment): string {
  return content.textBetween(0, content.size, BLOCK_SEP, LEAF_TEXT);
}

/** Plain text for clipboard copy from a document range (selection action bar, etc.). */
export function noteClipboardPlainTextFromRange(doc: Node, from: number, to: number): string {
  return doc.textBetween(from, to, BLOCK_SEP, LEAF_TEXT);
}
