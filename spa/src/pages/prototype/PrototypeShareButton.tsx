import { useCallback, useRef, useState } from 'react';
import Icon from '@/components/react/Icon';
import PrototypeSharePopover from './PrototypeSharePopover';

interface PrototypeShareButtonProps {
  noteId: string;
  isPublic: boolean;
  shareToken: string | null;
  /** Hide entirely when the note can't be shared (encrypted, onboarding, etc.). */
  hidden?: boolean;
}

/**
 * Bottom-bar pill that triggers the share popover. Mirrors the
 * `.proto-note-action-bar__pill--connect` shape so it visually slots in
 * alongside "Connect note". When the note is public the pill takes the
 * accent-blue style so the user can see share-state at a glance.
 */
export default function PrototypeShareButton({
  noteId,
  isPublic,
  shareToken,
  hidden = false,
}: PrototypeShareButtonProps) {
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);

  const open = useCallback(() => {
    if (!buttonRef.current) return;
    setAnchorRect(buttonRef.current.getBoundingClientRect());
  }, []);

  const close = useCallback(() => setAnchorRect(null), []);

  if (hidden) return null;

  const pillClasses = [
    'proto-note-action-bar__pill',
    isPublic
      ? 'proto-note-action-bar__pill--share-active'
      : 'proto-note-action-bar__pill--connect',
  ].join(' ');

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className={pillClasses}
        title={isPublic ? 'This note has a share link' : 'Create a share link'}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => {
          if (anchorRect) close();
          else open();
        }}
        aria-haspopup="dialog"
        aria-expanded={anchorRect !== null}
      >
        <Icon name="link" size={14} className="proto-note-action-bar__pill-git" aria-hidden />
        <span>{isPublic ? 'Sharing' : 'Share'}</span>
      </button>

      {anchorRect ? (
        <PrototypeSharePopover
          noteId={noteId}
          isPublic={isPublic}
          shareToken={shareToken}
          anchorRect={anchorRect}
          onDismiss={close}
        />
      ) : null}
    </>
  );
}
