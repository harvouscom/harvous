import React from 'react';
import SquareButton from '../SquareButton';

export interface NoteFormFooterProps {
  isSubmitting: boolean;
  onClose: () => void;
}

/**
 * Footer with close and create note buttons
 */
export default function NoteFormFooter({
  isSubmitting,
  onClose,
}: NoteFormFooterProps) {
  return (
    <div className="flex items-center justify-between gap-3 shrink-0">
      {/* Close button using SquareButton Close variant */}
      <SquareButton 
        variant="Close" 
        onClick={onClose}
      />
      
      {/* Create Note button - Button Default variant */}
      <button 
        type="submit"
        disabled={isSubmitting}
        data-outer-shadow
        className="group relative rounded-3xl cursor-pointer transition-[scale,shadow] duration-300 pb-7 pt-6 px-6 flex items-center justify-center font-sans font-semibold text-[18px] leading-[0] text-nowrap text-[var(--color-fog-white)] h-[64px] flex-1 shadow-[0px_4px_4px_0px_rgba(0,0,0,0.25)] disabled:opacity-50 disabled:cursor-not-allowed"
        style={{ backgroundColor: 'var(--color-bold-blue)' }}
        tabIndex={3}
      >
        <div className="relative shrink-0 transition-transform duration-125">
          {isSubmitting ? 'Creating...' : 'Create Note'}
        </div>
        <div className="absolute inset-0 pointer-events-none rounded-3xl transition-shadow duration-125 shadow-[0px_-8px_0px_0px_rgba(0,0,0,0.1)_inset] group-active:!shadow-[0px_-2px_0px_0px_rgba(0,0,0,0.1)_inset]" />
      </button>
    </div>
  );
}

