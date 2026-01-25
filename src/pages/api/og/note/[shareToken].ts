import { ImageResponse } from '@vercel/og';
import { type APIRoute } from 'astro';
import { db, Notes, ScriptureMetadata, ResourceMetadata, eq, and } from 'astro:db';
import { isValidShareToken } from '@/utils/ids';

// Thread color hex values (for fallback backgrounds)
const THREAD_COLORS: Record<string, string> = {
  paper: '#F3F2EC',
  blue: '#C3E4FF',
  yellow: '#F9DE78',
  green: '#C7ECBB',
  pink: '#F7CEEE',
  orange: '#FCD8A0',
  purple: '#E8C9FF',
};

const DEFAULT_COLOR = '#C3E4FF';

// Strip HTML tags and get plain text preview
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

// Truncate text to max length
function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
}

export const GET: APIRoute = async ({ params }) => {
  try {
    const { shareToken } = params;

    // Validate share token
    if (!shareToken || !isValidShareToken(shareToken)) {
      return generateFallbackImage('Invalid share link');
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
      return generateFallbackImage('Note not found');
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
    return generateFallbackImage('Error loading note');
  }
};

function generateScriptureImage(title: string, metadata: any): Response {
  const reference = metadata.reference || 
    `${metadata.book} ${metadata.chapter}:${metadata.verse}${metadata.verseEnd ? `-${metadata.verseEnd}` : ''}`;
  const translation = metadata.translation || '';

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
          background: 'linear-gradient(135deg, #C3E4FF 0%, #E8C9FF 100%)',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          padding: '80px',
        }}
      >
        {/* Scripture Reference - Large and prominent */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            marginBottom: '60px',
          }}
        >
          <h1
            style={{
              fontSize: '96px',
              fontWeight: '700',
              color: '#2C2C2C',
              margin: '0 0 24px 0',
              lineHeight: '1.1',
              textAlign: 'center',
            }}
          >
            {truncateText(reference, 40)}
          </h1>
          {translation && (
            <p
              style={{
                fontSize: '28px',
                fontWeight: '400',
                color: '#666666',
                margin: '0',
              }}
            >
              {translation}
            </p>
          )}
        </div>

        {/* Note Title */}
        {title && title !== 'Untitled Note' && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: 'rgba(255, 255, 255, 0.9)',
              borderRadius: '16px',
              padding: '20px 40px',
              marginBottom: '40px',
              maxWidth: '900px',
            }}
          >
            <p
              style={{
                fontSize: '36px',
                fontWeight: '600',
                color: '#2C2C2C',
                margin: '0',
                textAlign: 'center',
              }}
            >
              {truncateText(title, 60)}
            </p>
          </div>
        )}

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
}

function generateResourceImage(title: string, content: string, metadata: any): Response {
  const resourceTitle = metadata.sourceTitle || title;
  const resourceDescription = metadata.sourceDescription || stripHtml(content);
  const resourceImage = metadata.sourceImage;

  return new ImageResponse(
    (
      <div
        style={{
          height: '100%',
          width: '100%',
          display: 'flex',
          flexDirection: 'row',
          background: '#F3F2EC',
          fontFamily: 'system-ui, -apple-system, sans-serif',
        }}
      >
        {/* Left side - Image or gradient */}
        <div
          style={{
            width: '50%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: resourceImage 
              ? `url(${resourceImage})` 
              : 'linear-gradient(135deg, #C3E4FF 0%, #E8C9FF 100%)',
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        />

        {/* Right side - Content */}
        <div
          style={{
            width: '50%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-start',
            justifyContent: 'center',
            padding: '80px 60px',
          }}
        >
          <h1
            style={{
              fontSize: '56px',
              fontWeight: '700',
              color: '#2C2C2C',
              margin: '0 0 32px 0',
              lineHeight: '1.2',
            }}
          >
            {truncateText(resourceTitle, 50)}
          </h1>
          {resourceDescription && (
            <p
              style={{
                fontSize: '24px',
                fontWeight: '400',
                color: '#666666',
                margin: '0 0 40px 0',
                lineHeight: '1.5',
              }}
            >
              {truncateText(resourceDescription, 200)}
            </p>
          )}

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
      </div>
    ),
    {
      width: 1200,
      height: 630,
    }
  );
}

function generateDefaultImage(title: string, content: string): Response {
  const plainContent = stripHtml(content);
  const contentPreview = truncateText(plainContent, 250);

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
          background: 'linear-gradient(135deg, #F3F2EC 0%, #E8C9FF 50%, #C3E4FF 100%)',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          padding: '80px',
        }}
      >
        {/* Title */}
        <h1
          style={{
            fontSize: '64px',
            fontWeight: '700',
            color: '#2C2C2C',
            margin: '0 0 40px 0',
            lineHeight: '1.2',
            textAlign: 'center',
            maxWidth: '1000px',
          }}
        >
          {truncateText(title, 60)}
        </h1>

        {/* Content Preview */}
        {contentPreview && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: 'rgba(255, 255, 255, 0.9)',
              borderRadius: '16px',
              padding: '32px 40px',
              marginBottom: '40px',
              maxWidth: '900px',
            }}
          >
            <p
              style={{
                fontSize: '28px',
                fontWeight: '400',
                color: '#666666',
                margin: '0',
                lineHeight: '1.5',
                textAlign: 'center',
              }}
            >
              {contentPreview}
            </p>
          </div>
        )}

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
}

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
