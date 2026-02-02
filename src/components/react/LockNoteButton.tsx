import React, { useEffect, useRef } from 'react';
import ButtonSmall from './ButtonSmall';
import Icon from './Icon';
import { isNoteUnlocked, lockNote } from '@/utils/note-unlock-state';
import { toast } from '@/utils/toast';

interface LockNoteButtonProps {
  noteId: string;
  noteContent: string;
  isEncrypted: boolean;
  /** Server-side contentEncrypted; used for removeLock so we open panel even when unlocked in session. */
  serverContentEncrypted?: boolean;
  /** Encrypted content from server; used for removeLock so panel can decrypt with PIN (noteContent may be decrypted when unlocked in session). */
  serverNoteContent?: string;
  onContentChange?: (newContent: string, encrypted: boolean) => void;
  onLockStateChange?: (isLocked: boolean) => void;
  disabled?: boolean;
  /** When true, do not render the button; panel still opens when focusLockNote fires for this note. */
  hideButton?: boolean;
}

export default function LockNoteButton({
  noteId,
  noteContent,
  isEncrypted,
  serverContentEncrypted,
  serverNoteContent,
  onContentChange,
  onLockStateChange,
  disabled = false,
  hideButton = false
}: LockNoteButtonProps) {
  const isUnlocked = isNoteUnlocked(noteId);

  const handleButtonClick = async () => {
    if (isEncrypted && isUnlocked) {
      lockNote(noteId);
      onLockStateChange?.(true);
      toast.success('Note locked');
    } else if (isEncrypted && !isUnlocked) {
      window.dispatchEvent(new CustomEvent('openPinEntryPanel', {
        detail: {
          noteId,
          mode: 'unlock',
          noteContent: serverNoteContent ?? noteContent,
          isEncrypted: true
        }
      }));
    } else {
      // Locking a note: use account PIN (set in profile). Fetch hasLockPinSet to choose flow.
      let hasLockPinSet = false;
      try {
        const res = await fetch('/api/user/get-profile', { credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          hasLockPinSet = !!data.hasLockPinSet;
        }
      } catch {
        // fallback: open setForAccount so user can set PIN and lock
      }
      const mode = hasLockPinSet ? 'lockWithAccountPin' : 'setForAccount';
      window.dispatchEvent(new CustomEvent('openPinEntryPanel', {
        detail: {
          noteId,
          mode,
          noteContent,
          isEncrypted: false
        }
      }));
    }
  };

  const handleButtonClickRef = useRef(handleButtonClick);
  handleButtonClickRef.current = handleButtonClick;
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.contentId == null || String(detail.contentId) !== String(noteId)) return;
      if (detail?.removeLock === true && (serverContentEncrypted ?? isEncrypted)) {
        window.dispatchEvent(new CustomEvent('openPinEntryPanel', {
          detail: {
            noteId,
            mode: 'removeLock',
            noteContent: serverNoteContent ?? noteContent,
            isEncrypted: true
          }
        }));
        return;
      }
      handleButtonClickRef.current();
    };
    window.addEventListener('focusLockNote', handler);
    return () => window.removeEventListener('focusLockNote', handler);
  }, [noteId, isEncrypted, serverContentEncrypted, serverNoteContent, noteContent]);

  const getButtonLabel = () => {
    if (isEncrypted) return isUnlocked ? 'Lock' : 'Unlock';
    return 'Lock';
  };

  const getButtonIcon = () => {
    if (isEncrypted && !isUnlocked) return 'lock';
    return 'unlock';
  };

  return (
    <>
      {!hideButton && (
        <ButtonSmall onClick={handleButtonClick} disabled={disabled} state="Secondary">
          <Icon name={getButtonIcon()} size={14} style={{ marginRight: '6px' }} />
          {getButtonLabel()}
        </ButtonSmall>
      )}
    </>
  );
}
