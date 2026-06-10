import type { Editor } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { NodeSelection } from '@tiptap/pm/state';

/** Capture doc position for block image insert before an async upload gap. */
export function captureInlineImageInsertPos(selection: { from: number; to: number }): number {
  if (selection instanceof NodeSelection) return selection.to;
  return selection.from;
}

/** Clamp insert position after doc may have changed during async upload. */
export function clampInlineImageInsertPos(doc: ProseMirrorNode, pos: number): number {
  const max = doc.content.size;
  return Math.max(0, Math.min(pos, max));
}

export function editorHtmlHasInlineImage(html: string): boolean {
  return /<img[\s>]/i.test(html);
}

/** True when prop sync would drop a freshly inserted image from the live editor. */
export function contentSyncWouldClobberInlineImage(editorHtml: string, contentPropHtml: string): boolean {
  return editorHtmlHasInlineImage(editorHtml) && !editorHtmlHasInlineImage(contentPropHtml);
}

/** Insert block image without focus (safe after async file upload). */
export function insertInlineImageAtPos(editor: Editor, insertPos: number, src: string): boolean {
  const imageNode = { type: 'image', attrs: { src, alt: '' } };
  if (editor.chain().insertContentAt(insertPos, imageNode).run()) {
    return true;
  }
  return editor.chain().setTextSelection(insertPos).setImage({ src }).run();
}
