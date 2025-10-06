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
    <div className={`flex items-center -space-x-[100px] overlapping-notes-container ${className}`}>
        {Array.from({ length: maxNotes }, (_, i) => (
          <div 
            key={i}
            className="bg-white h-[120px] w-[140px] rounded-xl shadow-[-4px_0px_4px_0px_rgba(0,0,0,0.05),0px_2px_4px_0px_rgba(0,0,0,0.05)] rotate-[4deg] stagger-note"
          />
        ))}
    </div>
  );
}
