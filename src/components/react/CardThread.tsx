import React, { useState, useEffect } from 'react';
import OverlappingNotes from './OverlappingNotes';
import { getRelativeTime } from '@/utils/date-formatting';

interface Thread {
  id: string;
  title: string;
  subtitle?: string;
  color?: string;
  count?: number;
  accentColor?: string;
  lastUpdated?: string;
  lastVisited?: Date | string | null;
  createdAt?: string;
  isPrivate?: boolean;
  isPrimary?: boolean;
}

interface CardThreadProps {
  thread: Thread;
  className?: string;
}

export default function CardThread({ thread, className = "" }: CardThreadProps) {
  const {
    title = "Prayer Series",
    subtitle,
    color,
    count = 2,
    accentColor,
    lastUpdated,
    lastVisited,
    createdAt,
    isPrivate = true
  } = thread;

  // Convert color to CSS variable format
  const threadAccentColor = accentColor || (color ? `var(--color-${color})` : "var(--color-purple)");

  // Format the timestamp properly - prioritize time over note count (subtitle)
  // Use useState/useEffect to avoid hydration mismatch
  // Always start with "recently" to match server render, then update after mount
  // This ensures server and client render the same initial value
  const [displaySubtitle, setDisplaySubtitle] = React.useState<string>("recently");

  // Update timestamp after hydration to show actual relative time
  // Prioritize lastVisited over lastUpdated (which may fall back to updatedAt/createdAt)
  // This runs only on the client after hydration to avoid mismatch
  React.useEffect(() => {
    // Only run on client (after hydration)
    if (typeof window === 'undefined') return;
    
    // Priority 1: Use lastVisited if available (most accurate for user's actual visit time)
    if (lastVisited) {
      try {
        const date = lastVisited instanceof Date ? lastVisited : new Date(lastVisited);
        if (!isNaN(date.getTime())) {
          setDisplaySubtitle(getRelativeTime(date));
          return;
        }
      } catch (error) {
        // Fall through
      }
    }
    
    // Priority 2: Fall back to lastUpdated (which is computed as lastVisited || updatedAt || createdAt)
    if (lastUpdated) {
      // Check if lastUpdated is already a relative time string (from server)
      if (typeof lastUpdated === 'string' && 
          (lastUpdated.includes('ago') || lastUpdated.includes('day') || lastUpdated.includes('hour') || 
           lastUpdated.includes('minute') || lastUpdated.includes('Just now') || lastUpdated.includes('recently'))) {
        setDisplaySubtitle(lastUpdated);
        return;
      }
      
      // Otherwise, parse as date
      try {
        const date = new Date(lastUpdated);
        if (!isNaN(date.getTime())) {
          setDisplaySubtitle(getRelativeTime(date));
          return;
        }
      } catch (error) {
        // Fall through
      }
    }
    
    // Priority 3: Fall back to createdAt
    if (createdAt) {
      try {
        const date = new Date(createdAt);
        if (!isNaN(date.getTime())) {
          setDisplaySubtitle(getRelativeTime(date));
          return;
        }
      } catch (error) {
        // Fall through
      }
    }
    
    // If all else fails, keep "recently"
  }, [lastVisited, lastUpdated, createdAt]);

  return (
    <div className={`card card-thread ${className}`}>
      {/* Accent bar */}
      <div className="card-thread__accent" style={{ backgroundColor: threadAccentColor }} />
      
      {/* Header content */}
      <div className="card-thread__header">
        <div className="card-thread__header-row">
          {/* User icon (Private) or User group icon (Shared) */}
          <div className="card-thread__icon">
            {isPrivate ? (
              <svg fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
              </svg>
            ) : (
              <svg fill="currentColor" viewBox="0 0 640 640">
                <path d="M96 192C96 130.1 146.1 80 208 80C269.9 80 320 130.1 320 192C320 253.9 269.9 304 208 304C146.1 304 96 253.9 96 192zM32 528C32 430.8 110.8 352 208 352C305.2 352 384 430.8 384 528L384 534C384 557.2 365.2 576 342 576L74 576C50.8 576 32 557.2 32 534L32 528zM464 128C517 128 560 171 560 224C560 277 517 320 464 320C411 320 368 277 368 224C368 171 411 128 464 128zM464 368C543.5 368 608 432.5 608 512L608 534.4C608 557.4 589.4 576 566.4 576L421.6 576C428.2 563.5 432 549.2 432 534L432 528C432 476.5 414.6 429.1 385.5 391.3C408.1 376.6 435.1 368 464 368z"/>
              </svg>
            )}
          </div>
          
          {/* Text content */}
          <div className="card-thread__text">
            <div className="card-thread__title">
              <p>{title}</p>
            </div>
            <div className="card-thread__subtitle">
              <p>{displaySubtitle}</p>
            </div>
          </div>
        </div>
      </div>
      
      {/* Overlapping notes area */}
      <div className="card-thread__notes">
        <OverlappingNotes count={count} />
      </div>
      
      {/* Bottom shadow */}
      <div className="card-thread__shadow" />
    </div>
  );
}
