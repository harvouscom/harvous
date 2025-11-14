import React from 'react';
import OverlappingNotes from './OverlappingNotes';
import LayerGroupIcon from '@fortawesome/fontawesome-free/svgs/solid/layer-group.svg';

export interface CardFeatProps {
  variant?: "Thread" | "Note" | "NoteImage";
  title?: string;
  content?: string;
  imageUrl?: string;
  count?: number;
  color?: string;
  className?: string;
  lastUpdated?: string;
  isPrivate?: boolean;
  threadType?: string; // Thread type from CMS (e.g., 'Default')
}

// Map color names to CSS variable names
// Handles both short names (blue) and long names (blessed-blue)
function getColorCSSVariable(colorName: string | undefined | null): string {
  if (!colorName) return "var(--color-blue)"; // Default to blue
  
  // Map long color names to short CSS variable names
  const colorMap: Record<string, string> = {
    "blessed-blue": "blue",
    "graceful-gold": "yellow",
    "mindful-mint": "green",
    "pleasant-peach": "orange",
    "peaceful-pink": "pink",
    "lovely-lavender": "purple",
    "paper": "paper",
    // Also handle short names directly
    "blue": "blue",
    "yellow": "yellow",
    "green": "green",
    "orange": "orange",
    "pink": "pink",
    "purple": "purple",
  };
  
  const mappedColor = colorMap[colorName.toLowerCase()] || "blue";
  return `var(--color-${mappedColor})`;
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

export default function CardFeat({
  variant = "Note",
  title,
  content,
  imageUrl,
  count,
  color,
  className = "",
  lastUpdated,
  isPrivate = true,
  threadType
}: CardFeatProps) {
  return (
    <>
      <style>{`
        @keyframes staggerHover {
          0% {
            transform: rotate(4deg) translateY(0px);
          }
          50% {
            transform: rotate(4deg) translateY(-6px);
          }
          100% {
            transform: rotate(4deg) translateY(0px);
          }
        }

        .card-feat-container:hover .stagger-note:nth-child(1) { animation: staggerHover 0.6s ease-in-out 0s forwards; }
        .card-feat-container:hover .stagger-note:nth-child(2) { animation: staggerHover 0.6s ease-in-out 0.05s forwards; }
        .card-feat-container:hover .stagger-note:nth-child(3) { animation: staggerHover 0.6s ease-in-out 0.1s forwards; }
        .card-feat-container:hover .stagger-note:nth-child(4) { animation: staggerHover 0.6s ease-in-out 0.15s forwards; }
        .card-feat-container:hover .stagger-note:nth-child(5) { animation: staggerHover 0.6s ease-in-out 0.2s forwards; }
        .card-feat-container:hover .stagger-note:nth-child(6) { animation: staggerHover 0.6s ease-in-out 0.25s forwards; }
        .card-feat-container:hover .stagger-note:nth-child(7) { animation: staggerHover 0.6s ease-in-out 0.3s forwards; }
        .card-feat-container:hover .stagger-note:nth-child(8) { animation: staggerHover 0.6s ease-in-out 0.35s forwards; }
        .card-feat-container:hover .stagger-note:nth-child(9) { animation: staggerHover 0.6s ease-in-out 0.4s forwards; }
        .card-feat-container:hover .stagger-note:nth-child(10) { animation: staggerHover 0.6s ease-in-out 0.45s forwards; }
        .card-feat-container:hover .stagger-note:nth-child(11) { animation: staggerHover 0.6s ease-in-out 0.5s forwards; }
        .card-feat-container:hover .stagger-note:nth-child(12) { animation: staggerHover 0.6s ease-in-out 0.55s forwards; }
        .card-feat-container:hover .stagger-note:nth-child(13) { animation: staggerHover 0.6s ease-in-out 0.6s forwards; }
        .card-feat-container:hover .stagger-note:nth-child(14) { animation: staggerHover 0.6s ease-in-out 0.65s forwards; }
        .card-feat-container:hover .stagger-note:nth-child(15) { animation: staggerHover 0.6s ease-in-out 0.7s forwards; }
        .card-feat-container:hover .stagger-note:nth-child(16) { animation: staggerHover 0.6s ease-in-out 0.75s forwards; }
        .card-feat-container:hover .stagger-note:nth-child(17) { animation: staggerHover 0.6s ease-in-out 0.8s forwards; }
        .card-feat-container:hover .stagger-note:nth-child(18) { animation: staggerHover 0.6s ease-in-out 0.85s forwards; }
        .card-feat-container:hover .stagger-note:nth-child(19) { animation: staggerHover 0.6s ease-in-out 0.9s forwards; }
        .card-feat-container:hover .stagger-note:nth-child(20) { animation: staggerHover 0.6s ease-in-out 0.95s forwards; }
        .card-feat-container:hover .stagger-note:nth-child(21) { animation: staggerHover 0.6s ease-in-out 1s forwards; }
        .card-feat-container:hover .stagger-note:nth-child(22) { animation: staggerHover 0.6s ease-in-out 1.05s forwards; }
        .card-feat-container:hover .stagger-note:nth-child(23) { animation: staggerHover 0.6s ease-in-out 1.1s forwards; }
        .card-feat-container:hover .stagger-note:nth-child(24) { animation: staggerHover 0.6s ease-in-out 1.15s forwards; }
        .card-feat-container:hover .stagger-note:nth-child(25) { animation: staggerHover 0.6s ease-in-out 1.2s forwards; }
        .card-feat-container:hover .stagger-note:nth-child(26) { animation: staggerHover 0.6s ease-in-out 1.25s forwards; }
      `}</style>
      <div className={`card-feat-container ${className}`}>
        {variant === "Note" && (
          <div className="bg-white box-border flex flex-col gap-3 h-[180px] items-start justify-start max-w-[220px] overflow-clip pb-3 pt-2 px-2 relative rounded-2xl shrink-0 w-[220px]">
            {/* Light Paper background area */}
            <div className="basis-0 bg-[#f3f2ec] grow min-h-px min-w-px overflow-clip relative rounded-xl shrink-0 w-full">
              {/* Bookmark icon */}
              <div className="absolute left-3.5 size-5 top-[17px]">
                <svg className="block max-w-none size-full text-[#4a473d] opacity-20" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2z"/>
                </svg>
              </div>
              
            </div>
            
            {/* Text content area */}
            <div className="box-border flex gap-6 items-start justify-start px-2 py-0 relative shrink-0 w-full">
              <div className="basis-0 flex flex-col gap-2 grow items-start justify-start leading-[0] min-h-px min-w-px relative self-stretch shrink-0">
                {/* Title */}
                <div className="flex flex-col font-bold justify-center overflow-ellipsis overflow-hidden relative shrink-0 text-[#4a473d] text-[18px] w-full">
                  <p className="leading-[1.2] overflow-hidden text-ellipsis whitespace-nowrap">
                    {title || "Note from Our Founder"}
                  </p>
                </div>
                
                {/* Content */}
                <div className="flex flex-col font-normal justify-center overflow-ellipsis overflow-hidden relative shrink-0 text-[#78766f] text-[12px] w-full">
                  <p className="leading-[1.3] overflow-hidden text-ellipsis whitespace-nowrap">
                    {content ? stripHtml(content) : "Thank you so much for trying out this notes app designed for Bible study. It's been a project I've been working on for a good amount of time. The goal of Harvous is to be the digital tool and space for you and others to use for your Bible study."}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {variant === "Thread" && (
          <div className="bg-white box-border flex flex-col gap-3 h-[180px] items-start justify-start max-w-[220px] overflow-clip pb-3 pt-2 px-2 relative rounded-2xl shrink-0 w-[220px]">
            {/* Dynamic thread color background area */}
            <div 
              className="basis-0 grow min-h-px min-w-px overflow-clip relative rounded-xl shrink-0 w-full"
              style={{ backgroundColor: getColorCSSVariable(color) }}
            >
              {/* Icon based on thread type */}
              <div className="absolute left-3.5 size-5 top-[17px]">
                {threadType && threadType.toLowerCase() === 'default' ? (
                  // Layer group icon for Default thread type
                  <img 
                    src={LayerGroupIcon.src} 
                    alt="Layer group" 
                    className="block max-w-none size-full opacity-20"
                    style={{ filter: 'brightness(0) saturate(100%)' }}
                  />
                ) : (
                  // User icon for other thread types (or when threadType is not set)
                  <svg className="block max-w-none size-full text-[#4a473d] opacity-20" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
                  </svg>
                )}
              </div>
              
              {/* Overlapping cards */}
              <div className="absolute left-3 top-[66px] flex items-center">
                <OverlappingNotes count={count || 0} />
              </div>
              
            </div>
            
            {/* Text content area */}
            <div className="box-border flex gap-6 items-start justify-start px-2 py-0 relative shrink-0 w-full">
              <div className="basis-0 flex flex-col gap-2 grow items-start justify-start leading-[0] min-h-px min-w-px relative self-stretch shrink-0">
                {/* Title */}
                <div className="flex flex-col font-bold justify-center overflow-ellipsis overflow-hidden relative shrink-0 text-[#4a473d] text-[18px] w-full">
                  <p className="leading-[1.2] overflow-hidden text-ellipsis whitespace-nowrap">
                    {title || "Thread Title"}
                  </p>
                </div>
                
                {/* Content */}
                <div className="flex flex-col font-normal justify-center overflow-ellipsis overflow-hidden relative shrink-0 text-[#78766f] text-[12px] w-full">
                  <p className="leading-[1.3] overflow-hidden text-ellipsis whitespace-nowrap">
                    {lastUpdated || (content ? stripHtml(content) : "Subheading")}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {variant === "NoteImage" && (
          <div className="bg-white box-border flex flex-col gap-3 h-[180px] items-start justify-start max-w-[220px] overflow-clip pb-3 pt-2 px-2 relative rounded-2xl shrink-0 w-[220px]">
            {/* Image background area */}
            <div 
              className="basis-0 bg-center bg-cover bg-no-repeat grow min-h-px min-w-px overflow-clip relative rounded-xl shrink-0 w-full"
              style={imageUrl ? { backgroundImage: `url('${imageUrl}')` } : { backgroundColor: '#f3f2ec' }}
            >
            </div>
            
            {/* Text content area */}
            <div className="box-border flex gap-6 items-start justify-start px-2 py-0 relative shrink-0 w-full">
              <div className="basis-0 flex flex-col gap-2 grow items-start justify-start leading-[0] min-h-px min-w-px relative self-stretch shrink-0">
                {/* Title */}
                <div className="flex flex-col font-bold justify-center overflow-ellipsis overflow-hidden relative shrink-0 text-[#4a473d] text-[18px] w-full">
                  <p className="leading-[1.2] overflow-hidden text-ellipsis whitespace-nowrap">
                    {title || "Note Title"}
                  </p>
                </div>
                
                {/* Content */}
                <div className="flex flex-col font-normal justify-center overflow-ellipsis overflow-hidden relative shrink-0 text-[#78766f] text-[12px] w-full">
                  <p className="leading-[1.3] overflow-hidden text-ellipsis whitespace-nowrap">
                    {content ? stripHtml(content) : "Note content description"}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

