import React from 'react';
import SquareButton from '../SquareButton';

export interface NoteFormFooterProps {
  isSubmitting: boolean;
  onClose: () => void;
  noteType?: 'default' | 'scripture' | 'resource';
  duplicateInfo?: { exists: boolean; noteId?: string; simpleNoteId?: number; title?: string; description?: string; image?: string; url?: string } | null;
}

/**
 * Footer with close and create note buttons
 */
export default function NoteFormFooter({
  isSubmitting,
  onClose,
  noteType = 'default',
  duplicateInfo,
}: NoteFormFooterProps) {
  const isResource = noteType === 'resource';
  const isDuplicate = duplicateInfo?.exists === true;
  
  let buttonText: string;
  if (isDuplicate) {
    buttonText = 'Already Saved';
  } else if (isSubmitting) {
    buttonText = isResource ? 'Adding...' : 'Creating...';
  } else {
    buttonText = isResource ? 'Add Resource' : 'Create Note';
  }
  
  const isButtonDisabled = isSubmitting || isDuplicate;

  return (
    <div className="panel__footer--buttons">
      {/* Close button using SquareButton Close variant */}
      <SquareButton 
        variant="Close" 
        onClick={onClose}
      />
      
      {/* Create Note button - Button Default variant */}
      <button 
        type="submit"
        disabled={isButtonDisabled}
        data-outer-shadow
        className="btn-cta flex-1 group"
        tabIndex={3}
      >
        <span className="btn-cta__content">
          {buttonText}
        </span>
        <div className="btn-cta__shadow" />
      </button>
    </div>
  );
}

