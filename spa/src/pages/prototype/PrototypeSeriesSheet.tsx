/**
 * One series, opened from the teaching plan's Series lane.
 *
 * The series page `MY_CHURCH_SIDEBAR.md` keeps off Home lives here instead —
 * this is a **staff** surface. A congregant still gets one card and one next
 * gathering; nothing in this sheet is congregant-facing.
 *
 * Three acts, all of which the string era could not offer:
 *   - **Rename**, which renames the series everywhere. Under `seriesTitle`,
 *     editing week 5 forked the series silently and left the other seven weeks
 *     under the old spelling.
 *   - **Recolour**, which is what makes the run legible on the planner. Colour
 *     is optional and stays optional: an unset series is already drawn in a
 *     stable derived hue, so this picker changes a colour rather than supplying
 *     a missing one, and nothing here is a prerequisite for the plan to read.
 *   - **Delete**, which detaches its sermons and never removes them. A
 *     destructive act on a label must not be a destructive act on the calendar,
 *     so the copy says exactly what survives.
 *
 * Same presentation split as the member sheet: anchored popover on pointer
 * devices, drawer on touch.
 */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Drawer, DrawerContent } from '@/components/ui/drawer';
import Icon from '@/components/react/Icon';
import type {
  TeachingPlanSeries,
  TeachingPlanSermon,
} from '../../hooks/queries/useChurchTeachingPlan';
import ProtoPopoverShell from './ProtoPopoverShell';
import ProtoDialogBackdrop, { portaledDialogShellClassName } from './ProtoDialogBackdrop';
import { useDismissOnOutside } from '../../hooks/usePopoverDismiss';
import { useProtoOverlayMotion } from '../../hooks/useProtoOverlayMotion';
import { useProtoShell } from '../../layouts/proto-shell-context';
import { useProtoAnchoredPopoverPosition } from './useProtoAnchoredPopoverPosition';
import ProtoServiceDateTile from './ProtoServiceDateTile';
import ProtoSelectMenu from './ProtoSelectMenu';
import { SPACE_COVER_PICKER_COLORS, spacePickerSwatchColor } from '@/utils/space-cover';
import { seriesAccent } from '../../lib/church-services';

export interface PrototypeSeriesSheetProps {
  open: boolean;
  series: TeachingPlanSeries | null;
  /** This series' sermons, ascending — the plan pane already holds them. */
  services: TeachingPlanSermon[];
  /** False for a teacher, or a lapsed church: the sheet reads, never writes. */
  canWrite: boolean;
  pending: boolean;
  error: string | null;
  /**
   * Any subset of the series' own fields. Optional-per-field rather than a full
   * object so a colour change never resends a title and races a colleague's
   * rename — the same distinction the endpoint draws.
   */
  onUpdate: (
    series: TeachingPlanSeries,
    changes: { title?: string; color?: string | null; description?: string | null },
  ) => void;
  onDelete: (series: TeachingPlanSeries) => void;
  /**
   * Extend the run: `weeks` more Sundays after its last dated one, each a
   * placeholder carrying the series name and no passage.
   */
  onAddWeeks: (series: TeachingPlanSeries, seedServiceId: string, weeks: number) => void;
  /** Drop the untouched placeholders — never a week anyone has written into. */
  onRemoveEmpty: (series: TeachingPlanSeries, serviceIds: string[]) => void;
  onOpenChange: (open: boolean) => void;
}

/** Twelve, matching `REPEAT_MAX_WEEKS` — the server refuses more. */
const ADD_WEEK_CHOICES = [1, 2, 3, 5, 7, 11];


