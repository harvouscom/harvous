import React from 'react';
import type { ThreadNavEntry } from '@/hooks/useThreadNavHistory';

interface MobileNavDotsProps {
  entries: ThreadNavEntry[];
  currentIndex: number;
  onDotClick: (index: number) => void;
}

export default function MobileNavDots({ entries, currentIndex, onDotClick }: MobileNavDotsProps) {
  if (entries.length <= 1) return null;

  return (
    <div className="mobile-nav-dots" aria-label="Thread navigation history">
      {entries.map((entry, index) => (
        <button
          key={`${entry.path}-${index}`}
          type="button"
          className={`mobile-nav-dots__dot ${index === currentIndex ? 'is-active' : ''}`}
          aria-label={entry.type === 'thread' ? 'Go to thread' : `Go to note ${index}`}
          onClick={() => onDotClick(index)}
        />
      ))}
    </div>
  );
}
