/**
 * Prototype editor: avoid prop→editor sync that drops freshly applied pill accents.
 */
export function contentSyncWouldClobberScripturePillAccent(
  editorHtml: string,
  contentPropHtml: string,
): boolean {
  if (!editorHtml.includes('data-pill-accent')) return false;

  const editorPills = extractPillAccentSequence(editorHtml);
  // Only pills that actually carry a (non-neutral) accent can be clobbered by a sync.
  const hasAccentedEditorPill = editorPills.some((p) => p.accent != null);
  if (!hasAccentedEditorPill) return false;

  // Editor carries an accent but the incoming content drops all accent attributes — a guaranteed clobber.
  if (!contentPropHtml.includes('data-pill-accent')) return true;

  const propPills = extractPillAccentSequence(contentPropHtml);
  // Compare by document position, not by reference. The incoming prop is the processed counterpart of
  // the same body, so its pills line up with the editor's in order. Keying by reference would collapse
  // two same-reference pills (e.g. two `John 3:16`) to one entry and silently miss a clobber on the
  // first when the last happens to match. A differing accent at the same index — or a missing pill —
  // means the sync would drop an accent the user just applied.
  for (let i = 0; i < editorPills.length; i++) {
    const editorAccent = editorPills[i].accent;
    if (editorAccent == null) continue;
    const incoming = propPills[i];
    if (!incoming || incoming.accent !== editorAccent) return true;
  }
  return false;
}

/** Ordered list of scripture pills with their accent (`null` = neutral / no accent attribute). */
function extractPillAccentSequence(html: string): Array<{ reference: string; accent: string | null }> {
  const out: Array<{ reference: string; accent: string | null }> = [];
  if (!html.includes('data-scripture-reference')) return out;
  const spanPattern = /<span[^>]*data-scripture-reference\s*=\s*["']([^"']+)["'][^>]*>/gi;
  let match: RegExpExecArray | null;
  while ((match = spanPattern.exec(html)) !== null) {
    const reference = match[1];
    const accentMatch = match[0].match(/data-pill-accent\s*=\s*["']([^"']+)["']/);
    out.push({ reference, accent: accentMatch ? accentMatch[1] : null });
  }
  return out;
}