export default function PrototypeSeriesSheet({
  open,
  series,
  services,
  canWrite,
  pending,
  error,
  onUpdate,
  onDelete,
  onAddWeeks,
  onRemoveEmpty,
  onOpenChange,
}: PrototypeSeriesSheetProps) {
  const { isMobileSidebar } = useProtoShell();
  const { mounted, exiting } = useProtoOverlayMotion(open);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  /** How many weeks the "Add weeks" control will append. */
  const [addWeeks, setAddWeeks] = useState(3);

  // Reset from the row each time the sheet opens, so an abandoned rename never
  // leaks into the next series you look at.
  useEffect(() => {
    if (!open) return;
    setTitle(series?.title ?? '');
    setDescription(series?.description ?? '');
  }, [open, series?.id]);

  const shouldUseSheetPresentation =
    isMobileSidebar && typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;
  const usePopoverPresentation = !shouldUseSheetPresentation;
  const showPopoverPortal = usePopoverPresentation && mounted;

  const { position } = useProtoAnchoredPopoverPosition(
    cardRef,
    {},
    {
      enabled: showPopoverPortal,
      strategy: 'centered',
      topVhFraction: 0.16,
      fallbackWidth: 380,
      fallbackHeight: 320,
    },
    [series?.id, error],
  );

  useDismissOnOutside(cardRef, () => onOpenChange(false), open && usePopoverPresentation && !pending);

  if (!series) return null;

  const trimmed = title.trim();
  const renamed = trimmed.length > 0 && trimmed !== series.title;
  const trimmedDescription = description.trim();
  const describedDiffers = trimmedDescription !== (series.description ?? '').trim();
  /* What the planner is drawing right now, chosen or derived — so the selected
     swatch matches the run on screen rather than showing nothing until someone
     picks. */
  const shownColor = seriesAccent(series);

  /*
    Weeks are appended after the run's last dated one, so the seed is that row.
    Undated members are skipped: `repeat` counts weeks forward from a date and
    refuses a row without one.
  */
  const dated = services.filter((s) => s.serviceDate !== null);
  const seed = dated.length > 0 ? dated[dated.length - 1] : null;

  /*
    A week with no passage is one still to write. That is the honest measure of
    "how far through am I" — a placeholder and a half-written week both read as
    unfinished, and neither is something to teach from yet.
  */
  const toFill = services.filter((s) => !s.reference).length;

  /*
    Removable = exactly what "Add weeks" generated and nobody has touched: no
    passage, and still carrying the series' own name. A week someone has
    retitled or given a passage is their work, not scaffolding, and must
    survive a control called "remove empty weeks".
  */
  const removable = services.filter(
    (s) => !s.reference && s.title.trim() === series.title.trim(),
  );

  const content = (
    <>
      <div className="proto-study-thread-popover__header">
        {/* The series' own name is the identification. A glyph beside it only
            repeated "this is a series", which the sheet's contents say. */}
        <div className="proto-study-thread-popover__title-row">
          <span className="proto-study-thread-popover__title">{series.title}</span>
        </div>
        <button
          type="button"
          className="proto-side-panel__action-btn"
          onClick={() => onOpenChange(false)}
          aria-label="Close"
          title="Close"
        >
          <Icon name="xmark" size={12} />
        </button>
      </div>

      <div className="proto-service-editor">
        <label
          className="proto-inspector-section-title proto-create-folder-sheet__field-label"
          htmlFor="proto-series-title"
        >
          Series name
        </label>
        {canWrite ? (
          <input
            id="proto-series-title"
            type="text"
            className="proto-create-folder-sheet__name-input"
            value={title}
            autoComplete="off"
            placeholder="Series name"
            disabled={pending}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && renamed && !pending) onUpdate(series, { title: trimmed });
            }}
          />
        ) : (
          <p className="proto-caption proto-church-member__role">{series.title}</p>
        )}

        {/*
          Colour, saved on click rather than on a Save press.

          It is a one-field change with an instantly visible result on the plan
          behind this sheet, so a confirm step would only delay the feedback that
          tells you whether you picked the right one. The name field keeps its
          Enter-to-commit because a half-typed name is a real state and a
          half-picked colour is not.
        */}
        {canWrite ? (
          <>
            <p className="proto-inspector-section-title proto-create-folder-sheet__field-label">
              <span>Colour</span>
              {/* Says the run is already drawn, so this reads as a change rather
                  than as a required field nobody filled in. */}
              {!series.color ? (
                <span className="proto-service-editor__optional">Chosen for you</span>
              ) : null}
            </p>
            <div
              className="proto-space-cover-picker__tray"
              role="radiogroup"
              aria-label="Series colour"
            >
              {SPACE_COVER_PICKER_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  role="radio"
                  aria-checked={shownColor === c}
                  aria-label={c}
                  className={`proto-shared-space-settings__color proto-space-cover-picker__tray-swatch${
                    shownColor === c ? ' proto-shared-space-settings__color--selected' : ''
                  }`}
                  style={{ ['--swatch-accent' as string]: spacePickerSwatchColor(c) }}
                  title={c}
                  disabled={pending}
                  onClick={() => onUpdate(series, { color: c })}
                >
                  {shownColor === c ? <Icon name="check" size={12} /> : null}
                </button>
              ))}
            </div>
          </>
        ) : null}

        {/* One line, for the pastor's own recall of what a run was about. Staff
            only — no congregant surface reads it. */}
        {canWrite ? (
          <>
            <label
              className="proto-inspector-section-title proto-create-folder-sheet__field-label"
              htmlFor="proto-series-description"
            >
              <span>What this run is about</span>
              <span className="proto-service-editor__optional">Optional</span>
            </label>
            <input
              id="proto-series-description"
              type="text"
              className="proto-create-folder-sheet__name-input"
              value={description}
              autoComplete="off"
              placeholder="Eight weeks in Romans 8"
              disabled={pending}
              onChange={(e) => setDescription(e.target.value)}
              onBlur={() => {
                if (describedDiffers && !pending) {
                  onUpdate(series, { description: trimmedDescription || null });
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && describedDiffers && !pending) {
                  onUpdate(series, { description: trimmedDescription || null });
                }
              }}
            />
          </>
        ) : series.description ? (
          <p className="proto-caption proto-church-member__role">{series.description}</p>
        ) : null}

        <p className="proto-inspector-section-title proto-create-folder-sheet__field-label">
          <span>{services.length === 1 ? '1 week' : `${services.length} weeks`}</span>
          {/* The count that answers "how much of this is actually written". */}
          {toFill > 0 ? (
            <span className="proto-service-editor__optional">{toFill} to fill</span>
          ) : null}
        </p>
        {/*
          Each week stays read-only here — it is edited from the plan, where its
          date and passage live, and a second door to the same row would be two
          places to change one thing. The run's *length* is different: it is a
          property of the series, so it is edited here rather than by opening a
          week and repeating from it.
        */}
        <div className="proto-glass-surface proto-glass-surface--panel proto-church-tools">
          {services.map((service) => (
            <div key={service.id} className="proto-church-tools__row proto-church-tools__row--status">
              <ProtoServiceDateTile iso={service.serviceDate} unwritten={!service.reference} />
              <span className="proto-church-tools__row-text">
                <span className="pds-list-title proto-church-tools__row-title proto-marquee" title={service.title}><span>{service.title}</span></span>
                <span className="proto-caption proto-church-tools__row-meta proto-marquee-self">
                  {service.reference || 'No passage yet'}
                </span>
              </span>
            </div>
          ))}
          {services.length === 0 ? (
            <p className="proto-caption proto-teaching-plan__empty">
              Nothing scheduled under this series yet.
            </p>
          ) : null}
        </div>

        {/*
          How long the run is, edited where you think about it.

          The weeks this adds are placeholders: the series' name, the right
          Sunday, no passage. That is the point — you know it is a six-week run
          before you know what week four is about, and the plan should be able
          to say so.
        */}
        {canWrite ? (
          <div className="proto-service-editor__repeat proto-series-sheet__run">
            {seed ? (
              <>
                <ProtoSelectMenu
                  label="How many weeks to add"
                  className="proto-service-editor__repeat-select"
                  value={addWeeks}
                  disabled={pending}
                  onChange={setAddWeeks}
                  options={ADD_WEEK_CHOICES.map((weeks) => ({
                    value: weeks,
                    label: weeks === 1 ? '1 more week' : `${weeks} more weeks`,
                  }))}
                />
                <button
                  type="button"
                  className="proto-glass-surface proto-glass-surface--control proto-glass-action"
                  disabled={pending}
                  onClick={() => onAddWeeks(series, seed.id, addWeeks)}
                >
                  <Icon name="plus" size={12} aria-hidden />
                  <span className="proto-glass-action__label">
                    {pending ? 'Adding…' : 'Add weeks'}
                  </span>
                </button>
              </>
            ) : (
              /* Nothing to count forward from. Saying so beats a disabled
                 control that never explains itself. */
              <p className="proto-caption proto-teaching-plan__empty">
                Give one week a date first — a run is counted forward from one.
              </p>
            )}
          </div>
        ) : null}

        {canWrite && removable.length > 0 ? (
          <button
            type="button"
            className="proto-sheet-quiet-action"
            disabled={pending}
            onClick={() => {
              const count = removable.length;
              if (
                !window.confirm(
                  count === 1
                    ? 'Remove the one empty week from this series? Nothing written is touched.'
                    : `Remove ${count} empty weeks from this series? Nothing written is touched.`,
                )
              ) {
                return;
              }
              onRemoveEmpty(series, removable.map((s) => s.id));
            }}
          >
            {removable.length === 1 ? 'Remove 1 empty week' : `Remove ${removable.length} empty weeks`}
          </button>
        ) : null}

        {error ? (
          <p className="proto-connect-note-sheet__error" role="alert">
            {error}
          </p>
        ) : null}
      </div>

      {canWrite ? (
        <div className="proto-add-notes-sheet__footer proto-sheet-footer--stacked">
          <button
            type="button"
            className="proto-share-popover__primary"
            disabled={!renamed || pending}
            onClick={() => onUpdate(series, { title: trimmed })}
          >
            {pending ? 'Saving…' : 'Rename series'}
          </button>
          <button
            type="button"
            className="proto-sheet-quiet-action proto-sheet-quiet-action--danger"
            disabled={pending}
            onClick={() => onDelete(series)}
          >
            Delete series
          </button>
        </div>
      ) : null}
    </>
  );

  if (showPopoverPortal && typeof document !== 'undefined') {
    return createPortal(
      <>
        <ProtoDialogBackdrop
          exiting={exiting}
          onDismiss={() => onOpenChange(false)}
          aria-label="Close series"
        />
        <ProtoPopoverShell
          ref={cardRef}
          role="dialog"
          aria-label={series.title}
          className={portaledDialogShellClassName(
            'proto-connect-note-popover proto-church-member-popover',
            exiting,
          )}
          style={{
            position: 'fixed',
            top: position?.top ?? -9999,
            left: position?.left ?? -9999,
            zIndex: 6000,
          }}
        >
          <div className="proto-connect-note-sheet proto-connect-note-sheet--popover proto-create-folder-sheet">
            {content}
          </div>
        </ProtoPopoverShell>
      </>,
      document.body,
    );
  }

  if (!open) return null;

  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange}>
      <DrawerContent
        onOverlayClick={() => onOpenChange(false)}
        overlayClassName="proto-connect-note-sheet-overlay"
        className="proto-connect-note-sheet proto-create-folder-sheet"
      >
        {content}
      </DrawerContent>
    </Drawer.Root>
  );
}
