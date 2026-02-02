export const prerender = false;

import { type APIRoute } from 'astro';
import { db, Notes, ScriptureMetadata, ResourceMetadata, eq, and } from 'astro:db';
import { isValidShareToken } from '@/utils/ids';
// TODO: re-enable when OG image generation is restored
// import {
//   createOgImageResponse,
//   logoSvg,
//   brandingFooter,
//   fallbackImageHtml,
//   stripHtml,
//   truncateText,
//   escapeHtml,
// } from '@/utils/og-image';

export const GET: APIRoute = async (_context) => {
  // OG image temporarily disabled – will come back to this
  return new Response('OG image temporarily disabled', {
    status: 200,
    headers: { 'Content-Type': 'text/plain' }
  });
};

/* Re-enable when og-image is restored:
  try {
    const { shareToken } = params;

    // Validate share token
    if (!shareToken || !isValidShareToken(shareToken)) {
      return createOgImageResponse(fallbackImageHtml('Invalid share link'));
    }

    // Fetch note data
    const note = await db
      .select({
        id: Notes.id,
        title: Notes.title,
        content: Notes.content,
        noteType: Notes.noteType,
      })
      .from(Notes)
      .where(and(
        eq(Notes.shareToken, shareToken),
        eq(Notes.isPublic, true)
      ))
      .get();

    if (!note) {
      return createOgImageResponse(fallbackImageHtml('Note not found'));
    }

    const noteTitle = note.title || 'Untitled Note';
    const noteContent = note.content || '';
    const noteType = note.noteType || 'default';

    // Fetch metadata based on note type
    let scriptureMetadata = null;
    let resourceMetadata = null;

    if (noteType === 'scripture') {
      scriptureMetadata = await db
        .select({
          reference: ScriptureMetadata.reference,
          book: ScriptureMetadata.book,
          chapter: ScriptureMetadata.chapter,
          verse: ScriptureMetadata.verse,
          verseEnd: ScriptureMetadata.verseEnd,
          translation: ScriptureMetadata.translation,
        })
        .from(ScriptureMetadata)
        .where(eq(ScriptureMetadata.noteId, note.id))
        .get();
    } else if (noteType === 'resource') {
      resourceMetadata = await db
        .select({
          sourceTitle: ResourceMetadata.sourceTitle,
          sourceDescription: ResourceMetadata.sourceDescription,
          sourceImage: ResourceMetadata.sourceImage,
        })
        .from(ResourceMetadata)
        .where(eq(ResourceMetadata.noteId, note.id))
        .get();
    }

    // Generate different layouts based on note type
    if (noteType === 'scripture' && scriptureMetadata) {
      return generateScriptureImage(noteTitle, scriptureMetadata);
    } else if (noteType === 'resource' && resourceMetadata) {
      return generateResourceImage(noteTitle, noteContent, resourceMetadata);
    } else {
      return generateDefaultImage(noteTitle, noteContent);
    }
  } catch (error) {
    console.error('Error generating note OG image:', error);
    return createOgImageResponse(fallbackImageHtml('Error loading note'));
  }
};

function generateScriptureImage(title: string, metadata: any): Promise<Response> {
  const reference = metadata.reference ||
    `${metadata.book} ${metadata.chapter}:${metadata.verse}${metadata.verseEnd ? `-${metadata.verseEnd}` : ''}`;
  const translation = metadata.translation || '';

  const titleSection = title && title !== 'Untitled Note'
    ? `<div style="display: flex; align-items: center; justify-content: center; background-color: rgba(255, 255, 255, 0.9); border-radius: 16px; padding: 20px 40px; margin-bottom: 40px; max-width: 900px;">
         <p style="font-size: 36px; font-weight: 600; color: #2C2C2C; margin: 0; text-align: center;">${escapeHtml(truncateText(title, 60))}</p>
       </div>`
    : '';

  const translationSection = translation
    ? `<p style="font-size: 28px; font-weight: 400; color: #666666; margin: 0;">${escapeHtml(translation)}</p>`
    : '';

  const htmlContent = `
    <div style="height: 100%; width: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; background: linear-gradient(135deg, #C3E4FF 0%, #E8C9FF 100%); font-family: 'Reddit Sans', system-ui, sans-serif; padding: 80px;">
      <div style="display: flex; flex-direction: column; align-items: center; margin-bottom: 60px;">
        <h1 style="font-size: 96px; font-weight: 700; color: #2C2C2C; margin: 0 0 24px 0; line-height: 1.1; text-align: center;">
          ${escapeHtml(truncateText(reference, 40))}
        </h1>
        ${translationSection}
      </div>
      ${titleSection}
      ${brandingFooter()}
    </div>
  `;

  return createOgImageResponse(htmlContent);
}

function generateResourceImage(title: string, content: string, metadata: any): Promise<Response> {
  const resourceTitle = metadata.sourceTitle || title;
  const resourceDescription = metadata.sourceDescription || stripHtml(content);
  const resourceImage = metadata.sourceImage;

  const backgroundStyle = resourceImage
    ? `background-image: url(${resourceImage}); background-size: cover; background-position: center;`
    : 'background: linear-gradient(135deg, #C3E4FF 0%, #E8C9FF 100%);';

  const descriptionSection = resourceDescription
    ? `<p style="font-size: 24px; font-weight: 400; color: #666666; margin: 0 0 40px 0; line-height: 1.5;">${escapeHtml(truncateText(resourceDescription, 200))}</p>`
    : '';

  const htmlContent = `
    <div style="height: 100%; width: 100%; display: flex; flex-direction: row; background: #F3F2EC; font-family: 'Reddit Sans', system-ui, sans-serif;">
      <div style="width: 50%; height: 100%; display: flex; align-items: center; justify-content: center; ${backgroundStyle}"></div>
      <div style="width: 50%; height: 100%; display: flex; flex-direction: column; align-items: flex-start; justify-content: center; padding: 80px 60px;">
        <h1 style="font-size: 56px; font-weight: 700; color: #2C2C2C; margin: 0 0 32px 0; line-height: 1.2;">
          ${escapeHtml(truncateText(resourceTitle, 50))}
        </h1>
        ${descriptionSection}
        ${brandingFooter()}
      </div>
    </div>
  `;

  return createOgImageResponse(htmlContent);
}

function generateDefaultImage(title: string, content: string): Promise<Response> {
  const plainContent = stripHtml(content);
  const contentPreview = truncateText(plainContent, 250);

  const contentSection = contentPreview
    ? `<div style="display: flex; align-items: center; justify-content: center; background-color: rgba(255, 255, 255, 0.9); border-radius: 16px; padding: 32px 40px; margin-bottom: 40px; max-width: 900px;">
         <p style="font-size: 28px; font-weight: 400; color: #666666; margin: 0; line-height: 1.5; text-align: center;">${escapeHtml(contentPreview)}</p>
       </div>`
    : '';

  const htmlContent = `
    <div style="height: 100%; width: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; background: linear-gradient(135deg, #F3F2EC 0%, #E8C9FF 50%, #C3E4FF 100%); font-family: 'Reddit Sans', system-ui, sans-serif; padding: 80px;">
      <h1 style="font-size: 64px; font-weight: 700; color: #2C2C2C; margin: 0 0 40px 0; line-height: 1.2; text-align: center; max-width: 1000px;">
        ${escapeHtml(truncateText(title, 60))}
      </h1>
      ${contentSection}
      ${brandingFooter()}
    </div>
  `;

  return createOgImageResponse(htmlContent);
}
*/
