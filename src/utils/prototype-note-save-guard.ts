import { canonicalizeNoteHtmlLineBreaks } from './note-html-linebreaks';
import { isTiptapBodyEmpty } from './prototype-note-empty';

export type PrototypeUnloadSaveContext = {
  contentToSave: string;
  lastSavedContent: string | null;
  serverContent: string | null;
  draftContent: string | null;
};

function normalizedBody(html: string | null | undefined): string {
  if (html == null) return '';
  return canonicalizeNoteHtmlLineBreaks(html);
}

/**
 * Skip unload/pagehide saves that would PUT an empty body while a non-empty copy
 * is known from a prior save, server props, or local draft backstop.
 */
export function shouldSkipPrototypeUnloadSave(ctx: PrototypeUnloadSaveContext): boolean {
  if (!isTiptapBodyEmpty(normalizedBody(ctx.contentToSave))) return false;

  const knownBodies = [
    ctx.lastSavedContent,
    ctx.serverContent,
    ctx.draftContent,
  ].map(normalizedBody);

  return knownBodies.some((body) => !isTiptapBodyEmpty(body));
}
