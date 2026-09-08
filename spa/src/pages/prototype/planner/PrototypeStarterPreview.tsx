/**
 * What the congregation's note will look like — one tile per choice.
 *
 * The same move the appearance picker makes: draw the outcome next to the
 * control that causes it. A select naming "Here we go" said nothing about what
 * "Here we go" *is*, so the only way to find out was to publish it and open
 * somebody else's note.
 *
 * Every tile shows the passage pill, because every tile gets one — that is what
 * makes the difference between them legible as *the shape underneath*, which is
 * the only thing this setting actually changes.
 *
 * Tiles carry the template's own colour, resolved by the same helper the browse
 * sheet uses, so a template looks like itself in both places.
 */
import Icon from '@/components/react/Icon';
import { resolveNoteTemplateIconColor } from '@/utils/note-template-icon';
import { starterPreviewLines } from './starter-preview';

export type StarterChoice = {
  /** Empty string is "just the passage" — the same value the field stores. */
  id: string;
  name: string;
  content?: string | null;
  iconColor?: string | null;
};

function PreviewPage({ choice, hasPassage }: { choice: StarterChoice; hasPassage: boolean }) {
  const lines = choice.id ? starterPreviewLines(choice.content) : [];
  return (
    <span className="proto-starter-preview__page" aria-hidden>
      {/*
        The passage, drawn as the pill it will actually be. Absent when the
        entry has no reference yet — promising one the reader has not typed
        would make the preview a small lie, and the blank page below it is then
        the whole truth of what they get.
      */}
      {hasPassage ? <span className="proto-starter-preview__pill" /> : null}
      {lines.map((line, i) => (
        <span
          key={i}
          className={`proto-starter-preview__line${
            line.heading ? ' proto-starter-preview__line--heading' : ''
          }`}
          style={{ width: `${Math.round(line.width * 100)}%` }}
        />
      ))}
      {/* The caret the note opens on — and, on the blank choice, the only thing
          below the pill, which is exactly the point being made. */}
      <span className="proto-starter-preview__caret" />
    </span>
  );
}

/** A run of tiles under one caption. A null label is the ungrouped head. */
export type StarterGroup = {
  label: string | null;
  choices: StarterChoice[];
};

export default function PrototypeStarterPreview({
  groups,
  value,
  hasPassage,
  disabled,
  onChange,
  label,
}: {
  groups: StarterGroup[];
  value: string;
  /** Whether this entry names a passage yet — the pill is drawn only if so. */
  hasPassage: boolean;
  disabled?: boolean;
  onChange: (id: string) => void;
  label: string;
}) {
  return (
    <div className="proto-starter-preview" role="listbox" aria-label={label}>
      {groups.map((group) => (
        <div
          key={group.label ?? 'ungrouped'}
          className="proto-starter-preview__group"
          /*
            `role="group"` inside the listbox, so a screen reader hears "From
            your church" before the options under it rather than a flat run of
            tiles whose scope is only visible.
          */
          role="group"
          aria-label={group.label ?? undefined}
        >
          {group.label ? (
            <span className="proto-starter-preview__group-label">{group.label}</span>
          ) : (
            /* The head group has no caption — "Just the passage" is not a scope,
               and labelling it would invent a category to balance the others. */
            <span className="proto-starter-preview__group-label" aria-hidden />
          )}
          <div className="proto-starter-preview__group-tiles">
            {group.choices.map((choice) => {
              const selected = choice.id === value;
              const accent = choice.id
                ? resolveNoteTemplateIconColor(choice.id, choice.iconColor)
                : null;
              return (
                <button
                  key={choice.id || 'none'}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  aria-label={choice.name}
                  disabled={disabled}
                  className={`proto-starter-preview__tile${
                    selected ? ' proto-starter-preview__tile--selected' : ''
                  }`}
                  data-accent={accent ?? undefined}
                  onClick={() => onChange(choice.id)}
                >
                  <span className="proto-starter-preview__canvas">
                    <PreviewPage choice={choice} hasPassage={hasPassage} />
                    {selected ? (
                      <span className="proto-starter-preview__check" aria-hidden>
                        <Icon name="check" size={10} />
                      </span>
                    ) : null}
                  </span>
                  <span className="proto-starter-preview__label">{choice.name}</span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
