/**
 * Paper-style OG card HTML for shared notes (default / scripture / resource).
 * Tokens mirror spa/src/styles/public-pages.css.
 */

import {
  brandingFooter,
  escapeHtml,
  OG_ACCENT,
  OG_CARD,
  OG_INK,
  OG_INK_SOFT,
  OG_PAPER,
  OG_RULE,
  stripHtml,
  truncateText,
} from '@/utils/og-image';

export type OgNoteType = 'default' | 'scripture' | 'resource';

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

function formatScriptureReference(meta: OgScriptureMeta): string {
  if (meta.reference?.trim()) return meta.reference.trim();
  if (!meta.book || meta.chapter == null || meta.verse == null) return '';
  const end = meta.verseEnd != null && meta.verseEnd !== meta.verse ? `-${meta.verseEnd}` : '';
  return `${meta.book} ${meta.chapter}:${meta.verse}${end}`;
}

/** Only allow https absolute URLs for remote OG side images. */
export function safeHttpsImageUrl(url: string | null | undefined): string | null {
  if (!url?.trim()) return null;
  try {
    const parsed = new URL(url.trim());
    if (parsed.protocol !== 'https:') return null;
    return parsed.href;
  } catch {
    return null;
  }
}

function paperShell(inner: string): string {
  return `
    <div style="height: 100%; width: 100%; display: flex; flex-direction: column; background: ${OG_PAPER}; font-family: 'Reddit Sans', system-ui, sans-serif; padding: 64px 72px;">
      ${inner}
    </div>
  `;
}

export function buildDefaultNoteCardHtml(title: string, content: string): string {
  const displayTitle = truncateText(title.trim() || 'Shared note', 72);
  const preview = truncateText(stripHtml(content || ''), 220);

  const excerpt = preview
    ? `<p style="font-size: 28px; font-weight: 400; color: ${OG_INK_SOFT}; margin: 0; line-height: 1.45; max-width: 980px;">${escapeHtml(preview)}</p>`
    : '';

  return paperShell(`
    <div style="display: flex; flex-direction: column; flex: 1; justify-content: center; gap: 28px;">
      <div style="display: flex; width: 56px; height: 6px; background: ${OG_ACCENT}; border-radius: 3px;"></div>
      <h1 style="font-size: 64px; font-weight: 700; color: ${OG_INK}; margin: 0; line-height: 1.15; max-width: 1000px;">
        ${escapeHtml(displayTitle)}
      </h1>
      ${excerpt}
    </div>
    ${brandingFooter()}
  `);
}

export function buildScriptureNoteCardHtml(title: string, meta: OgScriptureMeta): string {
  const reference = formatScriptureReference(meta) || 'Scripture';
  const translation = meta.translation?.trim() || '';
  const noteTitle = title.trim() && title.trim() !== 'Untitled Note' ? title.trim() : '';

  const translationSection = translation
    ? `<p style="font-size: 26px; font-weight: 500; color: ${OG_ACCENT}; margin: 0 0 8px 0; letter-spacing: 0.04em; text-transform: uppercase;">${escapeHtml(translation)}</p>`
    : '';

  const titleSection = noteTitle
    ? `<div style="display: flex; background: ${OG_CARD}; border: 1px solid ${OG_RULE}; border-radius: 20px; padding: 22px 32px; margin-top: 8px; max-width: 900px;">
         <p style="font-size: 28px; font-weight: 500; color: ${OG_INK_SOFT}; margin: 0; text-align: center;">${escapeHtml(truncateText(noteTitle, 70))}</p>
       </div>`
    : '';

  return `
    <div style="height: 100%; width: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; background: ${OG_PAPER}; background-image: linear-gradient(160deg, #e8eefc 0%, ${OG_PAPER} 45%, #f1ede2 100%); font-family: 'Reddit Sans', system-ui, sans-serif; padding: 72px;">
      <div style="display: flex; flex-direction: column; align-items: center; margin-bottom: 40px;">
        ${translationSection}
        <h1 style="font-size: 88px; font-weight: 700; color: ${OG_INK}; margin: 0; line-height: 1.1; text-align: center; max-width: 1000px;">
          ${escapeHtml(truncateText(reference, 42))}
        </h1>
        ${titleSection}
      </div>
      ${brandingFooter()}
    </div>
  `;
}

export function buildResourceNoteCardHtml(
  title: string,
  content: string,
  meta: OgResourceMeta,
): string {
  const resourceTitle = truncateText(
    (meta.sourceTitle || title || 'Shared resource').trim(),
    56,
  );
  const description = truncateText(
    (meta.sourceDescription || stripHtml(content || '')).trim(),
    180,
  );
  const sourceLabel = (meta.sourceName || meta.sourceDomain || '').trim();
  const imageUrl = safeHttpsImageUrl(meta.sourceImage ?? undefined);

  const descriptionSection = description
    ? `<p style="font-size: 26px; font-weight: 400; color: ${OG_INK_SOFT}; margin: 0 0 28px 0; line-height: 1.45;">${escapeHtml(description)}</p>`
    : '';

  const sourceSection = sourceLabel
    ? `<p style="font-size: 22px; font-weight: 600; color: ${OG_ACCENT}; margin: 0 0 20px 0;">${escapeHtml(truncateText(sourceLabel, 40))}</p>`
    : '';

  if (imageUrl) {
    return `
      <div style="height: 100%; width: 100%; display: flex; flex-direction: row; background: ${OG_PAPER}; font-family: 'Reddit Sans', system-ui, sans-serif;">
        <img src="${escapeHtml(imageUrl)}" width="540" height="630" style="width: 540px; height: 630px; object-fit: cover;" />
        <div style="display: flex; flex-direction: column; flex: 1; padding: 64px 56px; justify-content: center;">
          ${sourceSection}
          <h1 style="font-size: 48px; font-weight: 700; color: ${OG_INK}; margin: 0 0 24px 0; line-height: 1.2;">
            ${escapeHtml(resourceTitle)}
          </h1>
          ${descriptionSection}
          ${brandingFooter()}
        </div>
      </div>
    `;
  }

  return paperShell(`
    <div style="display: flex; flex-direction: column; flex: 1; justify-content: center; gap: 20px;">
      <div style="display: flex; width: 56px; height: 6px; background: ${OG_ACCENT}; border-radius: 3px;"></div>
      ${sourceSection}
      <h1 style="font-size: 56px; font-weight: 700; color: ${OG_INK}; margin: 0; line-height: 1.15; max-width: 1000px;">
        ${escapeHtml(resourceTitle)}
      </h1>
      ${descriptionSection}
    </div>
    ${brandingFooter()}
  `);
}

export function buildNoteCardHtml(input: {
  title: string;
  content: string;
  noteType: OgNoteType | string | null | undefined;
  scriptureMetadata?: OgScriptureMeta | null;
  resourceMetadata?: OgResourceMeta | null;
}): string {
  const noteType = input.noteType || 'default';

  if (noteType === 'scripture' && input.scriptureMetadata) {
    return buildScriptureNoteCardHtml(input.title, input.scriptureMetadata);
  }
  if (noteType === 'resource' && input.resourceMetadata) {
    return buildResourceNoteCardHtml(input.title, input.content, input.resourceMetadata);
  }
  return buildDefaultNoteCardHtml(input.title, input.content);
}

/** Meta title/description helpers for og: HTML documents */
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
