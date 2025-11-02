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
  
  let text = html
    // Remove script and style tags completely (including their content)
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    // Convert ordered lists to numbered format
    .replace(/<ol[^>]*>/gi, '')
    .replace(/<\/ol>/gi, '')
    .replace(/<li[^>]*>/gi, '• ')
    // Convert unordered lists to bullet format
    .replace(/<ul[^>]*>/gi, '')
    .replace(/<\/ul>/gi, '')
    // Handle line breaks and paragraphs
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/p>/gi, ' ')
    .replace(/<p[^>]*>/gi, '')
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
    // Clean up whitespace
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
