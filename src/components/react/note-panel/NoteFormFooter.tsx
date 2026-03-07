import React from 'react';
import SquareButton from '../SquareButton';

export interface NoteFormFooterProps {
  isSubmitting: boolean;
  onClose: () => void;
  noteType?: 'default' | 'scripture' | 'resource';
  duplicateInfo?: { exists: boolean; noteId?: string; simpleNoteId?: number; title?: string; description?: string; image?: string; url?: string } | null;
  isLimitReached?: boolean;
  currentCount?: number;
  limit?: number;
  showCloseButton?: boolean;
  inBottomSheet?: boolean;
}

/**
 * Footer with back and create note buttons
 */
export default function NoteFormFooter({
  isSubmitting,
  onClose,
  noteType = 'default',
  duplicateInfo,
  isLimitReached = false,
  currentCount = 0,
  limit = 500,
  showCloseButton = true,
  inBottomSheet = false,
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

  // Handle upgrade button click
  const handleUpgradeClick = () => {
    const upgradeUrl = '/upgrade';
    const returnUrl = '/notes/new';
    window.location.href = `${upgradeUrl}?return=${encodeURIComponent(returnUrl)}`;
  };

  return (
    <div className="panel__footer--buttons">
      {showCloseButton ? (
        <SquareButton variant="Back" onClick={onClose} inBottomSheet={inBottomSheet} />
      ) : null}
      
      {/* Conditionally render limit reached UI or Create Note button */}
      {isLimitReached ? (
        <div className="limit-reached-container flex-1 flex flex-row items-center justify-between gap-3 px-4" style={{
          background: 'linear-gradient(168.707deg, rgb(255, 255, 255) 11.711%, rgb(248, 248, 248) 71.325%)',
          borderRadius: '12px',
          height: '64px',
        }}>
          <p className="limit-reached-message font-sans font-semibold text-[16px] flex-1 text-wrap-pretty" style={{
            color: 'var(--color-deep-grey)',
            margin: 0,
            lineHeight: '1.2',
          }}>
            You've used all {limit.toLocaleString()} notes. Upgrade for unlimited.
          </p>
          <button
            type="button"
            onClick={handleUpgradeClick}
            className="btn btn--sm btn--primary flex-shrink-0"
          >
            <div className="btn__content">
              Upgrade
            </div>
            <div className="btn__shadow-overlay" />
          </button>
        </div>
      ) : (
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
      )}
    </div>
  );
}

