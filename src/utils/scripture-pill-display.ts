import { getTranslationAbbreviationDisplay } from '@/data/translations';
import {
  matchAnchoredTrailingTranslationAbbreviation,
  isResolvableScriptureReference,
} from '@/utils/scripture-detector';
import { getEffectiveDefaultTranslation } from '@/utils/profile-cache';

/**
 * Strip scripts / inline event handlers before any DOM parse / `innerHTML` assignment.
 *
 * Do NOT import isomorphic-dompurify here — this module is pulled into the Netlify API
 * via html-stripper, and jsdom crashes the function (`ENOENT ... default-stylesheet.css`).
 * Full DOMPurify still runs in client `safeRenderHtml` before read-only render.
 */
function sanitizeBeforeDomParse(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/\son\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '');
}

// The injected pill's own reference (e.g. "Proverbs 23") is often just a prefix/substring of the
// quote's full reference (e.g. "Proverbs 23:1-35") — so the corruption can leave literal text
// before AND/OR after the injected <span>...</span> before the attribute's real closing quote.
const CORRUPTED_QUOTE_REF_RE = /data-scripture-quote-reference="([^<]*)<span\b[^]*?>([^<]*)<\/span>([^"]*)"/g;

/**
 * Repairs scripture-quote blockquotes corrupted by an earlier buggy highlighter pass: when a
 * quote's `data-scripture-quote-reference="..."` attribute value matched another scripture
 * reference elsewhere in the same note (e.g. the attribution pill), the highlighter injected a
 * pill `<span>` *inside the attribute value*, breaking out of its quotes and corrupting the
 * blockquote tag. This must run on the raw string BEFORE any DOM parsing — once a browser parses
 * the corrupted markup, the original tag structure is unrecoverable. Idempotent.
 */
export function repairCorruptedScriptureQuoteAttributes(html: string): string {
  if (!html || !html.includes('data-scripture-quote-reference="') || !html.includes('<span')) return html;
  let result = html;
  let previous: string;
  do {
    previous = result;
    result = previous.replace(CORRUPTED_QUOTE_REF_RE, 'data-scripture-quote-reference="$1$2$3"');
  } while (result !== previous);
  return result;
}

/**
 * Repairs notes corrupted by an earlier buggy pill create-path. Two symptoms:
 *  (A) raw pill-attribute markup leaked into the document as literal TEXT
 *      (e.g. `... data-note-id="note_..." class="scripture-pill..." style="...">`); and
 *  (B) pill spans wrapping text that isn't a scripture reference (a whole list item).
 * This unwraps invalid pill spans (keeping their text) and strips the leaked attribute soup from
 * text nodes. Idempotent — clean HTML is returned unchanged.
 */
export function sanitizeScripturePillHtml(html: string): string {
  if (typeof document === 'undefined' || !html) return html;
  if (!html.includes('data-scripture-reference') && !html.includes('class="scripture-pill')) {
    return html;
  }

  const sanitized = sanitizeBeforeDomParse(html);
  const wrap = document.createElement('div');
  wrap.innerHTML = sanitized;
  let modified = false;

  // (B) Unwrap pill spans whose reference attr or visible text isn't a real reference.
  wrap.querySelectorAll('span[data-scripture-reference]').forEach((node) => {
    const el = node as HTMLElement;
    const ref = el.getAttribute('data-scripture-reference');
    const text = (el.textContent || '').trim();
    // Resolvability, not just shape: an unresolvable-but-well-formed reference like
    // `Exodus 16:1620` is exactly the pill that must not survive a load round-trip.
    const invalid =
      !ref ||
      !isResolvableScriptureReference(ref) ||
      (text.length > 0 && !isResolvableScriptureReference(text));
    if (invalid) {
      el.replaceWith(document.createTextNode(el.textContent || ''));
      modified = true;
    }
  });

  // (A) Strip leaked pill-attribute soup from text nodes.
  const textNodes: Text[] = [];
  const walker = document.createTreeWalker(wrap, NodeFilter.SHOW_TEXT);
  for (let cur = walker.nextNode(); cur; cur = walker.nextNode()) {
    textNodes.push(cur as Text);
  }
  for (const tn of textNodes) {
    const raw = tn.textContent || '';
    if (!/data-note-id="|data-scripture-reference="|class="scripture-pill|style="border-radius: 12px/.test(raw)) {
      continue;
    }
    const cleaned = raw
      .replace(
        /\s*data-(?:note-id|scripture-reference|scripture-translation|scripture-translation-label|pill-accent)="[^"]*"/g,
        '',
      )
      .replace(/\s*class="scripture-pill[^"]*"/g, '')
      .replace(/\s*style="border-radius: 12px[^"]*"/g, '')
      .replace(/[-\d:,]*"\s*>/g, '') // leftover reference-tail + closing ">"
      .replace(/\s{2,}/g, ' ');
    if (cleaned !== raw) {
      tn.textContent = cleaned;
      modified = true;
    }
  }

  return modified ? wrap.innerHTML : sanitized;
}

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
  const sanitized = sanitizeBeforeDomParse(html);
  const wrap = document.createElement('div');
  wrap.innerHTML = sanitized;
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
  const sanitized = sanitizeBeforeDomParse(html);
  const wrap = document.createElement('div');
  wrap.innerHTML = sanitized;

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

  return modified ? wrap.innerHTML : sanitized;
}
