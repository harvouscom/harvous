import React, { useState, useEffect, useRef } from 'react';
import Icon from './Icon';
import ButtonSmall from './ButtonSmall';

interface ThreadVisibilityDropdownProps {
  isShared: boolean;
  shareUrl: string | null;
  onToggle: (enabled: boolean) => Promise<void>;
  onRefresh?: () => Promise<void>;
  isLoading?: boolean;
  isEditMode?: boolean;
  // Optional label overrides for non-thread contexts (e.g. spaces)
  privateTriggerLabel?: string;
  sharedTriggerLabel?: string;
  privateOptionLabel?: string;
  sharedOptionLabel?: string;
  shareNotReadyLabel?: string;
}

export default function ThreadVisibilityDropdown({
  isShared,
  shareUrl,
  onToggle,
  onRefresh,
  isLoading = false,
  isEditMode = false,
  privateTriggerLabel = 'Only I can see this thread',
  sharedTriggerLabel = 'Shared with link to anyone',
  privateOptionLabel = 'Only I can see this thread',
  sharedOptionLabel = 'Turn on sharing with link to anyone',
  shareNotReadyLabel,
}: ThreadVisibilityDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [hoveredOption, setHoveredOption] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Handle click outside to close dropdown
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (dropdownRef.current && !dropdownRef.current.contains(target)) {
        setIsOpen(false);
        setHoveredOption(null);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
        setHoveredOption(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen]);

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

  const handleOptionClick = async (option: 'private' | 'shared') => {
    if (isLoading) return;

    if (option === 'private' && isShared) {
      await onToggle(false);
    } else if (option === 'shared' && !isShared) {
      await onToggle(true);
    }
    
    // Don't close dropdown immediately - let user see the sharing UI
    // Only close if clicking the same option
    if ((option === 'private' && !isShared) || (option === 'shared' && isShared)) {
      setIsOpen(false);
      setHoveredOption(null);
    }
  };

  const handleGenerateLink = async () => {
    if (!onRefresh || isLoading) return;
    await onRefresh();
  };

  const shouldShowSharingUI = isShared;

  return (
    <div className="thread-visibility-dropdown" ref={dropdownRef}>
      {/* Dropdown Trigger */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        disabled={isLoading}
        className="thread-visibility-dropdown__trigger space-button h-[64px] w-full"
        style={{
          backgroundImage: 'var(--color-gradient-gray)'
        }}
      >
        <div className="flex items-center justify-between gap-3 relative w-full h-full">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="size-4 flex items-center justify-center shrink-0">
              <Icon 
                name={isShared ? "user-group" : "user"} 
                size={16} 
                style={{ 
                  color: 'var(--color-deep-grey)'
                }} 
              />
            </div>
            <span 
              className="font-sans text-[18px] font-semibold whitespace-nowrap truncate text-[var(--color-deep-grey)]"
            >
              {isShared ? sharedTriggerLabel : privateTriggerLabel}
            </span>
          </div>
          <div className="size-4 flex items-center justify-center shrink-0">
            <Icon 
              name={isOpen ? 'chevron-up' : 'chevron-down'} 
              size={16} 
              style={{ 
                color: 'var(--color-deep-grey)'
              }} 
            />
          </div>
        </div>
      </button>

      {/* Dropdown Options */}
      {isOpen && (
        <div className="thread-visibility-dropdown__options">
          {/* Private Option */}
          <button
            type="button"
            onClick={() => handleOptionClick('private')}
            onMouseEnter={() => setHoveredOption('private')}
            onMouseLeave={() => setHoveredOption(isShared ? 'shared' : null)}
            disabled={isLoading}
            className="thread-visibility-dropdown__option"
          >
            <div className="thread-visibility-dropdown__option-content">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className="thread-visibility-dropdown__icon-slot">
                  <Icon 
                    name="user" 
                    size={16} 
                    style={{ color: 'var(--color-deep-grey)' }} 
                  />
                </div>
                <span className="thread-visibility-dropdown__option-text">
                  {isShared
                    ? `Turn off sharing so ${privateOptionLabel.charAt(0).toLowerCase() + privateOptionLabel.slice(1)}`
                    : privateOptionLabel}
                </span>
              </div>
              {!isShared && (
                <div className="thread-visibility-dropdown__check-slot">
                  <span className="thread-visibility-dropdown__check" aria-hidden="true">
                    <Icon 
                      name="check" 
                      size={16} 
                      style={{ color: 'var(--color-deep-grey)' }} 
                    />
                  </span>
                </div>
              )}
            </div>
          </button>

          {/* Shared Option */}
          <button
            type="button"
            onClick={() => handleOptionClick('shared')}
            disabled={isLoading}
            className="thread-visibility-dropdown__option"
          >
            <div className="thread-visibility-dropdown__option-content">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className="thread-visibility-dropdown__icon-slot">
                  <Icon 
                    name="user-group" 
                    size={16} 
                    style={{ color: 'var(--color-deep-grey)' }} 
                  />
                </div>
                <span className="thread-visibility-dropdown__option-text">
                  {isShared ? sharedTriggerLabel : sharedOptionLabel}
                </span>
              </div>
              {isShared && (
                <div className="thread-visibility-dropdown__check-slot">
                  <span className="thread-visibility-dropdown__check" aria-hidden="true">
                    <Icon 
                      name="check" 
                      size={16} 
                      style={{ color: 'var(--color-deep-grey)' }} 
                    />
                  </span>
                </div>
              )}
            </div>
          </button>

          {/* Sharing UI - shown when shared is active or when hovering "Turn on sharing" */}
          {shouldShowSharingUI && (
            <div className="thread-visibility-dropdown__sharing-ui">
              {isEditMode && shareUrl ? (
                <>
                  {/* Shareable URL Input */}
                  <div className="thread-visibility-dropdown__link-container">
                    <input
                      type="text"
                      readOnly
                      value={shareUrl}
                      className="thread-visibility-dropdown__link-input"
                      onClick={(e) => (e.target as HTMLInputElement).select()}
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

                  {/* Generate New Link Button */}
                  {onRefresh && (
                    <button
                      type="button"
                      onClick={handleGenerateLink}
                      disabled={isLoading}
                      className="btn-cta btn--secondary"
                    >
                      <span className="btn-cta__content">
                        Generate a New Sharable Link
                      </span>
                      <div className="btn-cta__shadow" />
                    </button>
                  )}
                </>
              ) : (
                /* Create mode or edit mode without shareUrl - show placeholder */
                <div className="thread-visibility-dropdown__placeholder">
                  <Icon name="circle-info" size={14} style={{ color: 'var(--color-pebble-grey)', flexShrink: 0 }} />
                  <span>
                    {shareNotReadyLabel ?? (isEditMode
                      ? 'Share link will be available after enabling sharing'
                      : 'Share link will be available after creating the thread')}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <style>{`
        .thread-visibility-dropdown {
          position: relative;
          width: 100%;
        }

        .thread-visibility-dropdown__trigger {
          border-radius: 1.5rem;
          transition: all 0.2s ease;
        }

        .thread-visibility-dropdown__trigger:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .thread-visibility-dropdown__options {
          position: absolute;
          top: calc(100% + 0.5rem);
          left: 0;
          right: 0;
          background: white;
          border-radius: 1.5rem;
          box-shadow: 0px 3px 20px 0px rgba(120, 118, 111, 0.15);
          overflow: hidden;
          z-index: 1000;
          display: flex;
          flex-direction: column;
        }

        .thread-visibility-dropdown__option {
          display: flex;
          align-items: center;
          padding: 0;
          background: transparent;
          border: none;
          cursor: pointer;
          transition: background-color 0.15s ease;
          text-align: left;
          width: 100%;
          min-height: 48px;
        }

        .thread-visibility-dropdown__option:hover:not(:disabled) {
          background: var(--color-gradient-gray);
        }

        .thread-visibility-dropdown__option:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .thread-visibility-dropdown__option-content {
          display: flex;
          align-items: center;
          justify-content: space-between;
          width: 100%;
          padding-top: 1rem;
          padding-bottom: 1rem;
          padding-left: 1rem;
          padding-right: 1rem;
          gap: 0.75rem;
        }

        .thread-visibility-dropdown__icon-slot {
          width: 16px;
          height: 16px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .thread-visibility-dropdown__option-text {
          font-family: var(--font-sans);
          font-size: 18px;
          font-weight: 600;
          color: var(--color-deep-grey);
          text-align: left;
        }

        .thread-visibility-dropdown__check-slot {
          width: 24px;
          height: 24px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .thread-visibility-dropdown__check {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 24px;
          height: 24px;
        }

        .thread-visibility-dropdown__chevron-slot {
          width: 24px;
          height: 24px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .thread-visibility-dropdown__sharing-ui {
          padding: 0.75rem 1rem 1rem 1rem;
          background: var(--color-snow-white);
          border-radius: 1.5rem;
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }

        .thread-visibility-dropdown__link-container {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.5rem 0.75rem;
          background: var(--color-gradient-gray);
          border-radius: 1.5rem;
        }

        .thread-visibility-dropdown__link-container .btn {
          flex-shrink: 0;
        }

        .thread-visibility-dropdown__link-input {
          flex: 1;
          min-width: 0;
          border: none;
          background: transparent;
          font-size: 0.875rem; /* 14px - matches text-sm */
          line-height: 1.25rem;
          color: var(--color-deep-grey);
          outline: none;
          text-overflow: ellipsis;
          font-family: var(--font-sans);
        }


        .thread-visibility-dropdown__placeholder {
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
