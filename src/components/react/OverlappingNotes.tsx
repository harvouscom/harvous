import React from 'react';

interface OverlappingNotesProps {
  count?: number;
  className?: string;
}

export default function OverlappingNotes({ 
  count = 3, 
  className = "" 
}: OverlappingNotesProps) {
  // Performance safeguard: limit to maximum 26 notes
  const maxNotes = Math.min(count, 26);

  return (
    <div className={`flex items-center overlapping-notes-container ${className}`}>
        {Array.from({ length: maxNotes }, (_, i) => (
          <div 
            key={i}
            className="overlapping-note stagger-note"
          />
        ))}
    </div>
  );
}
