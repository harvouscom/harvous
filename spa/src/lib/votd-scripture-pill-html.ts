import { getTranslationAbbreviationDisplay } from '@/data/translations';
import { scriptureQuoteAccentKey, scriptureQuoteReferenceValue } from '@/utils/insert-scripture-quote';

function escapeHtmlAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function escapeHtmlText(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Pending scripture pill HTML for new notes (resolved by processScriptureReferences on save/create). */
export function buildVotdScripturePillHtml(reference: string, translation: string): string {
  const ref = reference.trim();
  const t = (translation.trim() || 'NET');
  const label = getTranslationAbbreviationDisplay(t);
  // NBSP after pill so a visible gap remains before typed text (normal space can collapse at block end)
  return `<p><span data-scripture-reference="${escapeHtmlAttr(ref)}" data-note-id="pending" data-scripture-translation="${escapeHtmlAttr(t)}" data-scripture-translation-label="${escapeHtmlAttr(label)}" class="scripture-pill scripture-pill-clickable">${ref}</span>\u00A0</p>`;
}

/**
 * A pill, the words the reader marked underneath it, and a line to type on.
 *
 * The pill-and-blockquote pair already exists as a contract — `TiptapScriptureQuoteBlockquote`
 * reads these three attributes, and a quote saved from the reader carries them — but nothing
 * emitted the pair as seed HTML for a new note. This does, so a card can open a draft that
 * already holds the passage and the verse you highlighted in it.
 *
 * The quote is only ever a verse the reader chose. A card that opened with a verse picked for
 * them would be putting words in a note with their name on it.
 */
export function buildScripturePillWithQuoteHtml(
  reference: string,
  translation: string,
  quote?: { reference: string; text: string; accent?: string | null } | null,
): string {
  const pill = buildVotdScripturePillHtml(reference, translation);
  if (!quote?.text?.trim() || !quote.reference?.trim()) return pill;
  const quoteRef = scriptureQuoteReferenceValue(quote.reference) ?? quote.reference.trim();
  const accent = scriptureQuoteAccentKey(quote.accent);
  const t = translation.trim() || 'NET';
  const blockquote =
    `<blockquote data-scripture-quote-accent="${escapeHtmlAttr(accent)}"` +
    ` data-scripture-quote-reference="${escapeHtmlAttr(quoteRef)}"` +
    ` data-scripture-quote-translation="${escapeHtmlAttr(t)}">` +
    `<p>${escapeHtmlText(quote.text.trim())}</p></blockquote>`;
  // An empty paragraph after it, or the caret lands inside the quote and the reader's first
  // sentence is typed into Scripture.
  return `${pill}${blockquote}<p></p>`;
}
