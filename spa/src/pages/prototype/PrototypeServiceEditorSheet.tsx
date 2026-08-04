/**
 * Add or edit one service on the church's teaching plan.
 *
 * One service per open — deliberately no bulk "create a whole series" flow.
 * Entering a quarter is a once-a-quarter job, and a bulk creator would need its
 * own endpoint, its own partial-failure story, and a second set of validation
 * rules for rows that exist but have nothing in them yet.
 *
 * The series field is free text with a datalist of what this church has already
 * used, so weeks group by equality without a series object and without a typo
 * silently splitting "Life in the Spirit" into two series.
 */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Drawer, DrawerContent } from '@/components/ui/drawer';
import Icon from '@/components/react/Icon';
import { APIError } from '../../lib/api';
import { useNoteTemplates } from '../../hooks/queries/useNoteTemplates';
import {
  useChurchServiceActions,
  type TeachingPlanService,
} from '../../hooks/queries/useChurchTeachingPlan';
import { formatLocalDateInput } from '../../lib/proto-date-picker';
import ProtoDatePicker from './ProtoDatePicker';
import ProtoPopoverShell from './ProtoPopoverShell';
import ProtoDialogBackdrop, { portaledDialogShellClassName } from './ProtoDialogBackdrop';
import { useDismissOnOutside } from '../../hooks/usePopoverDismiss';
import { useProtoOverlayMotion } from '../../hooks/useProtoOverlayMotion';
import { useProtoShell } from '../../layouts/proto-shell-context';
import { useProtoAnchoredPopoverPosition } from './useProtoAnchoredPopoverPosition';

export interface PrototypeServiceEditorSheetProps {
  open: boolean;
  orgId: string | null;
  /** Null = creating a new service. */
  service: TeachingPlanService | null;
  seriesTitles: string[];
  onOpenChange: (open: boolean) => void;
}

/** Backfilling last Sunday is normal; going back a quarter is not. */
function earliestSelectableDate(): string {
  const d = new Date();
  d.setDate(d.getDate() - 56);
  return formatLocalDateInput(d);
}

function nextSunday(): string {
  const d = new Date();
  d.setDate(d.getDate() + ((7 - d.getDay()) % 7));
  return formatLocalDateInput(d);
}

