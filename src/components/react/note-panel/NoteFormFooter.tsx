import React from 'react';
import SquareButton from '../SquareButton';

export interface NoteFormFooterProps {
  isSubmitting: boolean;
  onClose: () => void;
  noteType?: 'default' | 'scripture' | 'resource';
}

/**
 * Footer with close and create note buttons
 */
export default function NoteFormFooter({
  isSubmitting,
  onClose,
  noteType = 'default',
}: NoteFormFooterProps) {
  const isResource = noteType === 'resource';
  const buttonText = isSubmitting 
    ? (isResource ? 'Adding...' : 'Creating...')
    : (isResource ? 'Add Resource' : 'Create Note');

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
        disabled={isSubmitting}
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

