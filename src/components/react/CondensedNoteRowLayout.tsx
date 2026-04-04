import React from 'react';
import Icon from './Icon';
import { generateThreadMeshGradient } from '@/utils/colors';
import {
  CONDENSED_NOTE_ICON_PX,
  CONDENSED_NOTE_ROW_HEIGHT_PX,
  CONDENSED_SOLID_ACCENT_ICON_OPACITY,
} from '@/utils/condensed-note-row';

export type CondensedThreadColor = { color: string; frequency: number };

export function getCondensedNoteMeshGradient(
  threadColors: CondensedThreadColor[] | null | undefined,
  noteId: string | undefined,
): string | null {
  if (!threadColors?.length || !noteId) return null;
  const valid = threadColors.filter((c) => c && c.color && typeof c.frequency === 'number');
  if (valid.length === 0) return null;
  return generateThreadMeshGradient(valid, noteId);
}

export function getCondensedNoteAccentBarStyle(meshGradient: string | null | undefined): React.CSSProperties {
  return {
    width: '2.75rem',
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderTopLeftRadius: '0.75rem',
    borderBottomLeftRadius: '0.75rem',
    overflow: 'hidden',
    ...(meshGradient
      ? { backgroundColor: 'var(--color-light-paper)', backgroundImage: meshGradient }
      : { backgroundColor: 'var(--color-light-paper)' }),
  };
}

/** Solid thread color strip (space panels / add-to-space thread rows). */
export function getSolidThreadAccentBarStyle(backgroundColor: string): React.CSSProperties {
  return {
    width: '2.75rem',
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderTopLeftRadius: '0.75rem',
    borderBottomLeftRadius: '0.75rem',
    overflow: 'hidden',
    backgroundColor,
  };
}

export function condensedNoteRowIcon(options: {
  itemType?: 'note' | 'thread';
  noteType?: 'default' | 'scripture' | 'resource';
  iconSize?: number;
}): React.ReactNode {
  const size = options.iconSize ?? CONDENSED_NOTE_ICON_PX;
  const styleOnSolidAccent: React.CSSProperties = {
    color: 'var(--color-deep-grey)',
    opacity: CONDENSED_SOLID_ACCENT_ICON_OPACITY,
  };
  const styleOnPaperOrMesh: React.CSSProperties = { color: 'var(--color-deep-grey)', opacity: 0.3 };
  if (options.itemType === 'thread') {
    return <Icon name="layer-group" size={size} style={styleOnSolidAccent} />;
  }
  const nt = options.noteType ?? 'default';
  if (nt === 'scripture') return <Icon name="scroll" size={size} style={styleOnPaperOrMesh} />;
  if (nt === 'resource') return <Icon name="newspaper" size={size} style={styleOnPaperOrMesh} />;
  return (
    <svg className="block max-w-none size-full" fill="currentColor" viewBox="0 0 24 24" style={styleOnPaperOrMesh}>
      <path d="M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2z" />
    </svg>
  );
}

export interface CondensedNoteRowLayoutProps {
  accentBarStyle: React.CSSProperties;
  icon: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  paddingRight?: string;
  iconSizePx?: number;
  rowHeightPx?: number;
  boxShadow?: string;
}

export function CondensedNoteRowLayout({
  accentBarStyle,
  icon,
  children,
  className = 'relative',
  style,
  paddingRight = '3rem',
  iconSizePx = CONDENSED_NOTE_ICON_PX,
  rowHeightPx = CONDENSED_NOTE_ROW_HEIGHT_PX,
  boxShadow = 'none',
}: CondensedNoteRowLayoutProps) {
  return (
    <div
      className={className}
      style={{
        position: 'relative',
        borderRadius: '0.75rem',
        height: `${rowHeightPx}px`,
        width: '100%',
        display: 'flex',
        alignItems: 'stretch',
        overflow: 'hidden',
        textAlign: 'left',
        backgroundColor: 'white',
        boxShadow,
        transition: 'transform 0.2s',
        ...style,
      }}
    >
      <div style={accentBarStyle}>
        <div
          style={{
            width: `${iconSizePx}px`,
            height: `${iconSizePx}px`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {icon}
        </div>
      </div>
      <div
        style={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          paddingLeft: '0.75rem',
          paddingRight,
          overflow: 'hidden',
        }}
      >
        {children}
      </div>
    </div>
  );
}
