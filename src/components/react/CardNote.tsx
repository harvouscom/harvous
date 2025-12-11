import React from 'react';
import Icon from './Icon';

interface CardNoteProps {
  variant?: "default" | "withImage";
  title?: string;
  content?: string;
  imageUrl?: string;
  noteType?: 'default' | 'scripture' | 'resource';
  className?: string;
  onClick?: () => void;
  // Resource metadata (for resource note type)
  resourceTitle?: string | null;
  resourceDescription?: string | null;
  resourceImage?: string | null;
  resourceUrl?: string | null;
}

// Helper function to convert HTML to readable text
function stripHtml(html: string): string {
  if (!html) return '';
  
  // Use a temporary DOM element to parse HTML and extract text with proper spacing
  if (typeof document !== 'undefined') {
    // Insert spaces between block elements before parsing
    let processedHtml = html
      // Convert newlines to spaces
      .replace(/\n/g, ' ')
      .replace(/\r/g, ' ')
      // Ensure space between adjacent block tags
      .replace(/(<\/p>)(<p[^>]*>)/gi, '$1 $2')
      .replace(/(<\/p>)(<div[^>]*>)/gi, '$1 $2')
      .replace(/(<\/div>)(<p[^>]*>)/gi, '$1 $2')
      .replace(/(<\/div>)(<div[^>]*>)/gi, '$1 $2')
      .replace(/(<\/h[1-6]>)(<p[^>]*>)/gi, '$1 $2')
      .replace(/(<\/h[1-6]>)(<div[^>]*>)/gi, '$1 $2')
      .replace(/(<\/p>)(<h[1-6][^>]*>)/gi, '$1 $2')
      .replace(/(<\/div>)(<h[1-6][^>]*>)/gi, '$1 $2')
      // Convert br to space
      .replace(/<br\s*\/?>/gi, ' ');
    
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = processedHtml;
    
    // Use innerText which preserves block element spacing better than textContent
    let text = (tempDiv as HTMLElement).innerText || tempDiv.textContent || '';
    
    // Clean up multiple spaces and trim
    text = text.replace(/\s+/g, ' ').trim();
    
    return text;
  }
  
  // Fallback to regex-based approach for SSR
  let text = html
    // Remove script and style tags completely (including their content)
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    // Convert line breaks and newlines to spaces FIRST (before removing tags)
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/\n/g, ' ')
    .replace(/\r/g, ' ')
    // Insert space between closing and opening block tags (ensure space is always present)
    .replace(/<\/p><p/gi, '</p> <p')
    .replace(/<\/p><div/gi, '</p> <div')
    .replace(/<\/div><p/gi, '</div> <p')
    .replace(/<\/div><div/gi, '</div> <div')
    // Convert block-level closing tags to placeholder (preserves word boundaries)
    .replace(/<\/p>/gi, ' __SPACE__ ')
    .replace(/<\/div>/gi, ' __SPACE__ ')
    .replace(/<\/li>/gi, ' __SPACE__ ')
    .replace(/<\/h[1-6]>/gi, ' __SPACE__ ')
    // Convert ordered lists to numbered format
    .replace(/<ol[^>]*>/gi, '')
    .replace(/<\/ol>/gi, ' __SPACE__ ')
    .replace(/<li[^>]*>/gi, '• ')
    // Convert unordered lists to bullet format
    .replace(/<ul[^>]*>/gi, '')
    .replace(/<\/ul>/gi, ' __SPACE__ ')
    // Remove opening tags (after we've handled line breaks)
    .replace(/<p[^>]*>/gi, '')
    .replace(/<div[^>]*>/gi, '')
    .replace(/<h[1-6][^>]*>/gi, '')
    // Remove other HTML tags
    .replace(/<[^>]*>/g, '')
    // Decode HTML entities
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, '/')
    .replace(/&#x60;/g, '`')
    .replace(/&#x3D;/g, '=')
    // Replace placeholder with actual space (ensure it's always a space)
    .replace(/__SPACE__/g, ' ')
    // Clean up multiple spaces to single space
    .replace(/\s+/g, ' ')
    .trim();
    
  return text;
}

const CardNote: React.FC<CardNoteProps> = ({
  variant = "default",
  title,
  content,
  imageUrl,
  noteType = 'default',
  className = "",
  onClick,
  resourceTitle,
  resourceDescription,
  resourceImage,
  resourceUrl
}) => {
  // For resource notes, prioritize metadata over regular props
  const effectiveTitle = noteType === 'resource' 
    ? (resourceTitle || title || "Untitled Resource")
    : (title || "Untitled Note");
  const effectiveContent = noteType === 'resource' 
    ? (resourceDescription || content || "")
    : (content || "");
  const effectiveImageUrl = noteType === 'resource' 
    ? (resourceImage || imageUrl)
    : imageUrl;
  
  // For resource notes with images, automatically use withImage variant
  const effectiveVariant = (noteType === 'resource' && effectiveImageUrl) ? "withImage" : variant;
  
  return (
    <div className={`card card-note ${className}`} onClick={onClick}>
      {effectiveVariant === "default" && (
        <div className="card-note__inner">
          <div className="card-note__content">
            {/* Left sidebar with note type icon */}
            <div className={`card-note__sidebar ${noteType === 'resource' ? 'card-note__sidebar--resource' : ''}`}>
              <div className="card-note__sidebar-icon">
                {noteType === 'scripture' ? (
                  <Icon name="scroll" size={20} style={{ color: 'var(--color-deep-grey)' }} />
                ) : noteType === 'resource' ? (
                  <Icon name="newspaper" size={20} style={{ color: 'var(--color-deep-grey)' }} />
                ) : (
                  <svg fill="currentColor" viewBox="0 0 24 24">
                    <path d="M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2z"/>
                  </svg>
                )}
              </div>
            </div>
            
            {/* Right content area */}
            <div className="card-note__body">
              <div className="card-note__text">
                <div className="card-note__title">
                  <p>{effectiveTitle || "Quick Tour of Harvous"}</p>
                </div>
                {/* Show excerpt for non-resource notes, or resource notes without URL */}
                {(noteType !== 'resource' || !resourceUrl) && (
                  <div className="card-note__excerpt">
                    <p>{effectiveContent ? stripHtml(effectiveContent) : ""}</p>
                  </div>
                )}
                {/* Show source URL for resource notes */}
                {noteType === 'resource' && resourceUrl && (
                  <div className="card-note__source">
                    <Icon name="link" size={10} style={{ color: 'var(--color-pebble-grey)', flexShrink: 0 }} />
                    <span>{(() => {
                      try {
                        const url = new URL(resourceUrl);
                        return url.hostname.replace('www.', '');
                      } catch {
                        return resourceUrl;
                      }
                    })()}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
          <div aria-hidden="true" className="card__border" style={{ borderColor: '#f7f7f6' }} />
        </div>
      )}

      {effectiveVariant === "withImage" && (
        <div className="card-note__inner">
          <div className="card-note__content">
            {/* Left sidebar with image background and note type icon */}
            <div 
              className={`card-note__sidebar card-note__sidebar--with-image ${noteType === 'resource' ? 'card-note__sidebar--resource' : ''}`}
              style={effectiveImageUrl ? { backgroundImage: `url('${effectiveImageUrl}')` } : undefined}
            >
              {/* Hide icon for resource notes with image - the image is enough */}
              {!(noteType === 'resource' && effectiveImageUrl) && (
                <div className="card-note__sidebar-icon">
                  {noteType === 'scripture' ? (
                    <Icon name="scroll" size={20} style={{ color: 'var(--color-deep-grey)' }} />
                  ) : noteType === 'resource' ? (
                    <Icon name="newspaper" size={20} style={{ color: 'var(--color-deep-grey)' }} />
                  ) : (
                    <svg fill="currentColor" viewBox="0 0 24 24">
                      <path d="M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2z"/>
                    </svg>
                  )}
                </div>
              )}
            </div>
            
            {/* Right content area */}
            <div className="card-note__body">
              <div className="card-note__text">
                <div className="card-note__title">
                  <p>{effectiveTitle || "Note with Image"}</p>
                </div>
                {/* Show excerpt for non-resource notes, or resource notes without URL */}
                {(noteType !== 'resource' || !resourceUrl) && (
                  <div className="card-note__excerpt">
                    <p>{effectiveContent ? stripHtml(effectiveContent) : ""}</p>
                  </div>
                )}
                {/* Show source URL for resource notes */}
                {noteType === 'resource' && resourceUrl && (
                  <div className="card-note__source">
                    <Icon name="link" size={10} style={{ color: 'var(--color-pebble-grey)', flexShrink: 0 }} />
                    <span>{(() => {
                      try {
                        const url = new URL(resourceUrl);
                        return url.hostname.replace('www.', '');
                      } catch {
                        return resourceUrl;
                      }
                    })()}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
          <div aria-hidden="true" className="card__border" />
        </div>
      )}
    </div>
  );
};

export default CardNote;
