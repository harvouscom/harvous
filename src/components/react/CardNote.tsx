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
      className={`card-note-container bg-white relative rounded-xl h-20 transition-all duration-200 hover:shadow-sm hover:scale-[1.005] cursor-pointer ${className}`}
      onClick={onClick}
    >
      {variant === "default" && (
        <div className="relative rounded-xl h-full">
          {/* Type indicator badge */}
          {noteType !== 'default' && (
            <div className="absolute top-2 right-2 z-10">
              <div className="bg-[var(--color-blue)] text-white rounded-full p-1.5 shadow-sm">
                {noteType === 'scripture' && (
                  <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/>
                  </svg>
                )}
                {noteType === 'resource' && (
                  <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M10.59 13.41c.41.39.41 1.03 0 1.42-.39.39-1.03.39-1.42 0a5.003 5.003 0 0 1 0-7.07l3.54-3.54a5.003 5.003 0 0 1 7.07 0 5.003 5.003 0 0 1 0 7.07l-1.49 1.49c.01-.82-.12-1.64-.4-2.42l.47-.48a2.982 2.982 0 0 0 0-4.24 2.982 2.982 0 0 0-4.24 0l-3.53 3.53a2.982 2.982 0 0 0 0 4.24zm2.82-4.24c.39-.39 1.03-.39 1.42 0a5.003 5.003 0 0 1 0 7.07l-3.54 3.54a5.003 5.003 0 0 1-7.07 0 5.003 5.003 0 0 1 0-7.07l1.49-1.49c-.01.82.12 1.64.4 2.42l-.47.48a2.982 2.982 0 0 0 0 4.24 2.982 2.982 0 0 0 4.24 0l3.53-3.53a2.982 2.982 0 0 0 0-4.24z"/>
                  </svg>
                )}
              </div>
            </div>
          )}
          
          <div className="box-border content-stretch flex gap-3 items-center justify-start overflow-clip p-[8px] relative h-full">
            {/* Left sidebar with bookmark icon */}
            <div className="bg-[var(--color-light-paper)] box-border content-stretch flex gap-2.5 h-full items-start justify-start overflow-clip p-[8px] relative rounded-lg shrink-0 w-20">
              <div className="relative shrink-0 size-5">
                <svg className="block max-w-none size-full text-[var(--color-deep-grey)] opacity-20" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2z"/>
                </svg>
              </div>
            </div>
            
            {/* Right content area */}
            <div className="basis-0 content-stretch flex gap-6 grow items-start justify-start min-h-px min-w-px relative shrink-0">
              <div className="basis-0 content-stretch flex flex-col gap-2 grow items-start justify-start leading-[0] min-h-px min-w-px not-italic relative self-stretch shrink-0">
                {/* Title */}
                <div className="flex flex-col font-bold justify-center overflow-ellipsis overflow-hidden relative shrink-0 text-[var(--color-deep-grey)] text-[18px] text-nowrap w-full">
                  <p className="leading-[1.2] overflow-hidden text-ellipsis whitespace-nowrap">
                    {title || "Quick Tour of Harvous"}
                  </p>
                </div>
                
                {/* Content */}
                <div className="flex flex-col font-normal justify-center overflow-hidden relative shrink-0 text-[var(--color-stone-grey)] text-[12px] w-full">
                  <p className="leading-[1.3] line-clamp-2">
                    {content ? stripHtml(content) : "Play a video walkthrough going through the app. Think of this as a live demo and feel free to leave a comment with questions."}
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
          <div className="box-border content-stretch flex gap-3 items-center justify-start overflow-clip p-[8px] relative h-full">
            {/* Left sidebar with image background */}
            <div 
              className="bg-center bg-cover bg-no-repeat box-border content-stretch flex gap-2.5 h-full items-start justify-start overflow-clip p-[8px] relative rounded-lg shrink-0 w-20" 
              style={imageUrl ? { backgroundImage: `url('${imageUrl}')` } : { backgroundColor: 'var(--color-aged-paper)' }}
            >
            </div>
            
            {/* Right content area */}
            <div className="basis-0 content-stretch flex gap-6 grow items-start justify-start min-h-px min-w-px relative shrink-0">
              <div className="basis-0 content-stretch flex flex-col gap-2 grow items-start justify-start leading-[0] min-h-px min-w-px not-italic relative self-stretch shrink-0">
                {/* Title */}
                <div className="flex flex-col font-bold justify-center overflow-ellipsis overflow-hidden relative shrink-0 text-[var(--color-deep-grey)] text-[18px] text-nowrap w-full">
                  <p className="leading-[1.2] overflow-hidden text-ellipsis whitespace-nowrap">
                    {title || "Note with Image"}
                  </p>
                </div>
                
                {/* Content */}
                <div className="flex flex-col font-normal justify-center overflow-hidden relative shrink-0 text-[var(--color-stone-grey)] text-[12px] w-full">
                  <p className="leading-[1.3] line-clamp-2">
                    {content ? stripHtml(content) : "Note content with an image background. The image adds visual context to the note."}
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
