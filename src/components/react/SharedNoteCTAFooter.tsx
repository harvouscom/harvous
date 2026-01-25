import React from 'react';

interface SharedNoteCTAFooterProps {
  shareToken: string;
  isAuthenticated: boolean;
}

export default function SharedNoteCTAFooter({ 
  shareToken, 
  isAuthenticated 
}: SharedNoteCTAFooterProps) {
  return (
    <div className="shared-page__cta-wrapper">
      {/* Toast notification (absolutely positioned above button) */}
      <div id="shared-page-toast" className="shared-page__toast" aria-live="polite">
        <span id="shared-page-toast-message"></span>
      </div>

      {/* CTA Button */}
      <button
        type="button"
        id="add-to-harvous-btn"
        className="btn btn--lg btn--primary shared-page__cta-button"
        data-share-token={shareToken}
        data-authenticated={isAuthenticated ? 'true' : 'false'}
      >
        <div className="btn__content">
          <span className="shared-page__cta-text">Add this to my Harvous</span>
        </div>
        <div className="btn__shadow-overlay" />
      </button>
    </div>
  );
}
