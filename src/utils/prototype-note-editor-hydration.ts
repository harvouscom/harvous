import { isTiptapBodyEmpty } from './prototype-note-empty';

/**
 * One-time TipTap hydrate when the editor mounted empty but props carry a real body,
 * or a safe preview→full upgrade when list-seeded truncated HTML is replaced by details.
 */
export function shouldForcePrototypeNoteBodyHydrate(opts: {
  editorChromeMode: string;
  editorId: string;
  editorIsEmpty: boolean;
  incomingContent: string;
  /** List preview → GET …/details: allow non-empty body replace once. */
  allowPreviewToFullUpgrade?: boolean;
}): boolean {
  if (opts.editorChromeMode !== 'prototypeNative') return false;
  if (opts.editorId !== 'new-note-content' && opts.editorId !== 'edit-note-content') return false;
  if (isTiptapBodyEmpty(opts.incomingContent)) return false;
  if (opts.editorIsEmpty) return true;
  return opts.allowPreviewToFullUpgrade === true;
}
