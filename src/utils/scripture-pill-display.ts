import { getTranslationAbbreviationDisplay } from '@/data/translations';
import { matchAnchoredTrailingTranslationAbbreviation } from '@/utils/scripture-detector';
import { getEffectiveDefaultTranslation } from '@/utils/profile-cache';

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

function shouldAdoptTranslationOnPill(current: string | null): boolean {
  if (!current) return true;
  if (current === 'NET') return true;
  return false;
}

/**
 * Repairs scripture pill HTML on load: absorbs orphan translation abbrev text after a pill,
 * applies the user's default translation to stale NET/missing attrs, and ensures display labels.
 */
export function repairScripturePillTranslationsInHtml(
  html: string,
  defaultTranslation?: string,
): string {
  if (!html.includes('data-scripture-reference')) return html;
  if (typeof document === 'undefined') return html;

  const effectiveDefault = defaultTranslation ?? getEffectiveDefaultTranslation();
  const wrap = document.createElement('div');
  wrap.innerHTML = html;

  let modified = false;

  wrap.querySelectorAll('[data-scripture-reference]').forEach((node) => {
    const span = node as HTMLElement;
    let current = span.getAttribute('data-scripture-translation');

    const applyTranslation = (id: string) => {
      if (current === id && span.getAttribute('data-scripture-translation-label')) return;
      span.setAttribute('data-scripture-translation', id);
      span.setAttribute('data-scripture-translation-label', getTranslationAbbreviationDisplay(id));
      current = id;
      modified = true;
    };

    let next = span.nextSibling;
    if (next?.nodeType === Node.TEXT_NODE) {
      const text = next.textContent ?? '';
      const trailing = matchAnchoredTrailingTranslationAbbreviation(text);
      if (trailing) {
        if (shouldAdoptTranslationOnPill(current) || current === trailing.canonicalId) {
          if (shouldAdoptTranslationOnPill(current)) {
            applyTranslation(trailing.canonicalId);
          }
          const remaining = text.slice(trailing.consumed.length);
          if (remaining.length === 0) {
            next.remove();
          } else {
            (next as Text).textContent = remaining;
          }
          modified = true;
        }
      }
    }

    if (shouldAdoptTranslationOnPill(current) && effectiveDefault && effectiveDefault !== 'NET') {
      applyTranslation(effectiveDefault);
    } else if (current && !span.getAttribute('data-scripture-translation-label')) {
      span.setAttribute('data-scripture-translation-label', getTranslationAbbreviationDisplay(current));
      modified = true;
    }
  });

  return modified ? wrap.innerHTML : html;
}
