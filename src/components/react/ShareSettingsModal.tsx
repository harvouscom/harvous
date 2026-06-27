import React, { useState } from 'react';
import Icon from './Icon';
import ButtonSmall from './ButtonSmall';

interface ShareSettingsModalProps {
  isShared: boolean;
  shareUrl: string | null;
  onToggle: (enabled: boolean) => Promise<void>;
  onRefresh: () => Promise<void>;
  isLoading: boolean;
}

export default function ShareSettingsModal({
  isShared,
  shareUrl,
  onToggle,
  onRefresh,
  isLoading
}: ShareSettingsModalProps) {
  const [copied, setCopied] = useState(false);
  const [showRefreshConfirm, setShowRefreshConfirm] = useState(false);

  const handleCopyLink = async () => {
    if (!shareUrl) return;

    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);

      // Show success toast
      window.dispatchEvent(new CustomEvent('toast', {
        detail: {
          message: 'Link copied to clipboard',
          type: 'success'
        }
      }));

      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
      window.dispatchEvent(new CustomEvent('toast', {
        detail: {
          message: 'Failed to copy link',
          type: 'error'
        }
      }));
    }
  };

  const handleToggle = async () => {
    if (isLoading) return;
    await onToggle(!isShared);
  };

  const handleRefresh = async () => {
    if (isLoading) return;
    setShowRefreshConfirm(false);
    await onRefresh();
  };

  return (
    <div className="share-settings-modal">
      {/* General access dropdown */}
      <div className="share-settings-modal__section">
        <p className="share-settings-modal__label">General access</p>

        <button
          type="button"
          onClick={handleToggle}
          disabled={isLoading}
          className="share-settings-modal__access-button"
        >
          <div className="share-settings-modal__access-icon">
            <Icon
              name={isShared ? 'globe' : 'lock'}
              size={16}
              style={{ color: 'var(--color-deep-grey)' }}
            />
          </div>
          <div className="share-settings-modal__access-text">
            <span className="share-settings-modal__access-title">
              {isShared ? 'Anyone with the link' : 'Only you'}
            </span>
            <span className="share-settings-modal__access-subtitle">
              {isShared ? 'Can view this thread' : 'Private thread'}
            </span>
          </div>
          <div className="share-settings-modal__access-chevron">
            <Icon name="caret-down" size={12} style={{ color: 'var(--color-pebble-grey)' }} />
          </div>
        </button>
      </div>

      {/* Share link section - only shown when shared */}
      {isShared && shareUrl && (
        <>
          <div className="share-settings-modal__divider" />

          <div className="share-settings-modal__section">
            <div className="share-settings-modal__link-container">
              <div className="share-settings-modal__link-icon">
                <Icon name="link" size={14} style={{ color: 'var(--color-pebble-grey)' }} />
              </div>
              <input
                type="text"
                readOnly
                value={shareUrl}
                className="share-settings-modal__link-input"
                onClick={(e) => (e.target as HTMLInputElement).select()}
              />
              <button
                type="button"
                onClick={handleCopyLink}
                disabled={isLoading}
                className="share-settings-modal__copy-button"
              >
                <Icon
                  name={copied ? 'check' : 'copy'}
                  size={14}
                  style={{ color: copied ? 'var(--color-green)' : 'var(--color-deep-grey)' }}
                />
                <span>{copied ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
          </div>

          <div className="share-settings-modal__divider" />

          {/* Refresh link section */}
          <div className="share-settings-modal__section">
            {showRefreshConfirm ? (
              <div className="share-settings-modal__refresh-confirm">
                <p className="share-settings-modal__refresh-warning">
                  This will create a new link. The old link will stop working.
                </p>
                <div className="share-settings-modal__refresh-buttons">
                  <ButtonSmall
                    type="button"
                    onClick={() => setShowRefreshConfirm(false)}
                    state="Secondary"
                  >
                    Cancel
                  </ButtonSmall>
                  <ButtonSmall
                    type="button"
                    onClick={handleRefresh}
                    state="Default"
                    disabled={isLoading}
                  >
                    {isLoading ? 'Refreshing...' : 'Refresh'}
                  </ButtonSmall>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowRefreshConfirm(true)}
                disabled={isLoading}
                className="share-settings-modal__refresh-button"
              >
                <Icon name="arrows-rotate" size={14} style={{ color: 'var(--color-pebble-grey)' }} />
                <span>Refresh link</span>
              </button>
            )}
          </div>
        </>
      )}

      <style>{`
        .share-settings-modal {
          display: flex;
          flex-direction: column;
          gap: 0;
          padding: 0.75rem;
          background: white;
          border-radius: 1rem;
          box-shadow: var(--shadow-small);
        }

        .share-settings-modal__section {
          padding: 0.5rem 0;
        }

        .share-settings-modal__label {
          font-size: 12px;
          font-weight: 600;
          color: var(--color-pebble-grey);
          margin: 0 0 0.5rem 0;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .share-settings-modal__access-button {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          width: 100%;
          padding: 0.75rem;
          background: var(--color-gradient-gray);
          border: none;
          border-radius: 0.75rem;
          cursor: pointer;
          transition: background-color 0.15s ease;
        }

        .share-settings-modal__access-button:hover:not(:disabled) {
          filter: brightness(0.98);
        }

        .share-settings-modal__access-button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .share-settings-modal__access-icon {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 32px;
          height: 32px;
          background: white;
          border-radius: 0.5rem;
          flex-shrink: 0;
        }

        .share-settings-modal__access-text {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          flex: 1;
          min-width: 0;
        }

        .share-settings-modal__access-title {
          font-size: 14px;
          font-weight: 600;
          color: var(--color-deep-grey);
        }

        .share-settings-modal__access-subtitle {
          font-size: 12px;
          color: var(--color-pebble-grey);
        }

        .share-settings-modal__access-chevron {
          flex-shrink: 0;
        }

        .share-settings-modal__divider {
          height: 1px;
          background: var(--color-light-paper);
          margin: 0;
        }

        .share-settings-modal__link-container {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.5rem 0.75rem;
          background: var(--color-gradient-gray);
          border-radius: 0.75rem;
        }

        .share-settings-modal__link-icon {
          flex-shrink: 0;
        }

        .share-settings-modal__link-input {
          flex: 1;
          min-width: 0;
          border: none;
          background: transparent;
          font-size: 13px;
          color: var(--color-deep-grey);
          outline: none;
          text-overflow: ellipsis;
        }

        .share-settings-modal__copy-button {
          display: flex;
          align-items: center;
          gap: 0.375rem;
          padding: 0.375rem 0.625rem;
          background: white;
          border: none;
          border-radius: 0.5rem;
          cursor: pointer;
          font-size: 13px;
          font-weight: 500;
          color: var(--color-deep-grey);
          transition: background-color 0.15s ease;
          flex-shrink: 0;
        }

        .share-settings-modal__copy-button:hover:not(:disabled) {
          background: var(--color-snow-white);
        }

        .share-settings-modal__copy-button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .share-settings-modal__refresh-button {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.5rem 0.75rem;
          background: transparent;
          border: none;
          border-radius: 0.5rem;
          cursor: pointer;
          font-size: 13px;
          color: var(--color-pebble-grey);
          transition: background-color 0.15s ease;
          width: 100%;
        }

        .share-settings-modal__refresh-button:hover:not(:disabled) {
          background: var(--color-gradient-gray);
          color: var(--color-deep-grey);
        }

        .share-settings-modal__refresh-button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .share-settings-modal__refresh-confirm {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }

        .share-settings-modal__refresh-warning {
          font-size: 13px;
          color: var(--color-stone-grey);
          margin: 0;
          line-height: 1.4;
        }

        .share-settings-modal__refresh-buttons {
          display: flex;
          gap: 0.5rem;
          justify-content: flex-end;
        }
      `}</style>
    </div>
  );
}
