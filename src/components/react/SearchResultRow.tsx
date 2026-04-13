import React from 'react';
import type { SearchResult } from '@/hooks/useSearch';
import { getThreadColorCSS } from '@/utils/colors';
import { getTranslationAbbreviationDisplay } from '@/data/translations';
import {
  CondensedNoteRowLayout,
  condensedNoteRowIcon,
  getCondensedNoteAccentBarStyle,
  getCondensedNoteMeshGradient,
  getSolidThreadAccentBarStyle,
} from './CondensedNoteRowLayout';
import { CONDENSED_NOTE_ICON_PX, CONDENSED_NOTE_ROW_HEIGHT_PX } from '@/utils/condensed-note-row';

function ContextChip({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        fontFamily: 'var(--font-sans)',
        fontSize: '12px',
        fontWeight: 500,
        color: 'var(--color-stone-grey)',
        flexShrink: 0,
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </span>
  );
}

export interface SearchResultRowProps {
  result: SearchResult;
  /** Merged onto CondensedNoteRowLayout (e.g. `relative spotlight-result-row` in Spotlight). */
  className?: string;
  /** Defaults to `CONDENSED_NOTE_ROW_HEIGHT_PX` (same as CondensedNoteItem / SearchResultsList). */
  rowHeightPx?: number;
}

/**
 * Shared FTS hit row: same compact chrome as Spotlight / condensed lists (accent + title + chips).
 */
export default function SearchResultRow({
  result,
  className = 'relative',
  rowHeightPx = CONDENSED_NOTE_ROW_HEIGHT_PX,
}: SearchResultRowProps) {
  const isThread = result.type === 'thread';
  const isScripture = result.noteType === 'scripture';

  const accentBarStyle = isThread
    ? getSolidThreadAccentBarStyle(getThreadColorCSS(result.color))
    : getCondensedNoteAccentBarStyle(getCondensedNoteMeshGradient(result.threadColors, result.id));

  const icon = condensedNoteRowIcon({
    itemType: isThread ? 'thread' : 'note',
    noteType: (result.noteType as 'default' | 'scripture' | 'resource') ?? 'default',
    iconSize: CONDENSED_NOTE_ICON_PX,
  });

  const chips: React.ReactNode[] = [];
  if (isScripture && result.scriptureTranslation) {
    chips.push(
      <ContextChip key="translation">{getTranslationAbbreviationDisplay(result.scriptureTranslation)}</ContextChip>
    );
  }
  if (!isThread && result.threadTitle) {
    chips.push(<ContextChip key="thread">{result.threadTitle}</ContextChip>);
  }

  return (
    <CondensedNoteRowLayout
      className={className}
      accentBarStyle={accentBarStyle}
      icon={icon}
      paddingRight="0.75rem"
      rowHeightPx={rowHeightPx}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1, minWidth: 0, overflow: 'hidden' }}>
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
          {result.title || (isThread ? 'Untitled thread' : 'Untitled')}
        </div>
        {chips}
      </div>
    </CondensedNoteRowLayout>
  );
}
