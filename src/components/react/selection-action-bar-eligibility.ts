import { NodeSelection } from '@tiptap/pm/state';

/** Prose text selections only — excludes NodeSelection (e.g. horizontalRule before delete). */
export function isSelectionActionBarEligible(editor: {
  state?: { selection?: { from: number; to: number }; doc?: { textBetween: (from: number, to: number) => string } };
} | null): boolean {
  if (!editor?.state?.selection || !editor.state.doc) return false;
  const { selection, doc } = editor.state;
  if (selection instanceof NodeSelection) return false;
  const { from, to } = selection;
  if (from === to) return false;
  try {
    return doc.textBetween(from, to).trim().length > 0;
  } catch {
    return false;
  }
}
