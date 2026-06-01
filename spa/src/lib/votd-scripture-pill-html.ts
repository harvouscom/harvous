import { getTranslationAbbreviationDisplay } from '@/data/translations';

function escapeHtmlAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

/** Pending scripture pill HTML for new notes (resolved by processScriptureReferences on save/create). */
export function buildVotdScripturePillHtml(reference: string, translation: string): string {
  const ref = reference.trim();
  const t = (translation.trim() || 'NET');
  const label = getTranslationAbbreviationDisplay(t);
  // NBSP after pill so a visible gap remains before typed text (normal space can collapse at block end)
  return `<p><span data-scripture-reference="${escapeHtmlAttr(ref)}" data-note-id="pending" data-scripture-translation="${escapeHtmlAttr(t)}" data-scripture-translation-label="${escapeHtmlAttr(label)}" class="scripture-pill scripture-pill-clickable">${ref}</span>\u00A0</p>`;
}
