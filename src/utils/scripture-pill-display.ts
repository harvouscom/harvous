import { getTranslationAbbreviationDisplay } from '@/data/translations';

/** Sets `data-scripture-translation-label` on pills that only have canonical id (legacy HTML, server-rendered content). */
export function ensureScripturePillDisplayLabels(root: ParentNode | null | undefined): void {
  if (!root) return;
  root.querySelectorAll('.scripture-pill[data-scripture-translation]:not([data-scripture-translation-label])').forEach((el) => {
    const id = el.getAttribute('data-scripture-translation');
    if (!id) return;
    el.setAttribute('data-scripture-translation-label', getTranslationAbbreviationDisplay(id));
  });
}

/**
 * Returns HTML with `data-scripture-translation-label` on scripture pills so each React
 * `dangerouslySetInnerHTML` commit includes the label (post-render DOM mutations are overwritten and flicker).
 */
export function withScripturePillDisplayLabels(html: string): string {
  if (!html.includes('scripture-pill') || !html.includes('data-scripture-translation')) {
    return html;
  }
  if (typeof document === 'undefined') {
    return html;
  }
  const wrap = document.createElement('div');
  wrap.innerHTML = html;
  ensureScripturePillDisplayLabels(wrap);
  return wrap.innerHTML;
}
