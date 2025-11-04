import React from 'react';

interface CardNoteProps {
  variant?: "default" | "withImage";
  title?: string;
  content?: string;
  imageUrl?: string;
  noteType?: 'default' | 'scripture' | 'resource';
  className?: string;
  onClick?: () => void;
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
  onClick
}) => {
  return (
    <div 
      className={`card-note-container bg-white relative rounded-xl h-22 transition-all duration-200 hover:shadow-sm hover:scale-[1.005] cursor-pointer ${className}`}
      onClick={onClick}
    >
      {variant === "default" && (
        <div className="relative rounded-xl h-full">
          <div className="box-border content-stretch flex gap-3 items-stretch justify-start overflow-clip p-[8px] relative h-full">
            {/* Left sidebar with note type icon */}
            <div className="bg-[var(--color-light-paper)] box-border content-stretch flex gap-1.5 items-start justify-start overflow-clip p-[8px] relative rounded-lg shrink-0 w-20" style={{ height: '68px' }}>
              <div className="relative shrink-0 size-5">
                {noteType === 'scripture' ? (
                  <i className="fa-solid fa-scroll text-[var(--color-deep-grey)] opacity-20 text-[20px]" />
                ) : noteType === 'resource' ? (
                  <i className="fa-solid fa-file-image text-[var(--color-deep-grey)] opacity-20 text-[20px]" />
                ) : (
                  <svg className="block max-w-none size-full text-[var(--color-deep-grey)] opacity-20" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2z"/>
                  </svg>
                )}
              </div>
            </div>
            
            {/* Right content area */}
            <div className="basis-0 content-stretch flex gap-6 grow items-start justify-start min-h-px min-w-px relative shrink-0 pt-2">
              <div className="basis-0 content-stretch flex flex-col gap-1 grow items-start justify-start leading-[0] min-h-px min-w-px not-italic relative self-stretch shrink-0">
                {/* Title */}
                <div className="flex flex-col font-bold justify-start overflow-ellipsis overflow-hidden relative shrink-0 text-[var(--color-deep-grey)] text-[18px] text-nowrap w-full">
                  <p className="leading-[1.2] overflow-hidden text-ellipsis whitespace-nowrap">
                    {title || "Quick Tour of Harvous"}
                  </p>
                </div>
                
                {/* Content */}
                <div className="flex flex-col font-normal justify-start overflow-hidden relative shrink-0 text-[var(--color-stone-grey)] text-[12px] w-full">
                  <p className="leading-[1.3] line-clamp-2">
                    {content ? stripHtml(content) : ""}
                  </p>
                </div>
              </div>
            </div>
          </div>
          <div aria-hidden="true" className="absolute border border-[#f7f7f6] border-solid inset-0 pointer-events-none rounded-xl"></div>
        </div>
      )}

      {variant === "withImage" && (
        <div className="relative rounded-xl h-full">
          <div className="box-border content-stretch flex gap-3 items-stretch justify-start overflow-clip p-[8px] relative h-full">
            {/* Left sidebar with image background and note type icon */}
            <div 
              className="bg-center bg-cover bg-no-repeat box-border content-stretch flex gap-1.5 items-start justify-start overflow-clip p-[8px] relative rounded-lg shrink-0 w-20" 
              style={imageUrl ? { backgroundImage: `url('${imageUrl}')`, height: '68px' } : { backgroundColor: 'var(--color-aged-paper)', height: '68px' }}
            >
              <div className="relative shrink-0 size-5">
                {noteType === 'scripture' ? (
                  <i className="fa-solid fa-scroll text-[var(--color-deep-grey)] opacity-20 text-[20px]" />
                ) : noteType === 'resource' ? (
                  <i className="fa-solid fa-file-image text-[var(--color-deep-grey)] opacity-20 text-[20px]" />
                ) : (
                  <svg className="block max-w-none size-full text-[var(--color-deep-grey)] opacity-20" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2z"/>
                  </svg>
                )}
              </div>
            </div>
            
            {/* Right content area */}
            <div className="basis-0 content-stretch flex gap-6 grow items-start justify-start min-h-px min-w-px relative shrink-0 pt-2">
              <div className="basis-0 content-stretch flex flex-col gap-1 grow items-start justify-start leading-[0] min-h-px min-w-px not-italic relative self-stretch shrink-0">
                {/* Title */}
                <div className="flex flex-col font-bold justify-start overflow-ellipsis overflow-hidden relative shrink-0 text-[var(--color-deep-grey)] text-[18px] text-nowrap w-full">
                  <p className="leading-[1.2] overflow-hidden text-ellipsis whitespace-nowrap">
                    {title || "Note with Image"}
                  </p>
                </div>
                
                {/* Content */}
                <div className="flex flex-col font-normal justify-start overflow-hidden relative shrink-0 text-[var(--color-stone-grey)] text-[12px] w-full">
                  <p className="leading-[1.3] line-clamp-2">
                    {content ? stripHtml(content) : ""}
                  </p>
                </div>
              </div>
            </div>
          </div>
          <div aria-hidden="true" className="absolute border border-[var(--color-fog-white)] border-solid inset-0 pointer-events-none rounded-xl"></div>
        </div>
      )}
    </div>
  );
};

export default CardNote;
