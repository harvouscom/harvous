import React, { useState, useEffect } from 'react';
import SquareButton from './SquareButton';

interface AboutHarvousPanelProps {
  onClose?: () => void;
  letterHtml?: string;
  inBottomSheet?: boolean;
}

export default function AboutHarvousPanel({
  onClose,
  letterHtml = '',
  inBottomSheet = false
}: AboutHarvousPanelProps) {
  const [resolvedHtml, setResolvedHtml] = useState(letterHtml);

  useEffect(() => {
    if (letterHtml) {
      setResolvedHtml(letterHtml);
      return;
    }
    fetch('/api/about/founder-letter')
      .then(r => r.json())
      .then(d => { if (d.html) setResolvedHtml(d.html); })
      .catch(() => {});
  }, [letterHtml]);

  // Handle close
  const handleClose = () => {
    if (onClose) {
      onClose();
    } else {
      window.dispatchEvent(new CustomEvent('closeProfilePanel'));
    }
  };

  return (
    <div className="panel-wrapper panel-wrapper--bottom-sheet w-full">
      {/* Layout wrapper for proper height handling */}
      <div className="form-layout">
        {/* Content area that expands to fill available space */}
        <div className="form-layout--expand">
          {/* Panel container */}
          <div className="panel panel--bottom-sheet">
            {/* Header section */}
            <div className="panel__header">
              <div className="panel__title">
                <p>Letter from the Founder</p>
              </div>
            </div>
            
            {/* Content area */}
            <div className="panel__body panel__body--bottom-sheet">
              <div className="panel__content panel__content--bottom-sheet about-harvous-panel__content">
                <div className="panel__content-scroll">
                <div className="about-harvous-paper-stack">
                  <div className="about-harvous-paper-stack__paper about-harvous-paper--drop-in">
                    {/* Letter content (markdown -> HTML) */}
                    <div className="about-harvous-letter" dangerouslySetInnerHTML={{ __html: resolvedHtml }} />

                    {/* Signature image */}
                    <div className="about-harvous-signature">
                      <img
                        src="/derekcastelli-signature.svg"
                        alt="Derek Casteilli's signature"
                        className="about-harvous-signature__img"
                      />
                    </div>

                    <p className="about-harvous-attribution">
                      Interface icons include{' '}
                      <a href="https://fontawesome.com" target="_blank" rel="noreferrer noopener">
                        Font Awesome
                      </a>{' '}
                      Free icons by{' '}
                      <a href="https://fontawesome.com/" target="_blank" rel="noreferrer noopener">
                        Fonticons, Inc.
                      </a>{' '}
                      (
                      <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer noopener">
                        CC BY 4.0
                      </a>
                      ).
                    </p>
                  </div>
                </div>
                </div>
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
  );
}
