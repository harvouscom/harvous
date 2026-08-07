/**
 * One series, opened from the teaching plan's Series lane.
 *
 * The series page `MY_CHURCH_SIDEBAR.md` keeps off Home lives here instead —
 * this is a **staff** surface. A congregant still gets one card and one next
 * gathering; nothing in this sheet is congregant-facing.
 *
 * Two acts, both of which the string era could not offer:
 *   - **Rename**, which renames the series everywhere. Under `seriesTitle`,
 *     editing week 5 forked the series silently and left the other seven weeks
 *     under the old spelling.
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

export interface PrototypeSeriesSheetProps {
  open: boolean;
  series: TeachingPlanSeries | null;
  /** This series' sermons, ascending — the plan pane already holds them. */
  services: TeachingPlanSermon[];
  /** False for a teacher, or a lapsed church: the sheet reads, never writes. */
  canWrite: boolean;
  pending: boolean;
  error: string | null;
  onRename: (series: TeachingPlanSeries, title: string) => void;
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
  onRename,
  onDelete,
  onAddWeeks,
  onRemoveEmpty,
  onOpenChange,
}: PrototypeSeriesSheetProps) {
  const { isMobileSidebar } = useProtoShell();
  const { mounted, exiting } = useProtoOverlayMotion(open);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [title, setTitle] = useState('');
  /** How many weeks the "Add weeks" control will append. */
  const [addWeeks, setAddWeeks] = useState(3);

  // Reset from the row each time the sheet opens, so an abandoned rename never
  // leaks into the next series you look at.
  useEffect(() => {
    if (!open) return;
    setTitle(series?.title ?? '');
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
        <div className="proto-study-thread-popover__title-row">
          <Icon name="timeline" size={13} aria-hidden />
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
              if (e.key === 'Enter' && renamed && !pending) onRename(series, trimmed);
            }}
          />
        ) : (
          <p className="proto-caption proto-church-member__role">{series.title}</p>
        )}

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
              <ProtoServiceDateTile iso={service.serviceDate} />
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
                <select
                  aria-label="How many weeks to add"
                  className="proto-create-folder-sheet__name-input proto-service-editor__repeat-select"
                  value={addWeeks}
                  disabled={pending}
                  onChange={(e) => setAddWeeks(Number(e.target.value))}
                >
                  {ADD_WEEK_CHOICES.map((weeks) => (
                    <option key={weeks} value={weeks}>
                      {weeks === 1 ? '1 more week' : `${weeks} more weeks`}
                    </option>
                  ))}
                </select>
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
            onClick={() => onRename(series, trimmed)}
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
