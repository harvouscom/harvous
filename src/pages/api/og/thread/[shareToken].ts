export const prerender = false;

import { type APIRoute } from 'astro';
import { db, Threads, Notes, NoteThreads, eq, and } from 'astro:db';
import { isValidShareToken } from '@/utils/ids';
// TODO: re-enable when OG image generation is restored
// import {
//   createOgImageResponse,
//   THREAD_COLORS,
//   DEFAULT_COLOR,
//   brandingFooter,
//   fallbackImageHtml,
//   truncateText,
//   escapeHtml,
// } from '@/utils/og-image';

export const GET: APIRoute = async (_context) => {
  // OG image temporarily disabled – will come back to this
  return new Response('OG image temporarily disabled', {
    status: 200,
    headers: { 'Content-Type': 'text/plain' }
  });
}

/* Re-enable when og-image is restored:
export const GET: APIRoute = async ({ params }) => {
  try {
    const { shareToken } = params;

    // Validate share token
    if (!shareToken || !isValidShareToken(shareToken)) {
      return createOgImageResponse(fallbackImageHtml('Invalid share link'));
    }

    // Fetch thread data
    const thread = await db
      .select({
        id: Threads.id,
        title: Threads.title,
        subtitle: Threads.subtitle,
        color: Threads.color,
      })
      .from(Threads)
      .where(and(
        eq(Threads.shareToken, shareToken),
        eq(Threads.isPublic, true)
      ))
      .get();

    if (!thread) {
      return createOgImageResponse(fallbackImageHtml('Thread not found'));
    }

    // Count notes in thread
    const notes = await db
      .select({ id: Notes.id })
      .from(Notes)
      .innerJoin(NoteThreads, eq(NoteThreads.noteId, Notes.id))
      .where(eq(NoteThreads.threadId, thread.id))
      .all();

    const noteCount = notes.length;
    const threadColor = THREAD_COLORS[thread.color || 'blue'] || DEFAULT_COLOR;
    const threadTitle = thread.title || 'Untitled Thread';
    const threadSubtitle = thread.subtitle || '';

    // Truncate title if too long
    const displayTitle = truncateText(threadTitle, 60);

    const subtitleSection = threadSubtitle
      ? `<p style="font-size: 32px; font-weight: 400; color: #666666; margin: 0; max-width: 800px;">${escapeHtml(truncateText(threadSubtitle, 80))}</p>`
      : '';

    const htmlContent = `
      <div style="height: 100%; width: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; background: ${threadColor}; background-image: radial-gradient(circle at 20% 30%, rgba(255, 255, 255, 0.3) 0%, transparent 50%), radial-gradient(circle at 80% 70%, rgba(255, 255, 255, 0.2) 0%, transparent 50%); font-family: 'Reddit Sans', system-ui, sans-serif; padding: 80px;">
        <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; margin-bottom: 40px;">
          <h1 style="font-size: 72px; font-weight: 700; color: #2C2C2C; margin: 0 0 16px 0; line-height: 1.2; max-width: 1000px;">
            ${escapeHtml(displayTitle)}
          </h1>
          ${subtitleSection}
        </div>
        <div style="display: flex; align-items: center; justify-content: center; background-color: rgba(255, 255, 255, 0.9); border-radius: 24px; padding: 16px 32px; margin-bottom: 60px; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);">
          <span style="font-size: 28px; font-weight: 600; color: #2C2C2C;">
            ${noteCount} ${noteCount === 1 ? 'note' : 'notes'}
          </span>
        </div>
        ${brandingFooter()}
      </div>
    `;

    return createOgImageResponse(htmlContent);
  } catch (error) {
    console.error('Error generating thread OG image:', error);
    return createOgImageResponse(fallbackImageHtml('Error loading thread'));
  }
};
*/
