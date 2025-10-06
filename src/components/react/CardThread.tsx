import React from 'react';
import OverlappingNotes from './OverlappingNotes';

interface Thread {
  id: string;
  title: string;
  subtitle?: string;
  color?: string;
  count?: number;
  accentColor?: string;
  lastUpdated?: string;
  createdAt?: string;
  isPrivate?: boolean;
  isPrimary?: boolean;
}

interface CardThreadProps {
  thread: Thread;
  className?: string;
}

// Helper function to format relative time (same as original)
function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffInMs = now.getTime() - date.getTime();
  const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));
  const diffInHours = Math.floor(diffInMs / (1000 * 60 * 60));
  const diffInMinutes = Math.floor(diffInMs / (1000 * 60));

  if (diffInDays > 0) {
    return diffInDays === 1 ? "1 day ago" : `${diffInDays} days ago`;
  } else if (diffInHours > 0) {
    return diffInHours === 1 ? "1 hour ago" : `${diffInHours} hours ago`;
  } else if (diffInMinutes > 0) {
    return diffInMinutes === 1 ? "1 minute ago" : `${diffInMinutes} minutes ago`;
  } else {
    return "Just now";
  }
}

export default function CardThread({ thread, className = "" }: CardThreadProps) {
  const {
    title = "Prayer Series",
    subtitle,
    color,
    count = 2,
    accentColor,
    lastUpdated,
    createdAt,
    isPrivate = true
  } = thread;

  // Convert color to CSS variable format
  const threadAccentColor = accentColor || (color ? `var(--color-${color})` : "var(--color-lovely-lavender)");

  // Format the timestamp properly
  let displaySubtitle = subtitle || "5 hours ago";
  if (lastUpdated) {
    displaySubtitle = lastUpdated;
  } else if (createdAt) {
    try {
      displaySubtitle = formatRelativeTime(new Date(createdAt));
    } catch (error) {
      displaySubtitle = createdAt;
    }
  }

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

        .card-thread-container:hover .stagger-note:nth-child(1) { animation: staggerHover 0.6s ease-in-out 0s forwards; }
        .card-thread-container:hover .stagger-note:nth-child(2) { animation: staggerHover 0.6s ease-in-out 0.05s forwards; }
        .card-thread-container:hover .stagger-note:nth-child(3) { animation: staggerHover 0.6s ease-in-out 0.1s forwards; }
        .card-thread-container:hover .stagger-note:nth-child(4) { animation: staggerHover 0.6s ease-in-out 0.15s forwards; }
        .card-thread-container:hover .stagger-note:nth-child(5) { animation: staggerHover 0.6s ease-in-out 0.2s forwards; }
        .card-thread-container:hover .stagger-note:nth-child(6) { animation: staggerHover 0.6s ease-in-out 0.25s forwards; }
        .card-thread-container:hover .stagger-note:nth-child(7) { animation: staggerHover 0.6s ease-in-out 0.3s forwards; }
        .card-thread-container:hover .stagger-note:nth-child(8) { animation: staggerHover 0.6s ease-in-out 0.35s forwards; }
        .card-thread-container:hover .stagger-note:nth-child(9) { animation: staggerHover 0.6s ease-in-out 0.4s forwards; }
        .card-thread-container:hover .stagger-note:nth-child(10) { animation: staggerHover 0.6s ease-in-out 0.45s forwards; }
        .card-thread-container:hover .stagger-note:nth-child(11) { animation: staggerHover 0.6s ease-in-out 0.5s forwards; }
        .card-thread-container:hover .stagger-note:nth-child(12) { animation: staggerHover 0.6s ease-in-out 0.55s forwards; }
        .card-thread-container:hover .stagger-note:nth-child(13) { animation: staggerHover 0.6s ease-in-out 0.6s forwards; }
        .card-thread-container:hover .stagger-note:nth-child(14) { animation: staggerHover 0.6s ease-in-out 0.65s forwards; }
        .card-thread-container:hover .stagger-note:nth-child(15) { animation: staggerHover 0.6s ease-in-out 0.7s forwards; }
        .card-thread-container:hover .stagger-note:nth-child(16) { animation: staggerHover 0.6s ease-in-out 0.75s forwards; }
        .card-thread-container:hover .stagger-note:nth-child(17) { animation: staggerHover 0.6s ease-in-out 0.8s forwards; }
        .card-thread-container:hover .stagger-note:nth-child(18) { animation: staggerHover 0.6s ease-in-out 0.85s forwards; }
        .card-thread-container:hover .stagger-note:nth-child(19) { animation: staggerHover 0.6s ease-in-out 0.9s forwards; }
        .card-thread-container:hover .stagger-note:nth-child(20) { animation: staggerHover 0.6s ease-in-out 0.95s forwards; }
        .card-thread-container:hover .stagger-note:nth-child(21) { animation: staggerHover 0.6s ease-in-out 1s forwards; }
        .card-thread-container:hover .stagger-note:nth-child(22) { animation: staggerHover 0.6s ease-in-out 1.05s forwards; }
        .card-thread-container:hover .stagger-note:nth-child(23) { animation: staggerHover 0.6s ease-in-out 1.1s forwards; }
        .card-thread-container:hover .stagger-note:nth-child(24) { animation: staggerHover 0.6s ease-in-out 1.15s forwards; }
        .card-thread-container:hover .stagger-note:nth-child(25) { animation: staggerHover 0.6s ease-in-out 1.2s forwards; }
        .card-thread-container:hover .stagger-note:nth-child(26) { animation: staggerHover 0.6s ease-in-out 1.25s forwards; }
      `}</style>
      <div className={`card-thread-container box-border flex flex-col gap-3 items-start justify-start overflow-hidden pb-0 pt-4 px-3 relative rounded-xl w-full h-[90px] ${className}`}>
      {/* Accent bar */}
      <div 
        className="absolute inset-y-0 left-0 w-11 rounded-l-xl" 
        style={{ backgroundColor: threadAccentColor }}
      />
      
      {/* Header content */}
      <div className="flex flex-col gap-2 items-start justify-center relative shrink-0 w-full">
        <div className="flex gap-6 items-start justify-start relative shrink-0 w-full">
          {/* User icon (Private) or User group icon (Shared) */}
          <div className="relative shrink-0 size-5">
            {isPrivate ? (
              // Single user icon for Private
              <svg className="block max-w-none size-full text-[var(--color-deep-grey)] opacity-20" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
              </svg>
            ) : (
              // User group icon for Shared
              <svg className="block max-w-none size-full text-[var(--color-deep-grey)] opacity-20" fill="currentColor" viewBox="0 0 640 640">
                <path d="M96 192C96 130.1 146.1 80 208 80C269.9 80 320 130.1 320 192C320 253.9 269.9 304 208 304C146.1 304 96 253.9 96 192zM32 528C32 430.8 110.8 352 208 352C305.2 352 384 430.8 384 528L384 534C384 557.2 365.2 576 342 576L74 576C50.8 576 32 557.2 32 534L32 528zM464 128C517 128 560 171 560 224C560 277 517 320 464 320C411 320 368 277 368 224C368 171 411 128 464 128zM464 368C543.5 368 608 432.5 608 512L608 534.4C608 557.4 589.4 576 566.4 576L421.6 576C428.2 563.5 432 549.2 432 534L432 528C432 476.5 414.6 429.1 385.5 391.3C408.1 376.6 435.1 368 464 368z"/>
              </svg>
            )}
          </div>
          
          {/* Text content */}
          <div className="basis-0 flex flex-col gap-2 grow items-center justify-center leading-[0] min-h-px min-w-px relative shrink-0 text-nowrap">
            {/* Title */}
            <div className="flex flex-col font-bold justify-center overflow-ellipsis overflow-hidden relative shrink-0 text-[var(--color-deep-grey)] text-[18px] w-full">
              <p className="leading-none overflow-hidden text-ellipsis whitespace-nowrap">
                {title}
              </p>
            </div>
            
            {/* Subtitle */}
            <div className="flex flex-col font-normal justify-center overflow-ellipsis overflow-hidden relative shrink-0 text-[var(--color-stone-grey)] text-[12px] w-full">
              <p className="leading-none overflow-hidden text-ellipsis whitespace-nowrap">
                {displaySubtitle}
              </p>
            </div>
          </div>
        </div>
      </div>
      
      {/* Overlapping notes area */}
      <div className="box-border flex h-[120px] items-start justify-start pl-0 py-0 relative shrink-0 w-full">
        <OverlappingNotes count={count} />
      </div>
      
      {/* Bottom shadow */}
      <div className="absolute inset-0 pointer-events-none rounded-xl shadow-[0px_-6px_0px_0px_inset_var(--color-gray)]" />
      </div>
    </>
  );
}
