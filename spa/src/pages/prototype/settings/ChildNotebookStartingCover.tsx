/**
 * The parent's part of making the notebook: how it looks the first time the child opens it.
 *
 * Three choices — colour, pattern and style — with the notebook drawn live beside them, carrying the
 * child's initial from the name field above. No sticker choice here: the cover starts with their
 * initial, and stickers are the child's to add (the server refuses a parent-picked sticker). The
 * child can change all of it in their notebook's cover studio, any time.
 */
import type { CSSProperties } from 'react';
import Icon from '@/components/react/Icon';
import { ChildNotebookCover, coverColors, coverPatterns } from '../ChildNotebookAppearance';
import { defaultChildPreferences, type ChildNotebookPreferences } from '../../../../../shared/child-notebook';

export type StartingCover = Pick<ChildNotebookPreferences, 'coverColor' | 'coverPattern'> & { coverBinding: 'classic' | 'spiral' | 'stitched' };

export const DEFAULT_STARTING_COVER: StartingCover = { coverColor: 'blue', coverPattern: 'plain', coverBinding: 'classic' };

const patternLabels: Record<typeof coverPatterns[number], string> = { plain: 'Simple', dots: 'Dots', stripes: 'Stripes', gingham: 'Checks' };
// The same three styles the child's studio offers.
const styles = [
  { id: 'classic', label: 'Classic' },
  { id: 'spiral', label: 'Spiral' },
  { id: 'stitched', label: 'Stitched' },
] as const;

export default function ChildNotebookStartingCover({ name, value, onChange, disabled }: {
  name: string;
  value: StartingCover;
  onChange: (next: StartingCover) => void;
  disabled?: boolean;
}) {
  const preferences: ChildNotebookPreferences = { ...defaultChildPreferences, ...value, coverSymbol: 'initial' };
  const shown = name.trim() || 'A';
  const color = coverColors.find((option) => option.id === value.coverColor) ?? coverColors[0];

  return (
    <fieldset className="pds-family-cover" disabled={disabled} style={{ '--kids-cover-color': color.color } as CSSProperties}>
      <legend className="pds-list-title">Their notebook</legend>
      <div className="pds-family-cover__layout">
        <div className="pds-family-cover__preview" aria-hidden>
          <ChildNotebookCover name={shown} preferences={preferences} large />
        </div>
        <div className="pds-family-cover__choices">
          <div className="pds-family-cover__row" role="radiogroup" aria-label="Color">
            <span className="pds-caption pds-family-cover__label">Color</span>
            <div className="pds-family-cover__options">
              {coverColors.map((option) => (
                <label key={option.id} className="pds-family-cover__swatch" style={{ '--swatch': option.color } as CSSProperties}>
                  <input type="radio" name="starting-cover-color" aria-label={option.label} checked={value.coverColor === option.id}
                    onChange={() => onChange({ ...value, coverColor: option.id })} />
                  <span aria-hidden>{value.coverColor === option.id ? <Icon name="check" size={11} /> : null}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="pds-family-cover__row" role="radiogroup" aria-label="Pattern">
            <span className="pds-caption pds-family-cover__label">Pattern</span>
            <div className="pds-family-cover__options">
              {coverPatterns.map((pattern) => (
                <label key={pattern} className="pds-family-cover__pill">
                  <input type="radio" name="starting-cover-pattern" checked={value.coverPattern === pattern}
                    onChange={() => onChange({ ...value, coverPattern: pattern })} />
                  <span className={value.coverPattern === pattern ? 'proto-ink-on-accent' : undefined}>{patternLabels[pattern]}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="pds-family-cover__row" role="radiogroup" aria-label="Style">
            <span className="pds-caption pds-family-cover__label">Style</span>
            <div className="pds-family-cover__options">
              {styles.map((style) => (
                <label key={style.id} className="pds-family-cover__pill">
                  <input type="radio" name="starting-cover-style" checked={value.coverBinding === style.id}
                    onChange={() => onChange({ ...value, coverBinding: style.id })} />
                  <span className={value.coverBinding === style.id ? 'proto-ink-on-accent' : undefined}>{style.label}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
      </div>
      <p className="pds-caption pds-family-cover__hint">
        Their initial goes on the cover. They can change any of this, and add stickers, in their notebook.
      </p>
    </fieldset>
  );
}
