/**
 * TipTap / ProseMirror often serialize intentional blank lines as `<p></p>`, which
 * browsers render with zero height and which can be dropped on the next getHTML pass.
 * Normalizing to `<p><br></p>` keeps blank lines stable across save, load, and display.
 */

const EMPTY_PARAGRAPH_RE = /<p([^>]*)>(?:\s|&nbsp;|&#160;)*<\/p>/gi;
const BR_ONLY_PARAGRAPH_RE = /<p([^>]*)>\s*<br\s*\/?>\s*<\/p>/gi;
const HR_TAG_RE = /<hr\s*\/?>/i;
const EMPTY_P_BEFORE_HR_RE = new RegExp(
  `<p([^>]*)>(?:\\s|&nbsp;|&#160;|<br\\s*\\/?>)*<\\/p>\\s*(<hr\\s*\\/?>)`,
  'gi',
);
const EMPTY_P_AFTER_HR_RE = new RegExp(
  `(<hr\\s*\\/?>)\\s*<p([^>]*)>(?:\\s|&nbsp;|&#160;|<br\\s*\\/?>)*<\\/p>`,
  'gi',
);

/**
 * TipTap often leaves empty paragraphs beside `<hr>` for caret placement; on hydrate those
 * render as extra blank lines (prototype CSS gives empty blocks min-height). Strip only
 * empty/br-only paragraphs immediately adjacent to a horizontal rule.
 */
export function stripHrAdjacentEmptyParagraphs(html: string | null | undefined): string {
  if (html == null || html === '' || !HR_TAG_RE.test(html)) return html ?? '';
  let out = html;
  let prev = '';
  while (out !== prev) {
    prev = out;
    out = out.replace(EMPTY_P_BEFORE_HR_RE, '$2');
    out = out.replace(EMPTY_P_AFTER_HR_RE, '$1');
  }
  return out;
}

export function canonicalizeNoteHtmlLineBreaks(html: string | null | undefined): string {
  if (html == null || html === '') return html ?? '';
  let out = html.replace(EMPTY_PARAGRAPH_RE, '<p$1><br></p>');
  out = out.replace(BR_ONLY_PARAGRAPH_RE, '<p$1><br></p>');
  return out;
}
