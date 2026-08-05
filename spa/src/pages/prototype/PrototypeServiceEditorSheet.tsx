/**
 * Add or edit one service on the church's teaching plan.
 *
 * One service per open — deliberately no bulk "create a whole series" flow.
 * Entering a quarter is a once-a-quarter job, and a bulk creator would need its
 * own endpoint, its own partial-failure story, and a second set of validation
 * rules for rows that exist but have nothing in them yet.
 *
 * The series field is free text, so weeks group by equality without a series
 * object — which makes a typo silently splitting "Life in the Spirit" into two
 * series the failure mode to design against. Reusing an existing name therefore
 * has to be easier than retyping it, at any library size.
 *
 * It is a filtering combobox, not a `<datalist>` and not a chip row. A datalist
 * is unsupported on iOS Safari, so the guard was absent on the platform where
 * typing is hardest; a chip row shows every series at once, which is fine for
 * three and unusable for three years' worth. Typing filters, the list scrolls,
 * and the server hands them back most-recently-used first — the series you are
 * adding a week to is nearly always the current one.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { createPortal } from 'react-dom';
import { Drawer, DrawerContent } from '@/components/ui/drawer';
import Icon from '@/components/react/Icon';
import { APIError } from '../../lib/api';
import { useNoteTemplates } from '../../hooks/queries/useNoteTemplates';
import {
  useChurchServiceActions,
  type TeachingPlanService,
} from '../../hooks/queries/useChurchTeachingPlan';
import { formatLocalDateInput, parseLocalDateInput } from '../../lib/proto-date-picker';
import { useNotesByReference } from '../../hooks/queries/useNotesByReference';
import { checkScriptureReferenceValidity, normalizeScriptureReference } from '@/utils/scripture-detector';
import { prototypeNoteRouteTo } from '@/lib/prototype-path';
import { noteParamSlug } from './proto-route-slugs';
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
  /** The church's ministry channels, for the companion-channel picker. */
  channels?: { id: string; title: string; color: string | null }[];
  /** Server's `manage_templates` verdict — gates the empty-state nudge only. */
  canManageChurchTemplates?: boolean;
  /** Opens the Church starters pane; the sheet closes itself first. */
  onOpenStarters?: () => void;
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

