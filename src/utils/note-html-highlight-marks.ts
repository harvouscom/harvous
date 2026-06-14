/**
 * Study highlights are underline-only in read-only surfaces (shared pages, view mode).
 * Legacy TipTap / multicolor saves may still carry inline `background-*` on `<mark>`;
 * strip those so public CSS (underline + accent) is the only paint.
 */

const MARK_OPEN_TAG_RE = /<mark(\s[^>]*)>/gi;
const STYLE_ATTR_RE = /\sstyle\s*=\s*(["'])([\s\S]*?)\1/i;
const PAINT_STYLE_RE = /^\s*(background(?:-color|-image)?|text-shadow|box-shadow)\s*:/i;

const PAINT_PROPERTIES = [
  'background',
  'background-color',
  'background-image',
  'text-shadow',
  'box-shadow',
] as const;

function stripPaintFromStyleAttribute(attrs: string): string {
  const styleMatch = attrs.match(STYLE_ATTR_RE);
  if (!styleMatch) return attrs;

  const quote = styleMatch[1];
  const cleaned = styleMatch[2]
    .split(';')
    .map((part) => part.trim())
    .filter((part) => part.length > 0 && !PAINT_STYLE_RE.test(part))
    .join(';');

  const withoutStyle = attrs.replace(STYLE_ATTR_RE, '');
  if (!cleaned) return withoutStyle;
  return `${withoutStyle} style=${quote}${cleaned}${quote}`;
}

function stripMarksWithDomParser(html: string): string {
  const doc = new DOMParser().parseFromString(`<div id="harvous-mark-root">${html}</div>`, 'text/html');
  const root = doc.getElementById('harvous-mark-root');
  if (!root) return html;

  root.querySelectorAll('mark').forEach((mark) => {
    for (const prop of PAINT_PROPERTIES) {
      mark.style.removeProperty(prop);
    }
    if (!mark.getAttribute('style')?.trim()) {
      mark.removeAttribute('style');
    }
  });

  return root.innerHTML;
}

export function stripStudyHighlightMarkInlineBackground(html: string | null | undefined): string {
  if (html == null || html === '' || !html.includes('<mark')) return html ?? '';

  if (typeof DOMParser !== 'undefined') {
    try {
      return stripMarksWithDomParser(html);
    } catch {
      /* fall through to regex */
    }
  }

  return html.replace(MARK_OPEN_TAG_RE, (_full, attrs: string) => {
    const nextAttrs = stripPaintFromStyleAttribute(attrs);
    return nextAttrs ? `<mark${nextAttrs}>` : '<mark>';
  });
}
