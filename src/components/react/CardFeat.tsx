import React from 'react';
import OverlappingNotes from './OverlappingNotes';
import { stripHtml } from '@/utils/html-stripper';
import { getThreadColorCSS } from '@/utils/colors';

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

// Map long color names to short names for getThreadColorCSS
// Handles both short names (blue) and long names (blessed-blue)
function mapColorName(colorName: string | undefined | null): string {
  if (!colorName) return "blue"; // Default to blue
  
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
  
  return colorMap[colorName.toLowerCase()] || "blue";
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
  const bgStyle = variant === "Thread" 
    ? { backgroundColor: getThreadColorCSS(mapColorName(color)) }
    : variant === "NoteImage" && imageUrl 
      ? { backgroundImage: `url('${imageUrl}')` }
      : undefined;

  const bgClass = variant === "NoteImage" && imageUrl ? "card-feat__bg card-feat__bg--image" : "card-feat__bg";

  return (
    <div className={`card-feat ${className}`}>
      {/* Background area */}
      <div className={bgClass} style={bgStyle}>
        {/* Icon - Note uses bookmark, Thread uses user/layer icon */}
        {variant !== "NoteImage" && (
          <div className="card-feat__icon">
            {variant === "Thread" && threadType?.toLowerCase() === 'default' ? (
              <svg fill="currentColor" viewBox="0 0 576 512" style={{ filter: 'brightness(0) saturate(100%)' }}>
                <path d="M264.5 5.2c14.9-6.9 32.1-6.9 47 0l218.6 101c8.5 3.9 13.9 12.4 13.9 21.8s-5.4 17.9-13.9 21.8l-218.6 101c-14.9 6.9-32.1 6.9-47 0L45.9 149.8C37.4 145.8 32 137.3 32 128s5.4-17.9 13.9-21.8L264.5 5.2zM476.9 209.6l53.2 24.6c8.5 3.9 13.9 12.4 13.9 21.8s-5.4 17.9-13.9 21.8l-218.6 101c-14.9 6.9-32.1 6.9-47 0L45.9 277.8C37.4 273.8 32 265.3 32 256s5.4-17.9 13.9-21.8l53.2-24.6 152 70.2c23.4 10.8 50.4 10.8 73.8 0l152-70.2zm-152 198.2l152-70.2 53.2 24.6c8.5 3.9 13.9 12.4 13.9 21.8s-5.4 17.9-13.9 21.8l-218.6 101c-14.9 6.9-32.1 6.9-47 0L45.9 405.8C37.4 401.8 32 393.3 32 384s5.4-17.9 13.9-21.8l53.2-24.6 152 70.2c23.4 10.8 50.4 10.8 73.8 0z"/>
              </svg>
            ) : variant === "Thread" ? (
              <svg fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
              </svg>
            ) : (
              <svg fill="currentColor" viewBox="0 0 24 24">
                <path d="M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2z"/>
              </svg>
            )}
          </div>
        )}
        
        {/* Overlapping cards for Thread variant */}
        {variant === "Thread" && (
          <div className="card-feat__notes">
            <OverlappingNotes count={count || 0} />
          </div>
        )}
      </div>
      
      {/* Text content area */}
      <div className="card-feat__content">
        <div className="card-feat__text">
          <div className="card-feat__title">
            <p>
              {title || (variant === "Note" ? "Note from Our Founder" : variant === "Thread" ? "Thread Title" : "Note Title")}
            </p>
          </div>
          <div className="card-feat__description">
            <p>
              {variant === "Thread" 
                ? (lastUpdated || (content ? stripHtml(content) : "Subheading"))
                : (content ? stripHtml(content) : (variant === "Note" 
                    ? "Thank you so much for trying out this notes app designed for Bible study."
                    : "Note content description"))}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

