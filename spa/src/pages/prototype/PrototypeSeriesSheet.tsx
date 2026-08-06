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
  onOpenChange: (open: boolean) => void;
}

function formatServiceDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return iso;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function PrototypeSeriesSheet({
  open,
  series,
  services,
  canWrite,
  pending,
  error,
  onRename,
  onDelete,
  onOpenChange,
}: PrototypeSeriesSheetProps) {
  const { isMobileSidebar } = useProtoShell();
  const { mounted, exiting } = useProtoOverlayMotion(open);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [title, setTitle] = useState('');

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

  const content = (
    <>
      <div className="proto-study-thread-popover__header">
        <div className="proto-study-thread-popover__title-row">
          <Icon name="layer-group" size={13} aria-hidden />
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
          {services.length === 1 ? '1 week' : `${services.length} weeks`}
        </p>
        {/*
          The extent, which is the thing a series has and a repeated string did
          not. Read-only: a week is edited from the plan, where its date and
          passage live — offering a second door to the same row would be two
          places to change one thing.
        */}
        <div className="proto-glass-surface proto-glass-surface--panel proto-church-tools">
          {services.map((service) => (
            <div key={service.id} className="proto-church-tools__row proto-church-tools__row--status">
              <span className="proto-church-tools__row-date">
                {formatServiceDate(service.serviceDate)}
              </span>
              <span className="proto-church-tools__row-text">
                <span className="pds-list-title proto-church-tools__row-title">{service.title}</span>
                <span className="proto-caption proto-church-tools__row-meta">
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