export default function PrototypeServiceEditorSheet({
  open,
  orgId,
  service,
  seriesTitles,
  onOpenChange,
}: PrototypeServiceEditorSheetProps) {
  const { isMobileSidebar } = useProtoShell();
  const { mounted, exiting } = useProtoOverlayMotion(open);
  const actions = useChurchServiceActions(orgId);
  const { data: templates } = useNoteTemplates();
  const cardRef = useRef<HTMLDivElement | null>(null);

  const [serviceDate, setServiceDate] = useState(nextSunday);
  const [title, setTitle] = useState('');
  const [seriesTitle, setSeriesTitle] = useState('');
  const [reference, setReference] = useState('');
  const [starterTemplateId, setStarterTemplateId] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Reset from the row being edited each time the sheet opens, so a cancelled
  // edit never leaks into the next one.
  useEffect(() => {
    if (!open) return;
    setError(null);
    setServiceDate(service?.serviceDate ?? nextSunday());
    setTitle(service?.title ?? '');
    setSeriesTitle(service?.seriesTitle ?? '');
    setReference(service?.reference ?? '');
    setStarterTemplateId(service?.starterTemplateId ?? '');
  }, [open, service]);

  const orgTemplates = templates?.org ?? [];
  const isEditing = Boolean(service);
  const canSubmit = title.trim().length > 0 && Boolean(serviceDate) && !actions.isPending;

  const submit = () => {
    if (!canSubmit) return;
    setError(null);
    const payload = {
      serviceDate,
      title: title.trim(),
      seriesTitle: seriesTitle.trim() || null,
      reference: reference.trim() || null,
      starterTemplateId: starterTemplateId || null,
    };
    actions.mutate(
      isEditing ? { kind: 'update', serviceId: service!.id, ...payload } : { kind: 'create', ...payload },
      {
        onSuccess: () => onOpenChange(false),
        onError: (err) => {
          // The server's INVALID_REFERENCE carries the validator's own wording
          // ("Romans has 16 chapters.") — show it verbatim rather than a
          // generic failure, because it tells the pastor exactly what to fix.
          setError(
            err instanceof APIError
              ? err.message
              : err instanceof Error
                ? err.message
                : 'Could not save this service.',
          );
        },
      },
    );
  };

  const remove = () => {
    if (!service) return;
    if (!window.confirm(`Remove ${service.title} from the plan? Notes people already took stay in their own Harvous.`)) {
      return;
    }
    setError(null);
    actions.mutate(
      { kind: 'delete', serviceId: service.id },
      {
        onSuccess: () => onOpenChange(false),
        onError: (err) =>
          setError(err instanceof Error ? err.message : 'Could not remove this service.'),
      },
    );
  };

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
      topVhFraction: 0.1,
      fallbackWidth: 380,
      fallbackHeight: 560,
    },
    [serviceDate, title],
  );

  useDismissOnOutside(cardRef, () => onOpenChange(false), open && usePopoverPresentation);

  const content = (
    <>
      <div className="proto-study-thread-popover__header">
        <div className="proto-study-thread-popover__title-row">
          <Icon name="calendar" size={13} aria-hidden />
          <span className="proto-study-thread-popover__title">
            {isEditing ? 'Edit service' : 'Add a service'}
          </span>
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
        <label className="proto-inspector-section-title proto-create-folder-sheet__field-label">
          Date
        </label>
        <ProtoDatePicker
          value={serviceDate}
          min={earliestSelectableDate()}
          onChange={setServiceDate}
          aria-label="Service date"
        />

        <label
          className="proto-inspector-section-title proto-create-folder-sheet__field-label"
          htmlFor="proto-service-title"
        >
          Title
        </label>
        <input
          id="proto-service-title"
          type="text"
          className="proto-create-folder-sheet__name-input"
          value={title}
          placeholder="e.g. No Condemnation"
          onChange={(e) => {
            setTitle(e.target.value);
            setError(null);
          }}
        />

        <label
          className="proto-inspector-section-title proto-create-folder-sheet__field-label"
          htmlFor="proto-service-reference"
        >
          Passage
        </label>
        <input
          id="proto-service-reference"
          type="text"
          className="proto-create-folder-sheet__name-input"
          value={reference}
          placeholder="e.g. Romans 8:1-11 — optional"
          onChange={(e) => {
            setReference(e.target.value);
            setError(null);
          }}
        />

        <label
          className="proto-inspector-section-title proto-create-folder-sheet__field-label"
          htmlFor="proto-service-series"
        >
          Series
        </label>
        <input
          id="proto-service-series"
          type="text"
          className="proto-create-folder-sheet__name-input"
          list="proto-service-series-options"
          value={seriesTitle}
          placeholder="e.g. Life in the Spirit — optional"
          onChange={(e) => setSeriesTitle(e.target.value)}
        />
        <datalist id="proto-service-series-options">
          {seriesTitles.map((option) => (
            <option key={option} value={option} />
          ))}
        </datalist>

        {orgTemplates.length > 0 ? (
          <>
            <label
              className="proto-inspector-section-title proto-create-folder-sheet__field-label"
              htmlFor="proto-service-template"
            >
              Notes start from
            </label>
            <select
              id="proto-service-template"
              className="proto-create-folder-sheet__name-input"
              value={starterTemplateId}
              onChange={(e) => setStarterTemplateId(e.target.value)}
            >
              <option value="">Just the passage</option>
              {orgTemplates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name}
                </option>
              ))}
            </select>
          </>
        ) : null}
      </div>

      {error ? (
        <p className="proto-connect-note-sheet__error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="proto-add-notes-sheet__footer">
        {isEditing ? (
          <button
            type="button"
            className="proto-settings-btn proto-settings-btn--secondary"
            disabled={actions.isPending}
            onClick={remove}
          >
            Remove
          </button>
        ) : null}
        <button
          type="button"
          className="proto-share-popover__primary"
          disabled={!canSubmit}
          onClick={submit}
        >
          {actions.isPending ? 'Saving…' : isEditing ? 'Save' : 'Add to plan'}
        </button>
      </div>
    </>
  );

  if (showPopoverPortal && typeof document !== 'undefined') {
    return createPortal(
      <>
        <ProtoDialogBackdrop
          exiting={exiting}
          onDismiss={() => onOpenChange(false)}
          aria-label="Close service editor"
        />
        <ProtoPopoverShell
          ref={cardRef}
          role="dialog"
          aria-label={isEditing ? 'Edit service' : 'Add a service'}
          className={portaledDialogShellClassName(
            'proto-connect-note-popover proto-service-editor-popover',
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
