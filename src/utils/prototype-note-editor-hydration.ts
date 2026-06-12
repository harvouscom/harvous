import { isTiptapBodyEmpty } from './prototype-note-empty';

/** One-time TipTap hydrate when the editor mounted empty but props carry a real body. */
export function shouldForcePrototypeNoteBodyHydrate(opts: {
  editorChromeMode: string;
  editorId: string;
  editorIsEmpty: boolean;
  incomingContent: string;
}): boolean {
  if (opts.editorChromeMode !== 'prototypeNative') return false;
  if (opts.editorId !== 'new-note-content' && opts.editorId !== 'edit-note-content') return false;
  return opts.editorIsEmpty && !isTiptapBodyEmpty(opts.incomingContent);
}