/** "Sun, Aug 9" — enough to confirm the date without opening the calendar. */
function formatServiceDate(iso: string): string {
  const d = parseLocalDateInput(iso);
  if (!d) return 'Pick a date';
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

export default function PrototypeServiceEditorSheet({
  open,
  orgId,
  service,
  seriesTitles,
  channels = [],
  canManageChurchTemplates = false,
  onOpenStarters,
  onOpenChange,
}: PrototypeServiceEditorSheetProps) {
  const { isMobileSidebar } = useProtoShell();
  const navigate = useNavigate();
  const { mounted, exiting } = useProtoOverlayMotion(open);
  const actions = useChurchServiceActions(orgId);
  const { data: templates } = useNoteTemplates();
  const cardRef = useRef<HTMLDivElement | null>(null);
  const datePickerRef = useRef<HTMLDivElement | null>(null);

  const [serviceDate, setServiceDate] = useState(nextSunday);
  const [title, setTitle] = useState('');
  const [seriesTitle, setSeriesTitle] = useState('');
  const [reference, setReference] = useState('');
  const [starterTemplateId, setStarterTemplateId] = useState('');
  const [channelSpaceId, setChannelSpaceId] = useState('');
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [seriesListOpen, setSeriesListOpen] = useState(false);
  const [debouncedReference, setDebouncedReference] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Reset from the row being edited each time the sheet opens, so a cancelled
  // edit never leaks into the next one.
  useEffect(() => {
    if (!open) return;
    setError(null);
    setDatePickerOpen(false);
    setSeriesListOpen(false);
    setServiceDate(service?.serviceDate ?? nextSunday());
    setTitle(service?.title ?? '');
    setSeriesTitle(service?.seriesTitle ?? '');
    setReference(service?.reference ?? '');
    setStarterTemplateId(service?.starterTemplateId ?? '');
    setChannelSpaceId(service?.channelSpaceId ?? '');
  }, [open, service]);

  // The calendar is taller than the body it opens into, so opening it would
  // otherwise leave most of it below the fold.
  useEffect(() => {
    if (!datePickerOpen) return;
    const raf = requestAnimationFrame(() => {
      datePickerRef.current?.scrollIntoView({ block: 'nearest' });
    });
    return () => cancelAnimationFrame(raf);
  }, [datePickerOpen]);

  /*
    Passage history is prep, never a gate on saving. Debounced so a half-typed
    reference doesn't fire a query per keystroke, and validated client-side
    first so the endpoint only ever sees something it can parse.
  */
  useEffect(() => {
    const raw = reference.trim();
    if (!raw) {
      setDebouncedReference('');
      return;
    }
    const id = window.setTimeout(() => setDebouncedReference(raw), 400);
    return () => window.clearTimeout(id);
  }, [reference]);

  const historyReference = useMemo(() => {
    if (!debouncedReference) return null;
    const normalized = normalizeScriptureReference(debouncedReference);
    if (!normalized) return null;
    return checkScriptureReferenceValidity(normalized).ok ? normalized : null;
  }, [debouncedReference]);

  const { data: passageHistory } = useNotesByReference(historyReference);
  const historyNotes = passageHistory?.notes ?? [];

  /**
   * Server order is most-recently-used first, so an unfiltered list already
   * leads with the current series. Typing narrows by substring rather than
   * prefix — "spirit" should find "Life in the Spirit".
   */
  const seriesMatches = useMemo(() => {
    const q = seriesTitle.trim().toLowerCase();
    if (!q) return seriesTitles;
    return seriesTitles.filter((title) => title.toLowerCase().includes(q));
  }, [seriesTitles, seriesTitle]);

  /** Exactly one match that *is* what you typed means there is nothing to pick. */
  const seriesIsExisting = seriesTitles.some(
    (title) => title.toLowerCase() === seriesTitle.trim().toLowerCase(),
  );
  const showSeriesList = seriesListOpen && seriesMatches.length > 0 && !seriesIsExisting;
  /** Answers "am I joining a series or starting one?" while you type. */
  const startsNewSeries = seriesTitle.trim().length > 0 && !seriesIsExisting;

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
      channelSpaceId: channelSpaceId || null,
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
          <Icon name="calendar-check" size={13} aria-hidden />
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
        {/*
          The calendar used to be open permanently: 394px of a 520px modal for
          the one field that already has a sensible default (the coming Sunday),
          which pushed the title, the passage and the save button off screen. It
          opens on demand now, and closes as soon as a date is chosen.
        */}
        <label className="proto-inspector-section-title proto-create-folder-sheet__field-label">
          Date
        </label>
        <button
          type="button"
          className="proto-service-editor__date-chip"
          aria-expanded={datePickerOpen}
          onClick={() => setDatePickerOpen((open) => !open)}
        >
          <Icon name="calendar" size={12} aria-hidden />
          <span className="proto-service-editor__date-value">{formatServiceDate(serviceDate)}</span>
          <Icon name={datePickerOpen ? 'caret-up' : 'caret-down'} size={10} aria-hidden />
        </button>
        {datePickerOpen ? (
          <div ref={datePickerRef}>
            <ProtoDatePicker
              value={serviceDate}
              min={earliestSelectableDate()}
              onChange={(iso) => {
                setServiceDate(iso);
                // Picking a date is the whole reason it was open.
                setDatePickerOpen(false);
              }}
              aria-label="Service date"
            />
          </div>
        ) : null}

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
          placeholder="Sermon title"
          onChange={(e) => {
            setTitle(e.target.value);
            setError(null);
          }}
        />

        <label
          className="proto-inspector-section-title proto-create-folder-sheet__field-label"
          htmlFor="proto-service-reference"
        >
          <span>Passage</span>
          <span className="proto-service-editor__optional">optional</span>
        </label>
        <input
          id="proto-service-reference"
          type="text"
          className="proto-create-folder-sheet__name-input"
          value={reference}
          placeholder="Book chapter:verse"
          onChange={(e) => {
            setReference(e.target.value);
            setError(null);
          }}
        />

        {/*
          The pastor's own notes on this passage — their history, never the
          congregation's. Silent while loading, on error, and with no matches:
          an empty result here is the normal case and deserves no chrome.
        */}
        {historyNotes.length > 0 ? (
          <div className="proto-service-editor__history">
            <p className="proto-caption proto-service-editor__history-head">
              {passageHistory!.totalCount === 1
                ? `You've written on ${passageHistory!.reference} once`
                : `You've written on ${passageHistory!.reference} ${passageHistory!.totalCount} times`}
            </p>
            {historyNotes.map((note) => (
              <button
                key={note.id}
                type="button"
                className="proto-service-editor__history-row"
                onClick={() => {
                  onOpenChange(false);
                  void navigate({
                    to: prototypeNoteRouteTo(),
                    params: { noteId: noteParamSlug(note.id) },
                  });
                }}
              >
                {note.title?.trim() || 'Untitled note'}
              </button>
            ))}
          </div>
        ) : null}

        <label
          className="proto-inspector-section-title proto-create-folder-sheet__field-label"
          htmlFor="proto-service-series"
        >
          <span>Series</span>
          <span className="proto-service-editor__optional">optional</span>
        </label>
        <div
          className="proto-service-editor__combobox"
          // Closes when focus leaves the input *and* the list together, so
          // clicking an option doesn't race the blur that would unmount it.
          onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
              setSeriesListOpen(false);
            }
          }}
        >
          <input
            id="proto-service-series"
            type="text"
            className="proto-create-folder-sheet__name-input"
            role="combobox"
            aria-expanded={showSeriesList}
            aria-controls="proto-service-series-list"
            aria-autocomplete="list"
            autoComplete="off"
            value={seriesTitle}
            placeholder="Series name"
            onFocus={() => setSeriesListOpen(true)}
            onChange={(e) => {
              setSeriesTitle(e.target.value);
              setSeriesListOpen(true);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape' && showSeriesList) {
                // Dismiss the list without closing the whole sheet.
                e.stopPropagation();
                setSeriesListOpen(false);
              }
            }}
          />
          {showSeriesList ? (
            <ul
              id="proto-service-series-list"
              className="proto-service-editor__series-list"
              role="listbox"
              aria-label="Series this church has used"
            >
              {seriesMatches.map((option) => (
                <li key={option}>
                  {/*
                    A real button, in source order after the input — Tab reaches
                    every option without a roving-tabindex implementation.
                  */}
                  <button
                    type="button"
                    role="option"
                    aria-selected={false}
                    className="proto-service-editor__series-option"
                    onClick={() => {
                      setSeriesTitle(option);
                      setSeriesListOpen(false);
                    }}
                  >
                    {option}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          {startsNewSeries && !showSeriesList ? (
            <p className="proto-caption proto-service-editor__series-hint">
              Starts a new series
            </p>
          ) : null}
        </div>

        {/*
          A church with no starters used to see nothing here at all, which made
          the feature invisible to exactly the person who could create one. Tell
          them it exists and where it lives; congregants still see nothing.
        */}
        {orgTemplates.length === 0 && canManageChurchTemplates && onOpenStarters ? (
          <>
            <label className="proto-inspector-section-title proto-create-folder-sheet__field-label">
              Notes start from
            </label>
            <p className="proto-caption proto-service-editor__starter-hint">
              Just the passage. Save a template to give everyone a shape to write into.
            </p>
            {/* The app's secondary action pill — same control as Add service and
                New space. Noticeable without competing with Save, which is the
                only blue thing in this sheet. */}
            <button
              type="button"
              className="proto-glass-surface proto-glass-surface--control proto-glass-action proto-service-editor__starter-action"
              onClick={() => {
                onOpenChange(false);
                onOpenStarters();
              }}
            >
              <Icon name="list-check" size={12} aria-hidden />
              <span className="proto-glass-action__label">Note templates</span>
            </button>
          </>
        ) : null}

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

        {/*
          Optional pointer from a service to the channel carrying its study
          material. Deliberately not a claim that the sermon *comes from* the
          channel — the congregant surface says "Study material", and the card
          is never tinted by the channel's color.
        */}
        {channels.length > 0 ? (
          <>
            <label
              className="proto-inspector-section-title proto-create-folder-sheet__field-label"
              htmlFor="proto-service-channel"
            >
              <span>Companion channel</span>
              <span className="proto-service-editor__optional">optional</span>
            </label>
            <select
              id="proto-service-channel"
              className="proto-create-folder-sheet__name-input"
              value={channelSpaceId}
              onChange={(e) => setChannelSpaceId(e.target.value)}
            >
              <option value="">None</option>
              {channels.map((channel) => (
                <option key={channel.id} value={channel.id}>
                  {channel.title}
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

      {/*
        Save first, in the DOM as well as visually. Removing used to be a
        full-width filled button *above* Save: more weight than the primary
        action, and sitting directly on the path to it.
      */}
      <div className="proto-add-notes-sheet__footer proto-sheet-footer--stacked">
        <button
          type="button"
          className="proto-share-popover__primary"
          disabled={!canSubmit}
          onClick={submit}
        >
          {actions.isPending ? 'Saving…' : isEditing ? 'Save' : 'Add to plan'}
        </button>
        {isEditing ? (
          // "Remove" alone never said from what — and the answer matters here,
          // because it isn't the congregation's notes. Those survive; the
          // confirm says so, but the button shouldn't need the confirm to be
          // legible.
          <button
            type="button"
            className="proto-sheet-quiet-action proto-sheet-quiet-action--danger"
            disabled={actions.isPending}
            onClick={remove}
          >
            Remove from plan
          </button>
        ) : null}
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
