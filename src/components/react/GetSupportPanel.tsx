import React from 'react';
import SquareButton from './SquareButton';

interface GetSupportPanelProps {
  onClose?: () => void;
  version?: string;
  helpCenterUrl?: string;
  supportUrl?: string;
  feedbackUrl?: string;
  inBottomSheet?: boolean;
}

export default function GetSupportPanel({ 
  onClose,
  version,
  helpCenterUrl = 'https://help.harvous.com',
  supportUrl = 'https://support.harvous.com',
  feedbackUrl = 'https://feedback.harvous.com',
  inBottomSheet = false
}: GetSupportPanelProps) {
  // Use window.__APP_VERSION__ as fallback (set by service-worker-manager.js)
  const displayVersion = version || (typeof window !== 'undefined' && (window as any).__APP_VERSION__) || 'Unknown';
  // Handle close
  const handleClose = () => {
    if (onClose) {
      onClose();
    } else {
      window.dispatchEvent(new CustomEvent('closeProfilePanel'));
    }
  };

  // Handle external link clicks
  const handleExternalLink = (url: string) => {
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  // Handle email link clicks
  const handleEmailLink = (subject: string) => {
    const email = 'derek@harvous.com';
    const mailtoLink = `mailto:${email}?subject=${encodeURIComponent(subject)}`;
    window.location.href = mailtoLink;
  };

  return (
    <>
      <div className={`panel-wrapper ${inBottomSheet ? 'panel-wrapper--bottom-sheet' : ''}`}>
        {/* Content area - expands on mobile, fits content on desktop */}
        <div className={inBottomSheet ? "flex-1 flex flex-col min-h-0" : "flex flex-col"}>
          {/* Panel container */}
          <div className={`panel ${inBottomSheet ? 'panel--bottom-sheet' : ''}`}>
            {/* Header section */}
            <div className="panel__header">
              <div className="panel__title">
                <p>Get Support</p>
              </div>
            </div>
            
            {/* Content area */}
            <div className={`panel__body ${inBottomSheet ? 'panel__body--bottom-sheet' : ''}`}>
              <div className={`panel__content ${inBottomSheet ? 'panel__content--bottom-sheet' : ''}`}>
                
                {/* Visit our help center button */}
                <button
                  type="button"
                  onClick={() => handleExternalLink(helpCenterUrl)}
                  disabled
                  className="space-button relative rounded-3xl h-[64px] cursor-not-allowed transition-[scale,shadow] duration-300 pl-4 w-full opacity-50"
                  style={{ backgroundImage: 'var(--color-gradient-gray)', paddingRight: '8px' }}
                >
                  <div className="panel__list-item">
                    <div className="panel__list-item-text">
                      <span className="panel__list-item-label">
                        Visit our help center
                      </span>
                    </div>
                    <div className="panel__list-item-icon">
                      <div className="panel__list-item-icon-wrapper">
                        <div className="panel__external-icon">
                          <svg viewBox="0 0 512 512">
                            <path d="M320 0c-17.7 0-32 14.3-32 32s14.3 32 32 32l82.7 0L201.4 265.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L448 109.3l0 82.7c0 17.7 14.3 32 32 32s32-14.3 32-32l0-160c0-17.7-14.3-32-32-32L320 0zM80 32C35.8 32 0 67.8 0 112L0 432c0 44.2 35.8 80 80 80l320 0c44.2 0 80-35.8 80-80l0-112c0-17.7-14.3-32-32-32s-32 14.3-32 32l0 112c0 8.8-7.2 16-16 16L80 448c-8.8 0-16-7.2-16-16l0-320c0-8.8 7.2-16 16-16l112 0c17.7 0 32-14.3 32-32s-14.3-32-32-32L80 32z"/>
                          </svg>
                        </div>
                      </div>
                    </div>
                  </div>
                </button>

                {/* Reach out to support button */}
                <button
                  type="button"
                  onClick={() => handleEmailLink('Reach out to support')}
                  className="space-button relative rounded-3xl h-[64px] cursor-pointer transition-[scale,shadow] duration-300 pl-4 w-full"
                  style={{ backgroundImage: 'var(--color-gradient-gray)', paddingRight: '8px' }}
                >
                  <div className="panel__list-item">
                    <div className="panel__list-item-text">
                      <span className="panel__list-item-label">
                        Reach out to support
                      </span>
                    </div>
                    <div className="panel__list-item-icon">
                      <div className="panel__list-item-icon-wrapper">
                        <div className="panel__external-icon">
                          <svg viewBox="0 0 512 512">
                            <path d="M320 0c-17.7 0-32 14.3-32 32s14.3 32 32 32l82.7 0L201.4 265.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L448 109.3l0 82.7c0 17.7 14.3 32 32 32s32-14.3 32-32l0-160c0-17.7-14.3-32-32-32L320 0zM80 32C35.8 32 0 67.8 0 112L0 432c0 44.2 35.8 80 80 80l320 0c44.2 0 80-35.8 80-80l0-112c0-17.7-14.3-32-32-32s-32 14.3-32 32l0 112c0 8.8-7.2 16-16 16L80 448c-8.8 0-16-7.2-16-16l0-320c0-8.8 7.2-16 16-16l112 0c17.7 0 32-14.3 32-32s-14.3-32-32-32L80 32z"/>
                          </svg>
                        </div>
                      </div>
                    </div>
                  </div>
                </button>

                {/* Submit feedback button */}
                <button
                  type="button"
                  onClick={() => handleEmailLink('Submit feedback')}
                  className="space-button relative rounded-3xl h-[64px] cursor-pointer transition-[scale,shadow] duration-300 pl-4 w-full"
                  style={{ backgroundImage: 'var(--color-gradient-gray)', paddingRight: '8px' }}
                >
                  <div className="panel__list-item">
                    <div className="panel__list-item-text">
                      <span className="panel__list-item-label">
                        Submit feedback
                      </span>
                    </div>
                    <div className="panel__list-item-icon">
                      <div className="panel__list-item-icon-wrapper">
                        <div className="panel__external-icon">
                          <svg viewBox="0 0 512 512">
                            <path d="M320 0c-17.7 0-32 14.3-32 32s14.3 32 32 32l82.7 0L201.4 265.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L448 109.3l0 82.7c0 17.7 14.3 32 32 32s32-14.3 32-32l0-160c0-17.7-14.3-32-32-32L320 0zM80 32C35.8 32 0 67.8 0 112L0 432c0 44.2 35.8 80 80 80l320 0c44.2 0 80-35.8 80-80l0-112c0-17.7-14.3-32-32-32s-32 14.3-32 32l0 112c0 8.8-7.2 16-16 16L80 448c-8.8 0-16-7.2-16-16l0-320c0-8.8 7.2-16 16-16l112 0c17.7 0 32-14.3 32-32s-14.3-32-32-32L80 32z"/>
                          </svg>
                        </div>
                      </div>
                    </div>
                  </div>
                </button>

                {/* Version text */}
                <div className="panel__footer">
                  <p>Version {displayVersion}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom buttons */}
        <div className="panel__footer--buttons">
          {/* Back button - SquareButton Back variant */}
          <SquareButton 
            variant="Back"
            onClick={handleClose}
            inBottomSheet={inBottomSheet}
          />
        </div>
      </div>
    </>
  );
}
