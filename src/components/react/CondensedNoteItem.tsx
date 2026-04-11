import React from 'react';
import { CONDENSED_NOTE_ICON_PX } from '@/utils/condensed-note-row';
import {
  CondensedNoteRowLayout,
  condensedNoteRowIcon,
  getCondensedNoteAccentBarStyle,
  getCondensedNoteMeshGradient,
} from './CondensedNoteRowLayout';

interface CondensedNoteItemProps {
  title: string;
  noteType?: 'default' | 'scripture' | 'resource';
  /** When action is provided, href is optional and the row renders as a div with the action on the right */
  href?: string;
  className?: string;
  onClick?: React.MouseEventHandler<HTMLAnchorElement>;
  onMouseEnter?: React.MouseEventHandler<HTMLAnchorElement>;
  onFocus?: React.FocusEventHandler<HTMLAnchorElement>;
  onMouseDown?: React.MouseEventHandler<HTMLAnchorElement>;
  // Thread colors for mesh gradient background
  threadColors?: Array<{ color: string; frequency: number }>;
  // Note ID for deterministic gradient variation
  noteId?: string;
  /** Optional right-side action (e.g. "Turn off sharing" button). When set, row is non-link unless `onOpen` is also set. */
  action?: React.ReactNode;
  /** With `action`, opens the note/thread when clicking the main row (title area); action control stays separate. */
  onOpen?: () => void;
  /** 'thread' shows a list/thread icon and simple accent; 'note' uses noteType icon and gradient */
  itemType?: 'note' | 'thread';
  /** Bible translation abbreviation for scripture notes (e.g. 'ESV', 'KJV') */
  scriptureTranslation?: string;
  'client:load'?: boolean;
  'client:visible'?: boolean;
  'client:idle'?: boolean;
  'client:only'?: string | boolean;
}

export default function CondensedNoteItem({
  title,
  noteType = 'default',
  href,
  className = '',
  onClick,
  onMouseEnter,
  onFocus,
  onMouseDown,
  threadColors,
  noteId,
  action,
  onOpen,
  itemType = 'note',
  scriptureTranslation,
}: CondensedNoteItemProps) {
  const meshGradient = React.useMemo(() => {
    if (itemType === 'thread') return null;
    return getCondensedNoteMeshGradient(threadColors, noteId);
  }, [threadColors, noteId, itemType]);

  const accentBarStyle = React.useMemo(
    () => getCondensedNoteAccentBarStyle(meshGradient),
    [meshGradient],
  );

  const titleBlock = (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1, minWidth: 0 }}>
      <div
        style={{
          fontFamily: 'var(--font-sans)',
          fontWeight: 700,
          color: 'var(--color-deep-grey)',
          fontSize: '16px',
          lineHeight: 1.2,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {title || (itemType === 'thread' ? 'Untitled thread' : 'Untitled Note')}
      </div>
      {scriptureTranslation && (
        <span
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: '12px',
            fontWeight: 'normal',
            color: 'var(--color-stone-grey)',
            flexShrink: 0,
          }}
        >
          {scriptureTranslation}
        </span>
      )}
    </div>
  );

  const openKeyDown = (e: React.KeyboardEvent) => {
    if (!onOpen) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onOpen();
    }
  };

  const inner = (
    <CondensedNoteRowLayout
      accentBarStyle={accentBarStyle}
      icon={condensedNoteRowIcon({ itemType, noteType, iconSize: CONDENSED_NOTE_ICON_PX })}
      paddingRight={action ? '0.75rem' : '3rem'}
      style={
        action == null
          ? { cursor: 'pointer' }
          : onOpen
            ? { cursor: 'default' }
            : undefined
      }
    >
      {action != null && onOpen ? (
        <div
          role="link"
          tabIndex={0}
          onClick={() => onOpen()}
          onKeyDown={openKeyDown}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            flex: 1,
            minWidth: 0,
            cursor: 'pointer',
          }}
        >
          {titleBlock}
        </div>
      ) : (
        titleBlock
      )}
      {action != null && <div style={{ flexShrink: 0 }}>{action}</div>}
    </CondensedNoteRowLayout>
  );

  if (action != null) {
    return (
      <div
        className={`block ${onOpen ? 'transition-transform duration-200 hover:scale-[1.002] active:scale-[0.99]' : ''} ${className}`.trim()}
      >
        {inner}
      </div>
    );
  }

  return (
    <a
      href={href ?? '#'}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onFocus={onFocus}
      onMouseDown={onMouseDown}
      className={`block transition-transform duration-200 hover:scale-[1.002] active:scale-[0.99] ${className}`}
      style={{ touchAction: 'manipulation' }}
    >
      {inner}
    </a>
  );
}
