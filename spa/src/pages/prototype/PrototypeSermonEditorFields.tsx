/**
 * The sermon form itself — every field, and the save/repeat/remove actions.
 *
 * Split out of `PrototypeSermonEditorSheet` when the expanded planner needed
 * the same form as a docked pane rather than a popover. The two presentations
 * differ only in what surrounds them, and duplicating eight hundred lines of
 * field logic to change a wrapper is how the series combobox ends up behaving
 * differently depending on where you opened it from.
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
import Icon from '@/components/react/Icon';
import { APIError } from '../../lib/api';
import { useNoteTemplates } from '../../hooks/queries/useNoteTemplates';
import { useChurchSpaceSermonActions } from '../../hooks/queries/useChurchSpacePlan';
import {
  useChurchSermonActions,
  type ChurchServiceTimeOption,
  type TeachingPlanSeries,
  type TeachingPlanSermon,
} from '../../hooks/queries/useChurchTeachingPlan';
import { formatServiceTime, nextOccurrenceOfDay } from '../../lib/church-services';
import { formatLocalDateInput, parseLocalDateInput } from '../../lib/proto-date-picker';
import { useNotesByReference } from '../../hooks/queries/useNotesByReference';
import { checkScriptureReferenceValidity, normalizeScriptureReference } from '@/utils/scripture-detector';
import { prototypeNoteRouteTo } from '@/lib/prototype-path';
import { noteParamSlug } from './proto-route-slugs';
import ProtoDatePicker from './ProtoDatePicker';

export interface PrototypeSermonEditorFieldsProps {
  orgId: string | null;
  /** Null = creating a new service. */
  service: TeachingPlanSermon | null;
  /** This plan's series, most recently taught first. Never the other plan's. */
  series: TeachingPlanSeries[];
  /** The church's recurring services — which ones this sermon fills. */
  serviceTimes?: ChurchServiceTimeOption[];
  /**
   * Which plan is being edited: null = the church's, a space id = that
   * ministry's. It picks the write path, so an editor opened from a space plan
   * can never post into the church's — the failure this prop exists to prevent.
   */
  planSpaceId?: string | null;
  /** Server's `manage_templates` verdict — gates the empty-state nudge only. */
  canManageChurchTemplates?: boolean;
  /** Opens the Church starters pane; the caller dismisses itself first. */
  onOpenStarters?: () => void;
  /**
   * False while this instance is dismissed but still mounted for its exit
   * animation — the reset below must not fire then. Panes that are always live
   * pass true.
   */
  active: boolean;
  /**
   * Prefill for a new sermon: a date the caller already has in hand (the day
   * cell you clicked), or null for an undated backlog idea. Ignored when
   * editing.
   */
  createDefaultDate?: string | null;
  /**
   * Lets the date be cleared, filing the sermon as an undated idea. The compact
   * sheet leaves this off: the backlog is a board concept, and a date field
   * that can quietly empty itself is a worse default than one that cannot.
   */
  allowNullDate?: boolean;
  /** Saved, repeated to completion, or removed — the caller closes or clears. */
  onDone: () => void;
  /** About to route away to a note. Defaults to `onDone`. */
  onNavigateAway?: () => void;
  /**
   * Fired when the form's height changes for a reason a parent cannot see —
   * the date picker opening, the series list appearing. The popover
   * presentation re-measures on it; the pane ignores it.
   */
  onLayoutChange?: () => void;
}

/** Backfilling last Sunday is normal; going back a quarter is not. */
function earliestSelectableDate(): string {
  const d = new Date();
  d.setDate(d.getDate() - 56);
  return formatLocalDateInput(d);
}

