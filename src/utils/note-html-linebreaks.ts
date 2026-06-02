/**
 * TipTap / ProseMirror often serialize intentional blank lines as `<p></p>`, which
 * browsers render with zero height and which can be dropped on the next getHTML pass.
 * Normalizing to `<p><br></p>` keeps blank lines stable across save, load, and display.
 */

const EMPTY_PARAGRAPH_RE = /<p([^>]*)>(?:\s|&nbsp;|&#160;)*<\/p>/gi;
const BR_ONLY_PARAGRAPH_RE = /<p([^>]*)>\s*<br\s*\/?>\s*<\/p>/gi;

export function canonicalizeNoteHtmlLineBreaks(html: string | null | undefined): string {
  if (html == null || html === '') return html ?? '';
  let out = html.replace(EMPTY_PARAGRAPH_RE, '<p$1><br></p>');
  out = out.replace(BR_ONLY_PARAGRAPH_RE, '<p$1><br></p>');
  return out;
}
