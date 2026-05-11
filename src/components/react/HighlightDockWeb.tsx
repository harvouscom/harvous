'use client';

import React from 'react';
import '@/styles/highlight-dock-web.css';
import type { StudyHighlightAccentKey } from '@/utils/study-highlight-accents';
import { STUDY_HIGHLIGHT_SWATCHES_NO_NEUTRAL } from '@/utils/study-highlight-accents';

export interface HighlightDockWebProps {
  accent: string;
  excerpt: string;
  /** When false, only non-neutral swatches (highlight toolbar parity). */
  includeNeutral: boolean;
  onAccentChange: (accent: StudyHighlightAccentKey) => void;
  onRemove: () => void;
  onDone: () => void;
}

const SWATCHES_WITH_NEUTRAL = ['neutral', ...STUDY_HIGHLIGHT_SWATCHES_NO_NEUTRAL] as const;

export default function HighlightDockWeb({
  accent,
  excerpt,
  includeNeutral,
  onAccentChange,
  onRemove,
  onDone,
}: HighlightDockWebProps) {
  const choices = includeNeutral ? SWATCHES_WITH_NEUTRAL : STUDY_HIGHLIGHT_SWATCHES_NO_NEUTRAL;

  return (
    <div className="highlight-dock-web" role="region" aria-label="Highlight editor">
      <div className="highlight-dock-web__row">
        <div className="highlight-dock-web__swatches" role="group" aria-label="Highlight color">
          {choices.map((key) => (
            <button
              key={key}
              type="button"
              className={`highlight-dock-web__swatch highlight-dock-web__swatch--${key}${
                accent === key ? ' highlight-dock-web__swatch--selected' : ''
              }`}
              title={key}
              aria-label={key}
              aria-pressed={accent === key}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onAccentChange(key as StudyHighlightAccentKey)}
            />
          ))}
        </div>
        <div className="highlight-dock-web__actions">
          <button
            type="button"
            className="btn btn--sm btn--ghost highlight-dock-web__btn"
            onMouseDown={(e) => e.preventDefault()}
            onClick={onRemove}
          >
            Remove
          </button>
          <button
            type="button"
            className="btn btn--sm btn--secondary highlight-dock-web__btn"
            onMouseDown={(e) => e.preventDefault()}
            onClick={onDone}
          >
            Done
          </button>
        </div>
      </div>
      {excerpt.trim() ? (
        <div className="highlight-dock-web__excerpt">
          <p className="highlight-dock-web__excerpt-text">{excerpt}</p>
        </div>
      ) : null}
    </div>
  );
}
