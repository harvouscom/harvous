import React, { useState, useEffect, Fragment } from 'react';
import Icon from './Icon';
import ButtonSmall from './ButtonSmall';
import SquareButton from './SquareButton';
import { safeFetch } from '@/utils/safe-fetch';

interface NoteSharePanelProps {
  noteId: string;
  noteTitle?: string;
  onClose?: () => void;
  inBottomSheet?: boolean;
}

export default function NoteSharePanel({
  noteId,
  noteTitle = 'Note',
  onClose,
  inBottomSheet = false
}: NoteSharePanelProps) {
  const [isShared, setIsShared] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [noteType, setNoteType] = useState<string | null>(null);
  const [fetchError, setFetchError] = useState(false);

  const fetchShareStatus = async () => {
    setFetchError(false);
    try {
      const response = await safeFetch(`/api/notes/${noteId}/share`, { retries: 1 });
      if (response && response.ok) {
        const data = await response.json();
        setIsShared(data.isPublic);
        setShareUrl(data.shareUrl);
        setNoteType(data.noteType || 'default');
      } else {
        setFetchError(true);
      }
    } catch (error) {
      console.error('Error fetching share status:', error);
      setFetchError(true);
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch share status on mount
  useEffect(() => {
    setIsMounted(true);
    fetchShareStatus();
  }, [noteId]);

  const handleRetry = () => {
    setFetchError(false);
    setIsLoading(true);
    fetchShareStatus();
  };

  // Handle close
  const handleClose = () => {
    if (onClose) {
      onClose();
    } else {
      window.dispatchEvent(new CustomEvent('closeNoteSharePanel'));
    }
  };

  // Handle share toggle
  const handleToggle = async (enabled: boolean) => {
    if (isLoading) return;

    setIsLoading(true);
    try {
      const response = await fetch(`/api/notes/${noteId}/share`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: enabled ? 'enable' : 'disable' })
      });

      if (response.ok) {
        const data = await response.json();
        setIsShared(data.isPublic);
        setShareUrl(data.shareUrl);

        window.dispatchEvent(new CustomEvent('toast', {
          detail: {
            message: enabled ? 'Note is now shared' : 'Note is now private',
            type: 'success'
          }
        }));
      } else {
        const data = await response.json();
        window.dispatchEvent(new CustomEvent('toast', {
          detail: {
            message: data.error || 'Failed to update sharing',
            type: 'error'
          }
        }));
      }
    } catch (error) {
      console.error('Error toggling share:', error);
      window.dispatchEvent(new CustomEvent('toast', {
        detail: {
          message: 'Failed to update sharing',
          type: 'error'
        }
      }));
    } finally {
      setIsLoading(false);
    }
  };

  // Handle refresh share link
  const handleRefresh = async () => {
    if (isLoading || !isShared) return;

    setIsLoading(true);
    try {
      const response = await fetch(`/api/notes/${noteId}/share`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'refresh' })
      });

      if (response.ok) {
        const data = await response.json();
        setShareUrl(data.shareUrl);

        window.dispatchEvent(new CustomEvent('toast', {
          detail: {
            message: 'New share link generated',
            type: 'success'
          }
        }));
      } else {
        const data = await response.json();
        window.dispatchEvent(new CustomEvent('toast', {
          detail: {
            message: data.error || 'Failed to generate new link',
            type: 'error'
          }
        }));
      }
    } catch (error) {
      console.error('Error refreshing share link:', error);
      window.dispatchEvent(new CustomEvent('toast', {
        detail: {
          message: 'Failed to generate new link',
          type: 'error'
        }
      }));
    } finally {
      setIsLoading(false);
    }
  };

  // Handle copy link
  const handleCopyLink = async () => {
    if (!shareUrl) return;

    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);

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

  if (!isMounted) return null;

  // Scripture notes are always shared and don't need visibility toggle or refresh button
  const isScriptureNote = noteType === 'scripture';
  const showVisibilityToggle = !isScriptureNote;
  const showSharingUI = isShared || isScriptureNote;

  return (
    <div className={`note-share-panel panel-wrapper ${inBottomSheet ? 'panel-wrapper--bottom-sheet' : ''} w-full`}>
      {/* Content area - expands on mobile, fits content on desktop */}
      <div className={inBottomSheet ? "flex-1 flex flex-col min-h-0" : "flex flex-col"}>
        {/* Panel container */}
        <div className={`panel ${inBottomSheet ? 'panel--bottom-sheet' : ''}`}>
          {/* Header section */}
          <div className="panel__header">
            <div className="panel__title">
              <p>Share Note</p>
            </div>
          </div>

          {/* Content area */}
          <div className={`panel__body ${inBottomSheet ? 'panel__body--bottom-sheet' : ''}`}>
            <div className={`panel__content ${inBottomSheet ? 'panel__content--bottom-sheet' : ''}`}>
                {/* Visibility Toggle Section - hidden for scripture notes or when fetch failed */}
                {showVisibilityToggle && !fetchError && (
                <div className="note-share-panel__visibility">
                  {/* Private Option */}
                  <button
                    type="button"
                    onClick={() => handleToggle(false)}
                    disabled={isLoading}
                    className={`note-share-panel__option ${!isShared ? 'note-share-panel__option--active' : ''}`}
                  >
                    <div className="note-share-panel__option-content">
                      <div className="note-share-panel__icon-slot">
                        <Icon
                          name="user"
                          size={16}
                          style={{ color: 'var(--color-deep-grey)' }}
                        />
                      </div>
                      <span className="note-share-panel__option-text">
                        Only I can see this note
                      </span>
                      {!isShared && (
                        <div className="note-share-panel__check-slot">
                          <Icon
                            name="check"
                            size={16}
                            style={{ color: 'var(--color-deep-grey)' }}
                          />
                        </div>
                      )}
                    </div>
                  </button>

                  {/* Shared Option */}
                  <button
                    type="button"
                    onClick={() => handleToggle(true)}
                    disabled={isLoading}
                    className={`note-share-panel__option ${isShared ? 'note-share-panel__option--active' : ''}`}
                  >
                    <div className="note-share-panel__option-content">
                      <div className="note-share-panel__icon-slot">
                        <Icon
                          name="user-group"
                          size={16}
                          style={{ color: 'var(--color-deep-grey)' }}
                        />
                      </div>
                      <span className="note-share-panel__option-text">
                        Shared with link to anyone
                      </span>
                      {isShared && (
                        <div className="note-share-panel__check-slot">
                          <Icon
                            name="check"
                            size={16}
                            style={{ color: 'var(--color-deep-grey)' }}
                          />
                        </div>
                      )}
                    </div>
                  </button>
                </div>
                )}

                {/* Error state when fetch failed */}
                {fetchError ? (
                  <div className="note-share-panel__sharing-ui">
                    <div className="note-share-panel__placeholder">
                      <Icon name="circle-info" size={14} style={{ color: 'var(--color-pebble-grey)', flexShrink: 0 }} />
                      <span>Couldn&apos;t load share link.</span>
                    </div>
                    <button
                      type="button"
                      onClick={handleRetry}
                      disabled={isLoading}
                      className="btn-cta btn--secondary"
                    >
                      <span className="btn-cta__content">Retry</span>
                      <div className="btn-cta__shadow" />
                    </button>
                  </div>
                ) : showSharingUI ? (
                  <div className="note-share-panel__sharing-ui">
                    {shareUrl ? (
                      <Fragment>
                        {/* Shareable URL Input */}
                        <div className="note-share-panel__link-container">
                          <input
                            type="text"
                            readOnly
                            value={shareUrl}
                            className="note-share-panel__link-input"
                            onClick={(e) => {
                              const target = e.target as HTMLInputElement;
                              target.select();
                            }}
                          />
                          <ButtonSmall
                            type="button"
                            onClick={handleCopyLink}
                            disabled={isLoading}
                            state="Default"
                          >
                            {copied ? 'Copied' : 'Copy'}
                          </ButtonSmall>
                        </div>

                        {/* Generate New Link Button - hidden for scripture notes */}
                        {!isScriptureNote && (
                        <button
                          type="button"
                          onClick={handleRefresh}
                          disabled={isLoading}
                          className="btn-cta btn--secondary"
                        >
                          <span className="btn-cta__content">
                            Generate a New Sharable Link
                          </span>
                          <div className="btn-cta__shadow" />
                        </button>
                        )}
                      </Fragment>
                    ) : (
                      /* Placeholder while loading */
                      <div className="note-share-panel__placeholder">
                        <Icon name="circle-info" size={14} style={{ color: 'var(--color-pebble-grey)', flexShrink: 0 }} />
                        <span>Generating share link...</span>
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>

      {/* Bottom buttons */}
      <div className="panel__footer--buttons">
        {/* Back button */}
        <SquareButton
          variant="Back"
          onClick={handleClose}
          inBottomSheet={inBottomSheet}
        />
      </div>

      <style>{`
        .note-share-panel .panel__content {
          padding-bottom: 12px;
          gap: 12px;
        }
        .note-share-panel .panel__content::after {
          height: 0;
        }

        .note-share-panel__visibility {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          margin-bottom: 0;
        }

        .note-share-panel__option {
          display: flex;
          align-items: center;
          padding: 1rem;
          background: var(--color-gradient-gray);
          border: none;
          border-radius: 1.5rem;
          cursor: pointer;
          transition: all 0.15s ease;
          text-align: left;
          width: 100%;
          min-height: 64px;
        }

        .note-share-panel__option:hover:not(:disabled) {
          filter: brightness(0.98);
        }

        .note-share-panel__option:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .note-share-panel__option--active {
          box-shadow: 0px -3px 0px 0px rgba(120, 118, 111, 0.2) inset;
        }

        .note-share-panel__option-content {
          display: flex;
          align-items: center;
          width: 100%;
          gap: 0.75rem;
        }

        .note-share-panel__icon-slot {
          width: 16px;
          height: 16px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .note-share-panel__option-text {
          font-family: var(--font-sans);
          font-size: 18px;
          font-weight: 600;
          color: var(--color-deep-grey);
          flex: 1;
        }

        .note-share-panel__check-slot {
          width: 24px;
          height: 24px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .note-share-panel__sharing-ui {
          background: var(--color-snow-white);
          border-radius: 1.5rem;
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }

        .note-share-panel__link-container {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.5rem 0.75rem;
          background: var(--color-gradient-gray);
          border-radius: 1.5rem;
        }

        .note-share-panel__link-container .btn {
          flex-shrink: 0;
        }

        .note-share-panel__link-input {
          flex: 1;
          min-width: 0;
          border: none;
          background: transparent;
          font-size: 0.875rem;
          line-height: 1.25rem;
          color: var(--color-deep-grey);
          outline: none;
          text-overflow: ellipsis;
          font-family: var(--font-sans);
        }

        .note-share-panel__placeholder {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.75rem;
          background: var(--color-gradient-gray);
          border-radius: 0.75rem;
          font-size: 13px;
          color: var(--color-stone-grey);
          font-family: var(--font-sans);
        }
      `}</style>
    </div>
  );
}
