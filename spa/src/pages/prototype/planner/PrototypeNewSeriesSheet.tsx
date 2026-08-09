/**
 * Name a series before any week exists.
 *
 * The plan deliberately had no create path — a series was born by naming it on
 * a sermon, and an empty one was "a form to fill in, not a plan". That is still
 * the right read of the *accidental* empty series, and the sermon editor's
 * combobox is still how most of them are born. What it withheld is a real
 * intention: "we are doing eight weeks in Romans this autumn", decided before
 * week one exists.
 *
 * The first date is optional, and it is the whole difference between the two
 * readings. With one, this creates the series *and* its opening week, so you
 * land on something you can extend with Add weeks. Without one, you get the row
 * alone — which every read path already rendered, since deleting a series' last
 * sermon has always left one behind.
 */
import { useEffect, useState } from 'react';
import Icon from '@/components/react/Icon';
import { SPACE_COVER_PICKER_COLORS, spacePickerSwatchColor } from '@/utils/space-cover';
import { formatLocalDateInput, parseLocalDateInput } from '../../../lib/proto-date-picker';
import { nextOccurrenceOfDay } from '../../../lib/church-services';
import ProtoDatePicker from '../ProtoDatePicker';
import { PrototypeSectionHeader } from '../design-system';

export default function PrototypeNewSeriesSheet({
  open,
  pending,
  error,
  defaultDay,
  onCreate,
  onCancel,
  showHeading = true,
}: {
  open: boolean;
  pending: boolean;
  error: string | null;
  /** The plan's own gathering day, so the opening week defaults sensibly. */
  defaultDay: number | null;
  onCreate: (input: { title: string; color: string | null; firstDate: string | null }) => void;
  onCancel: () => void;
  /** False when a rail header already names the form. */
  showHeading?: boolean;
}) {
  const [title, setTitle] = useState('');
  const [color, setColor] = useState<string | null>(null);
  const [withDate, setWithDate] = useState(true);
  const [firstDate, setFirstDate] = useState(() => nextOccurrenceOfDay(defaultDay));

  useEffect(() => {
    if (!open) return;
    setTitle('');
    setColor(null);
    setWithDate(true);
    setFirstDate(nextOccurrenceOfDay(defaultDay));
  }, [open, defaultDay]);

  if (!open) return null;

  const trimmed = title.trim();
  const earliestPlannableDate = () => {
    const d = new Date();
    d.setDate(d.getDate() - 56);
    return formatLocalDateInput(d);
  };

  return (
    <div className="proto-planner-new-series">
      {/* The rail it docks in already carries this title; a second one under
          the first read as two headings for one form. Kept for the compact
          pane, where the form has no header above it. */}
      {showHeading ? (
        <PrototypeSectionHeader variant="inspector">New series</PrototypeSectionHeader>
      ) : null}

      <label
        className="proto-inspector-section-title proto-create-folder-sheet__field-label"
        htmlFor="proto-new-series-title"
      >
        Series name
      </label>
      <input
        id="proto-new-series-title"
        type="text"
        className="proto-create-folder-sheet__name-input"
        value={title}
        autoComplete="off"
        placeholder="Life in the Spirit"
        disabled={pending}
        onChange={(e) => setTitle(e.target.value)}
      />

      {/* Optional here, unlike the series sheet where a colour already exists to
          change. Left unset, `seriesAccent` derives one from the row id — so a
          series is never colourless, and picking is an override. */}
      <p className="proto-inspector-section-title proto-create-folder-sheet__field-label">
        <span>Color</span>
        <span className="proto-service-editor__optional">Optional</span>
      </p>
      <div className="proto-space-cover-picker__tray" role="radiogroup" aria-label="Series color">
        {SPACE_COVER_PICKER_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={color === c}
            aria-label={c}
            className={`proto-shared-space-settings__color proto-space-cover-picker__tray-swatch${
              color === c ? ' proto-shared-space-settings__color--selected' : ''
            }`}
            style={{ ['--swatch-accent' as string]: spacePickerSwatchColor(c) }}
            title={c}
            disabled={pending}
            onClick={() => setColor(color === c ? null : c)}
          >
            {color === c ? <Icon name="check" size={12} /> : null}
          </button>
        ))}
      </div>

      {/*
        The opening week. Checked by default because a run you can extend beats
        an empty shell — "Add weeks" counts forward from a dated seed and has
        nothing to count from without one.
      */}
      <label className="proto-planner-new-series__toggle">
        <input
          type="checkbox"
          checked={withDate}
          disabled={pending}
          onChange={(e) => setWithDate(e.target.checked)}
        />
        <span className="proto-caption">Start it on a date</span>
      </label>
      {withDate ? (
        <ProtoDatePicker
          value={firstDate}
          min={earliestPlannableDate()}
          onChange={setFirstDate}
          aria-label="First week"
        />
      ) : (
        <p className="proto-caption proto-service-editor__starter-hint">
          The series will be empty until you add a week to it.
        </p>
      )}

      {error ? (
        <p className="proto-connect-note-sheet__error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="proto-sheet-footer__row">
        <button
          type="button"
          className="proto-share-popover__primary"
          disabled={!trimmed || pending || (withDate && !parseLocalDateInput(firstDate))}
          onClick={() =>
            onCreate({ title: trimmed, color, firstDate: withDate ? firstDate : null })
          }
        >
          {pending ? 'Creating…' : 'Create series'}
        </button>
        <button
          type="button"
          className="proto-sheet-quiet-action"
          disabled={pending}
          onClick={onCancel}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
