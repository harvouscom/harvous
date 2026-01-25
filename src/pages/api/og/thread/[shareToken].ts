import { ImageResponse } from '@vercel/og';
import { type APIRoute } from 'astro';
import { db, Threads, Notes, NoteThreads, eq, and } from 'astro:db';
import { isValidShareToken } from '@/utils/ids';

// Thread color hex values (pastel colors)
const THREAD_COLORS: Record<string, string> = {
  paper: '#F3F2EC',
  blue: '#C3E4FF',
  yellow: '#F9DE78',
  green: '#C7ECBB',
  pink: '#F7CEEE',
  orange: '#FCD8A0',
  purple: '#E8C9FF',
};

// Fallback color
const DEFAULT_COLOR = '#C3E4FF';

export const GET: APIRoute = async ({ params, url }) => {
  try {
    const { shareToken } = params;

    // Validate share token
    if (!shareToken || !isValidShareToken(shareToken)) {
      return generateFallbackImage('Invalid share link');
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
      return generateFallbackImage('Thread not found');
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
    const displayTitle = threadTitle.length > 60 
      ? threadTitle.substring(0, 57) + '...' 
      : threadTitle;

    // Generate OG image
    return new ImageResponse(
      (
        <div
          style={{
            height: '100%',
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            background: threadColor,
            backgroundImage: `radial-gradient(circle at 20% 30%, rgba(255, 255, 255, 0.3) 0%, transparent 50%),
                             radial-gradient(circle at 80% 70%, rgba(255, 255, 255, 0.2) 0%, transparent 50%)`,
            fontFamily: 'system-ui, -apple-system, sans-serif',
            padding: '80px',
          }}
        >
          {/* Title */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              textAlign: 'center',
              marginBottom: '40px',
            }}
          >
            <h1
              style={{
                fontSize: '72px',
                fontWeight: '700',
                color: '#2C2C2C',
                margin: '0 0 16px 0',
                lineHeight: '1.2',
                maxWidth: '1000px',
              }}
            >
              {displayTitle}
            </h1>
            {threadSubtitle && (
              <p
                style={{
                  fontSize: '32px',
                  fontWeight: '400',
                  color: '#666666',
                  margin: '0',
                  maxWidth: '800px',
                }}
              >
                {threadSubtitle.length > 80 
                  ? threadSubtitle.substring(0, 77) + '...' 
                  : threadSubtitle}
              </p>
            )}
          </div>

          {/* Note count badge */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: 'rgba(255, 255, 255, 0.9)',
              borderRadius: '24px',
              padding: '16px 32px',
              marginBottom: '60px',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
            }}
          >
            <span
              style={{
                fontSize: '28px',
                fontWeight: '600',
                color: '#2C2C2C',
              }}
            >
              {noteCount} {noteCount === 1 ? 'note' : 'notes'}
            </span>
          </div>

          {/* Harvous branding */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              marginTop: 'auto',
            }}
          >
            <svg
              width="32"
              height="45"
              viewBox="0 0 45 64"
              fill="none"
              style={{ opacity: 0.7 }}
            >
              <path
                d="M44.8037 63.9941H0.0078125V0H44.8037V63.9941ZM34.5645 31.168C25.6988 34.2637 18.5024 41.2949 15.3711 50.543L14.2842 53.752H34.5645V31.168ZM10.2471 37.8643C15.8921 29.2487 24.5827 23.0353 34.5645 20.4824V10.2393H10.2471V37.8643Z"
                fill="#2C2C2C"
              />
            </svg>
            <span
              style={{
                fontSize: '24px',
                fontWeight: '600',
                color: '#2C2C2C',
                opacity: 0.7,
              }}
            >
              Harvous
            </span>
          </div>
        </div>
      ),
      {
        width: 1200,
        height: 630,
      }
    );
  } catch (error) {
    console.error('Error generating thread OG image:', error);
    return generateFallbackImage('Error loading thread');
  }
};

function generateFallbackImage(message: string): Response {
  return new ImageResponse(
    (
      <div
        style={{
          height: '100%',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#F3F2EC',
          fontFamily: 'system-ui, -apple-system, sans-serif',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '24px',
          }}
        >
          <svg
            width="64"
            height="90"
            viewBox="0 0 45 64"
            fill="none"
          >
            <path
              d="M44.8037 63.9941H0.0078125V0H44.8037V63.9941ZM34.5645 31.168C25.6988 34.2637 18.5024 41.2949 15.3711 50.543L14.2842 53.752H34.5645V31.168ZM10.2471 37.8643C15.8921 29.2487 24.5827 23.0353 34.5645 20.4824V10.2393H10.2471V37.8643Z"
              fill="#2C2C2C"
            />
          </svg>
          <p
            style={{
              fontSize: '32px',
              fontWeight: '600',
              color: '#666666',
              margin: '0',
            }}
          >
            {message}
          </p>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    }
  );
}