/** "Sun, Aug 9" — enough to confirm the date without opening the calendar. */
export function formatServiceDate(iso: string | null): string {
  if (!iso) return 'No date yet';
  const d = parseLocalDateInput(iso);
  if (!d) return 'Pick a date';
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

export default function PrototypeSermonEditorFields({
  orgId,
  service,
  series,
  serviceTimes = [],
  planSpaceId = null,
  canManageChurchTemplates = false,
  onOpenStarters,
  active,
  createDefaultDate,
  allowNullDate = false,
  onDone,
  onNavigateAway,
  onLayoutChange,
}: PrototypeSermonEditorFieldsProps) {
  const navigate = useNavigate();
  /*
    Both hooks are always called — hook order is fixed — and only the one for
    the plan in hand is used. Choosing here rather than at the call site means
    a caller cannot accidentally hand the church's mutation to a space plan.
  */
  const churchActions = useChurchSermonActions(orgId);
  const spaceActions = useChurchSpaceSermonActions(planSpaceId);
  const actions = planSpaceId ? spaceActions : churchActions;
  const { data: templates } = useNoteTemplates();
  const datePickerRef = useRef<HTMLDivElement | null>(null);

  /*
    The day a new sermon should default to — the church's soonest recurring
    service — held in a ref rather than read directly in the reset effect below.
    `useChurchTeachingPlan` has a 30s staleTime and is invalidated by every
    mutation, so a refetch while the editor is open would re-run that effect if
    this were in its deps, wiping whatever the pastor had typed.
  */
  const defaultDay = serviceTimes.length > 0 ? serviceTimes[0].dayOfWeek : null;
  const defaultServiceDayRef = useRef<number | null>(defaultDay);
  defaultServiceDayRef.current = defaultDay;

  /** '' means unscheduled — only reachable when `allowNullDate`. */
  const [serviceDate, setServiceDate] = useState(() => nextOccurrenceOfDay(defaultDay));
  const [serviceTimeIds, setServiceTimeIds] = useState<string[]>([]);
  const [serviceTime, setServiceTime] = useState('');
  const [title, setTitle] = useState('');
  const [seriesTitle, setSeriesTitle] = useState('');
  /*
    Set only by picking from the list, cleared by typing. That is the whole
    distinction the row buys: picking points at an existing series, typing names
    one — and the server takes either grain.
  */
  const [seriesId, setSeriesId] = useState<string | null>(null);
  const [reference, setReference] = useState('');
  const [starterTemplateId, setStarterTemplateId] = useState('');
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  /** "Repeat weekly" is closed until asked for — most sermons are one week. */
  const [repeatOpen, setRepeatOpen] = useState(false);
  const [repeatWeeks, setRepeatWeeks] = useState(7);
  /** Not an error: the run may have been cut short and still be a success. */
  const [notice, setNotice] = useState<string | null>(null);
  const [seriesListOpen, setSeriesListOpen] = useState(false);
  const [debouncedReference, setDebouncedReference] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Reset from the row being edited each time the editor becomes live, so a
  // cancelled edit never leaks into the next one.
  useEffect(() => {
    if (!active) return;
    setError(null);
    setNotice(null);
    setDatePickerOpen(false);
    setRepeatOpen(false);
    setSeriesListOpen(false);
    setServiceDate(
      service
        ? (service.serviceDate ?? '')
        : createDefaultDate !== undefined
          ? (createDefaultDate ?? '')
          : nextOccurrenceOfDay(defaultServiceDayRef.current),
    );
    setServiceTimeIds(service?.serviceTimeIds ?? []);
    setServiceTime(service?.serviceTime ?? '');
    setTitle(service?.title ?? '');
    setSeriesTitle(service?.seriesTitle ?? '');
    setSeriesId(service?.seriesId ?? null);
    setReference(service?.reference ?? '');
    setStarterTemplateId(service?.starterTemplateId ?? '');
  }, [active, service, createDefaultDate]);

  /*
    Drop any service that no longer falls on the chosen day.

    Without this, moving a sermon from Sunday to Wednesday keeps the Sunday
    9:00 selection in state — invisibly, since the checkbox for it is no longer
    rendered — and saving would file a Wednesday sermon against a Sunday
    service. The server accepts it (the slot really does belong to this church),
    so nothing downstream would catch it. An unscheduled sermon has no day at
    all, so everything goes.
  */
  useEffect(() => {
    if (serviceTimeIds.length === 0) return;
    const dayOfChosenDate = parseLocalDateInput(serviceDate)?.getDay() ?? null;
    const stillValid = new Set(
      serviceTimes.filter((slot) => slot.dayOfWeek === dayOfChosenDate).map((slot) => slot.id),
    );
    const pruned = serviceTimeIds.filter((id) => stillValid.has(id));
    if (pruned.length !== serviceTimeIds.length) setServiceTimeIds(pruned);
  }, [serviceDate, serviceTimes, serviceTimeIds]);

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
    if (!q) return series;
    return series.filter((option) => option.title.toLowerCase().includes(q));
  }, [series, seriesTitle]);

  /** Exactly one match that *is* what you typed means there is nothing to pick. */
  const seriesIsExisting = series.some(
    (option) => option.title.toLowerCase() === seriesTitle.trim().toLowerCase(),
  );
  const showSeriesList = seriesListOpen && seriesMatches.length > 0 && !seriesIsExisting;
  /** Answers "am I joining a series or starting one?" while you type. */
  const startsNewSeries = seriesTitle.trim().length > 0 && !seriesIsExisting;

  /*
    Anything that changes the form's height without the parent touching a prop.
    The popover presentation re-centres on it; without this the calendar opens
    and pushes half the sheet below the fold.
  */
  useEffect(() => {
    onLayoutChange?.();
  }, [onLayoutChange, serviceDate, title, datePickerOpen, showSeriesList, historyNotes.length]);

  const orgTemplates = templates?.org ?? [];
  /*
    Only the services that fall on the chosen day. Offering Wednesday's slot for
    a Sunday sermon would let staff build a plan the calendar cannot honour, and
    the unique index would reject it later with a worse message.
  */
  const chosenDay = parseLocalDateInput(serviceDate)?.getDay() ?? null;
  const sameDaySlots = serviceDate ? serviceTimes.filter((slot) => slot.dayOfWeek === chosenDay) : [];
  const isEditing = Boolean(service);
  const isUnscheduled = !serviceDate;
  const canSubmit =
    title.trim().length > 0 && (Boolean(serviceDate) || allowNullDate) && !actions.isPending;

  const submit = () => {
    if (!canSubmit) return;
    setError(null);
    const payload = {
      /* Explicit null is what files this as a backlog idea; the server treats an
         absent key as a stale client and refuses it. */
      serviceDate: serviceDate || null,
      serviceTimeIds,
      // Only meaningful when no usual service was picked; the server ignores it
      // for display in that case, but sending a stale value would be a lie.
      serviceTime: serviceTimeIds.length > 0 ? null : serviceTime || null,
      title: title.trim(),
      /*
        One key, never both. A picked series is an id; anything typed is a name
        the server resolves — creating the row if this plan has no such series.
        Sending both would make the server choose, and it prefers the id, which
        would silently discard an edit made after picking.
      */
      ...(seriesId ? { seriesId } : { seriesTitle: seriesTitle.trim() || null }),
      reference: reference.trim() || null,
      starterTemplateId: starterTemplateId || null,
    };
    actions.mutate(
      isEditing ? { kind: 'update', serviceId: service!.id, ...payload } : { kind: 'create', ...payload },
      {
        onSuccess: () => onDone(),
        onError: (err) => {
          // The server's INVALID_REFERENCE carries the validator's own wording
          // ("Romans has 16 chapters.") — show it verbatim rather than a
          // generic failure, because it tells the pastor exactly what to fix.
          setError(
            err instanceof APIError
              ? err.message
              : err instanceof Error
                ? err.message
                : 'Could not save this sermon.',
          );
        },
      },
    );
  };

  /**
   * Plan the rest of the run in one go.
   *
   * Server-side because a quarter is thirteen writes and the limit is twenty a
   * minute. It stops at the first week already spoken for and says which —
   * reported here rather than swallowed, since the pastor needs to know their
   * plan is short before they close the editor.
   */
  const repeat = () => {
    if (!service || actions.isPending) return;
    setError(null);
    setNotice(null);
    actions.mutate(
      { kind: 'repeat', serviceId: service.id, weeks: repeatWeeks },
      {
        onSuccess: (res) => {
          const result = res as { services?: unknown[]; stoppedAt?: string | null };
          const added = result?.services?.length ?? 0;
          if (result?.stoppedAt) {
            setNotice(
              `Added ${added} ${added === 1 ? 'week' : 'weeks'}. Stopped at ${formatServiceDate(result.stoppedAt)} — something is already planned then.`,
            );
            return;
          }
          onDone();
        },
        onError: (err) =>
          setError(err instanceof Error ? err.message : 'Could not repeat this sermon.'),
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
        onSuccess: () => onDone(),
        onError: (err) =>
          setError(err instanceof Error ? err.message : 'Could not remove this sermon.'),
      },
    );
  };

  return (
    <>
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
        <div className="proto-service-editor__date-row">
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
          {/*
            Unscheduling from inside the form, for the keyboard path the board's
            drag covers with a mouse. Hidden when there is no date to clear.
          */}
          {allowNullDate && !isUnscheduled ? (
            <button
              type="button"
              className="proto-sheet-quiet-action"
              onClick={() => {
                setServiceDate('');
                setDatePickerOpen(false);
              }}
            >
              Move to ideas
            </button>
          ) : null}
        </div>
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
              aria-label="Sermon date"
            />
          </div>
        ) : null}

        {/*
          Checkboxes, not a single select: one sermon is preached at both Sunday
          morning services, while the evening service hears a different one.
          Only the chosen day's services are offered — a Sunday sermon has no
          business claiming the Wednesday slot, and an undated idea has no day
          to claim one on at all.
        */}
        {sameDaySlots.length > 0 ? (
          <>
            <label className="proto-inspector-section-title proto-create-folder-sheet__field-label">
              <span>Preached at</span>
              <span className="proto-service-editor__optional">optional</span>
            </label>
            <div className="proto-service-editor__slots" role="group" aria-label="Services">
              {sameDaySlots.map((slot) => {
                const checked = serviceTimeIds.includes(slot.id);
                return (
                  <label key={slot.id} className="proto-service-editor__slot">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() =>
                        setServiceTimeIds((ids) =>
                          checked ? ids.filter((id) => id !== slot.id) : [...ids, slot.id],
                        )
                      }
                    />
                    <span>
                      {formatServiceTime(slot.startTime)}
                      {slot.label ? ` · ${slot.label}` : ''}
                    </span>
                  </label>
                );
              })}
            </div>
          </>
        ) : null}

        {/*
          The escape hatch, shown only when no usual service applies: a
          Christmas Eve at 17:00 should not become a permanent Thursday slot on
          the church's week. `<input type="time">` ignores placeholder, so the
          hint has to be a sibling caption.
        */}
        {!isUnscheduled && serviceTimeIds.length === 0 ? (
          <>
            <label
              className="proto-inspector-section-title proto-create-folder-sheet__field-label"
              htmlFor="proto-service-time"
            >
              <span>{sameDaySlots.length > 0 ? 'Or a one-off time' : 'Time'}</span>
              <span className="proto-service-editor__optional">optional</span>
            </label>
            <input
              id="proto-service-time"
              type="time"
              className="proto-create-folder-sheet__name-input"
              value={serviceTime}
              onChange={(e) => setServiceTime(e.target.value)}
            />
          </>
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
                  (onNavigateAway ?? onDone)();
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
              // Typing means naming, not picking — the id no longer describes
              // what is in the field.
              setSeriesId(null);
              setSeriesListOpen(true);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape' && showSeriesList) {
                // Dismiss the list without closing the whole editor.
                e.stopPropagation();
                e.preventDefault();
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
                <li key={option.id}>
                  {/*
                    A real button, in source order after the input — Tab reaches
                    every option without a roving-tabindex implementation.
                  */}
                  <button
                    type="button"
                    role="option"
                    aria-selected={option.id === seriesId}
                    className="proto-service-editor__series-option"
                    onClick={() => {
                      setSeriesTitle(option.title);
                      setSeriesId(option.id);
                      setSeriesListOpen(false);
                    }}
                  >
                    <span className="proto-service-editor__series-option-name">{option.title}</span>
                    {/* Its extent, which is what a series has and a string did
                        not — "8 weeks" tells a pastor they are joining a run. */}
                    {option.serviceCount > 0 ? (
                      <span className="proto-caption proto-service-editor__series-option-count">
                        {option.serviceCount === 1 ? '1 week' : `${option.serviceCount} weeks`}
                      </span>
                    ) : null}
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
            {/* The app's secondary action pill — same control as Add a sermon and
                New space. Noticeable without competing with Save, which is the
                only blue thing in this sheet. */}
            <button
              type="button"
              className="proto-glass-surface proto-glass-surface--control proto-glass-action proto-service-editor__starter-action"
              onClick={() => {
                (onNavigateAway ?? onDone)();
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

      </div>

      {error ? (
        <p className="proto-connect-note-sheet__error" role="alert">
          {error}
        </p>
      ) : null}

      {notice ? (
        <p className="proto-caption proto-service-editor__notice" role="status">
          {notice}
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
          {actions.isPending ? 'Saving…' : isEditing ? 'Save' : isUnscheduled ? 'Add to ideas' : 'Add to plan'}
        </button>
        {/*
          Repeat lives here and only when editing, because it needs a saved row
          to copy — and because planning a run is a second thought after the
          first week exists, not a decision to make while typing it. An undated
          idea has no week to count from, so it is not offered one.
        */}
        {isEditing && !isUnscheduled ? (
          repeatOpen ? (
            <div className="proto-service-editor__repeat">
              <select
                aria-label="How many more weeks"
                className="proto-create-folder-sheet__name-input proto-service-editor__repeat-select"
                value={repeatWeeks}
                disabled={actions.isPending}
                onChange={(e) => setRepeatWeeks(Number(e.target.value))}
              >
                {[3, 5, 7, 11].map((weeks) => (
                  <option key={weeks} value={weeks}>
                    {/* Counted as the series a pastor would say out loud: a
                        "four-week series" is this week plus three more. */}
                    {weeks + 1}-week series
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="proto-glass-surface proto-glass-surface--control proto-glass-action"
                disabled={actions.isPending}
                onClick={repeat}
              >
                <span className="proto-glass-action__label">
                  {actions.isPending ? 'Planning…' : 'Plan it'}
                </span>
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="proto-sheet-quiet-action"
              disabled={actions.isPending}
              onClick={() => {
                setNotice(null);
                setRepeatOpen(true);
              }}
            >
              Repeat weekly
            </button>
          )
        ) : null}
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
}
