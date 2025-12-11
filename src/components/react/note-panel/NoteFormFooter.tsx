import React from 'react';
import SquareButton from '../SquareButton';

export interface NoteFormFooterProps {
  isSubmitting: boolean;
  onClose: () => void;
  noteType?: 'default' | 'scripture' | 'resource';
  disabled?: boolean;
  buttonTextOverride?: string;
}

/**
 * Footer with close and create note buttons
 */
export default function NoteFormFooter({
  isSubmitting,
  onClose,
  noteType = 'default',
  disabled = false,
  buttonTextOverride,
}: NoteFormFooterProps) {
  const isResource = noteType === 'resource';
  
  // Use override if provided, otherwise use default text
  const buttonText = buttonTextOverride 
    ? buttonTextOverride
    : isSubmitting 
      ? (isResource ? 'Adding...' : 'Creating...')
      : (isResource ? 'Add Resource' : 'Create Note');

  const isButtonDisabled = isSubmitting || disabled;

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
        className={`btn-cta flex-1 group${isButtonDisabled ? ' btn-cta--disabled' : ''}`}
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

