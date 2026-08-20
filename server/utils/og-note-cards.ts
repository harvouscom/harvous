/**
 * Title/description helpers for share OG meta HTML (not image generation).
 */

export interface OgScriptureMeta {
  reference?: string | null;
  book?: string | null;
  chapter?: number | null;
  verse?: number | null;
  verseEnd?: number | null;
  translation?: string | null;
}

export interface OgResourceMeta {
  sourceTitle?: string | null;
  sourceDescription?: string | null;
  sourceImage?: string | null;
  sourceName?: string | null;
  sourceDomain?: string | null;
}

function stripHtml(html: string): string {
  return html
    // Verse numbers ride in <sup>, with no separator of their own — dropping the tag without
    // a space turns "<sup>16</sup>For God" into "16For God" on the share card.
    .replace(/([^\s>])(<(?:sup|sub)[^>]*>)/gi, '$1 $2')
    .replace(/(<\/(?:sup|sub)>)([^\s<])/gi, '$1 $2')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
}

function formatScriptureReference(meta: OgScriptureMeta): string {
  if (meta.reference?.trim()) return meta.reference.trim();
  if (!meta.book || meta.chapter == null || meta.verse == null) return '';
  const end = meta.verseEnd != null && meta.verseEnd !== meta.verse ? `-${meta.verseEnd}` : '';
  return `${meta.book} ${meta.chapter}:${meta.verse}${end}`;
}

export function noteOgTitle(
  title: string | null | undefined,
  noteType: string | null | undefined,
  scriptureMetadata?: OgScriptureMeta | null,
): string {
  if (noteType === 'scripture' && scriptureMetadata) {
    const ref = formatScriptureReference(scriptureMetadata);
    if (ref) {
      const noteTitle = title?.trim();
      if (noteTitle && noteTitle !== 'Untitled Note') {
        return `${ref} · ${noteTitle}`;
      }
      return ref;
    }
  }
  return title?.trim() || 'Shared note';
}

export function noteOgDescription(
  content: string | null | undefined,
  noteType: string | null | undefined,
  scriptureMetadata?: OgScriptureMeta | null,
  resourceMetadata?: OgResourceMeta | null,
): string {
  if (noteType === 'scripture' && scriptureMetadata) {
    const translation = scriptureMetadata.translation?.trim();
    if (translation) {
      return `Scripture on Harvous · ${translation}`;
    }
    return 'A shared Scripture note on Harvous.';
  }
  if (noteType === 'resource' && resourceMetadata?.sourceDescription) {
    return truncateText(resourceMetadata.sourceDescription.trim(), 200);
  }
  return truncateText(stripHtml(content ?? ''), 200);
}
