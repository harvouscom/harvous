import React from 'react';
import Icon from './Icon';
import { generateThreadMeshGradient } from '@/utils/colors';

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
  /** Optional right-side action (e.g. "Turn off sharing" button). When set, row is non-link. */
  action?: React.ReactNode;
  /** 'thread' shows a list/thread icon and simple accent; 'note' uses noteType icon and gradient */
  itemType?: 'note' | 'thread';
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
  itemType = 'note'
}: CondensedNoteItemProps) {
  // Generate mesh gradient from thread colors (notes only; threads use simple accent)
  const meshGradient = React.useMemo(() => {
    if (itemType === 'thread' || !threadColors || !Array.isArray(threadColors) || threadColors.length === 0) {
      return null;
    }
    const validColors = threadColors.filter(c => c && c.color && typeof c.frequency === 'number');
    if (validColors.length === 0) return null;
    return generateThreadMeshGradient(validColors, noteId);
  }, [threadColors, noteId, itemType]);

  const accentBarStyle: React.CSSProperties = {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: '2.75rem',
    borderTopLeftRadius: '0.75rem',
    borderBottomLeftRadius: '0.75rem',
    overflow: 'hidden',
    ...(meshGradient
      ? { backgroundColor: 'var(--color-light-paper)', backgroundImage: meshGradient }
      : { backgroundColor: 'var(--color-light-paper)' }
    )
  };

  const getIcon = () => {
    if (itemType === 'thread') {
      return <Icon name="list" size={20} style={{ color: 'var(--color-deep-grey)', opacity: 0.3 }} />;
    }
    if (noteType === 'scripture') {
      return <Icon name="scroll" size={20} style={{ color: 'var(--color-deep-grey)', opacity: 0.3 }} />;
    }
    if (noteType === 'resource') {
      return <Icon name="newspaper" size={20} style={{ color: 'var(--color-deep-grey)', opacity: 0.3 }} />;
    }
    return (
      <svg className="block max-w-none size-full" fill="currentColor" viewBox="0 0 24 24" style={{ color: 'var(--color-deep-grey)', opacity: 0.3 }}>
        <path d="M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2z"/>
      </svg>
    );
  };

  const contentRow = (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '1.5rem',
        paddingLeft: '0.75rem',
        paddingRight: action ? '0.75rem' : '3rem',
        height: '100%',
        overflow: 'hidden'
      }}
    >
      <div style={{ position: 'relative', flexShrink: 0, width: '1.25rem', height: '1.25rem' }}>
        {getIcon()}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontFamily: 'var(--font-sans)',
            fontWeight: 700,
            color: 'var(--color-deep-grey)',
            fontSize: '16px',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap'
          }}
        >
          {title || (itemType === 'thread' ? 'Untitled thread' : 'Untitled Note')}
        </div>
      </div>
      {action != null && <div style={{ flexShrink: 0 }}>{action}</div>}
    </div>
  );

  const inner = (
    <div
      className="relative"
      style={{
        position: 'relative',
        borderRadius: '0.75rem',
        height: '48px',
        width: '100%',
        textAlign: 'left',
        backgroundColor: 'white',
        boxShadow: 'none',
        transition: 'transform 0.2s',
        ...(action == null && { cursor: 'pointer' })
      }}
    >
      <div style={accentBarStyle} />
      {contentRow}
    </div>
  );

  if (action != null) {
    return <div className={`block ${className}`.trim()}>{inner}</div>;
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
