/**
 * The sermon form itself — every field, and the save/repeat/remove actions.
 *
 * Split out of the old sermon editor sheet when the expanded planner needed
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
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import ProtoConfirmDialog from './ProtoConfirmDialog';
import { useNavigate } from '@tanstack/react-router';
import Icon from '@/components/react/Icon';
import { APIError } from '../../lib/api';
import { useNoteTemplates } from '../../hooks/queries/useNoteTemplates';
import { planSermonNoteLink } from '../../lib/church-services';
import { usePrototypeHomeSpaceId } from '../../hooks/usePrototypeHomeSpaceId';
import { useChurchSpaceSermonActions } from '../../hooks/queries/useChurchSpacePlan';
import {
  useChurchSermonActions,
  type ChurchServiceTimeOption,
  type TeachingPlanSeries,
  type TeachingPlanSermon,
} from '../../hooks/queries/useChurchTeachingPlan';
import {
  formatServiceTime,
  nextOccurrenceOfDay,
  planVocabulary,
  rhythmDates,
} from '../../lib/church-services';
import { formatLocalDateInput, parseLocalDateInput } from '../../lib/proto-date-picker';
import { useNotesByReference } from '../../hooks/queries/useNotesByReference';
import { checkScriptureReferenceValidity, normalizeScriptureReference } from '@/utils/scripture-detector';
import { prototypeNoteRouteTo } from '@/lib/prototype-path';
import { noteParamSlug } from './proto-route-slugs';
import ProtoDatePicker from './ProtoDatePicker';
import ProtoSelectMenu from './ProtoSelectMenu';
import PrototypeStarterPreview from './planner/PrototypeStarterPreview';
import ProtoNoteSearch from './ProtoNoteSearch';
import { isPresentableServerMessage } from '../../lib/error-copy';
import { stripHtmlForListPreview } from '@/utils/html-stripper';

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
  /**
   * What the plan plans. `'content'` (a ministry channel) drops the one-off
   * time field: a published study has a day, not an hour people arrive at, and
   * the server refuses `serviceTime` on space rows anyway — offering the input
   * would let staff set something that is silently discarded.
   */
  planKind?: 'gathering' | 'content';
  /**
   * Whether a church stands behind this plan — its own, or a room it hosts.
   * Gates whether the church's note templates are offered as starters. Defaults
   * true, which is the church plan's own answer.
   */
  hasChurch?: boolean;
  /**
   * The rhythm this room already declares, offered as dates instead of an empty
   * field. `meetingDay` anchors a room that meets; `intervalDays` is 7 for
   * weekly or the cadence interval for a channel that publishes.
   *
   * **Offers only.** A room's rhythm is a fact about the room, not a schedule —
   * nothing here recurs, reminds, or fires on a clock, and a pastor still enters
   * every entry deliberately. Absent, or with a null interval, the field behaves
   * exactly as it did before: one seeded default and a picker.
   */
  rhythm?: { meetingDay: number | null; intervalDays: number | null };
  /**
   * Extra fields rendered at the end of the scrolling region, above the footer.
   * The compact sheet puts the resources picker here; the docked pane scrolls
   * its whole body and composes it itself.
   */
  trailingFields?: ReactNode;
  /** Saved, repeated to completion, or removed — the caller closes or clears. */
  onDone: () => void;
  /** About to route away to a note. Defaults to `onDone`. */
  onNavigateAway?: () => void;
  /**
   * Whether this viewer may reshape the plan. The docked pane only mounts these
   * fields when they can, so it never passes it; the sheet mounts them either
   * way, and "Write this sermon" writes to a `manage_teaching_plan` route — a
   * button that always 403s is worse than no button.
   */
  canWrite?: boolean;
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
  planKind,
  hasChurch = true,
  trailingFields,
  onDone,
  onNavigateAway,
  canWrite = true,
  onLayoutChange,
  rhythm,
}: PrototypeSermonEditorFieldsProps) {
  const navigate = useNavigate();
  /* The word for what is being planned. "Sermon title" was hardcoded here, so
     a channel that had been told it was adding content was still asked for a
     sermon by the field it had to type into first. */
  const noun = planVocabulary({ onSpacePlan: planSpaceId != null, planKind }).itemNoun;
  /*
    Both hooks are always called — hook order is fixed — and only the one for
    the plan in hand is used. Choosing here rather than at the call site means
    a caller cannot accidentally hand the church's mutation to a space plan.
  */
  /* Recomputed only when the rhythm itself changes — not per render, and not
     per keystroke in the form above it. */
  const rhythmSuggestions = useMemo(
    () =>
      rhythm
        ? rhythmDates({ meetingDay: rhythm.meetingDay, intervalDays: rhythm.intervalDays })
        : [],
    [rhythm?.meetingDay, rhythm?.intervalDays],
  );
  const churchActions = useChurchSermonActions(orgId);
  const spaceActions = useChurchSpaceSermonActions(planSpaceId);
  const actions = planSpaceId ? spaceActions : churchActions;
  /*
    Scoped to the plan's own room. Called bare, this asked for no space and then
    read only `templates.org` — so a churchless life group was offered its
    *owner's church's* templates and none of its own, while `NoteTemplates`
    had carried a `spaceId` scope the whole time.
  */
  const { data: templates } = useNoteTemplates(planSpaceId);
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

  /*
    Seed from the row being edited each time the editor becomes live, so a
    cancelled edit never leaks into the next one.

    **Keyed on the row's identity, not the row object.** It used to depend on
    `service` itself, which looks equivalent and is not: every plan mutation
    invalidates the query, and a refetched row that differs in any field — a
    colleague's edit, or this editor's own note link landing — is a new object.
    The effect then re-seeded every field from the server and discarded whatever
    the pastor had typed. That was invisible while the only in-editor write
    navigated away; the moment a note is linked in place it is data loss.

    A form owns its state from the moment it opens. Re-seeding mid-edit was
    never wanted, so the row is read through a ref and only its *identity*
    triggers a reset.
  */
  const serviceRef = useRef(service);
  serviceRef.current = service;
  const serviceKey = service?.id ?? null;
  useEffect(() => {
    if (!active) return;
    const row = serviceRef.current;
    setError(null);
    setNotice(null);
    setDatePickerOpen(false);
    setRepeatOpen(false);
    setSeriesListOpen(false);
    setServiceDate(
      row
        ? (row.serviceDate ?? '')
        : createDefaultDate !== undefined
          ? (createDefaultDate ?? '')
          : nextOccurrenceOfDay(defaultServiceDayRef.current),
    );
    setServiceTimeIds(row?.serviceTimeIds ?? []);
    setServiceTime(row?.serviceTime ?? '');
    setTitle(row?.title ?? '');
    setSeriesTitle(row?.seriesTitle ?? '');
    setSeriesId(row?.seriesId ?? null);
    setReference(row?.reference ?? '');
    setStarterTemplateId(row?.starterTemplateId ?? '');
    setPickedNoteId(row?.viewerDraftNoteId ?? null);
    setPickedNoteTitle(row?.viewerDraftNoteTitle ?? null);
  }, [active, serviceKey, createDefaultDate]);

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

  /*
    The church's templates belong to a plan the church is behind — its own, or a
    room it hosts. A churchless life group was being offered them purely because
    its owner happens to be connected to a church, which is nobody's idea of
    "this room's templates".
  */
  const orgTemplates = hasChurch ? (templates?.org ?? []) : [];
  const spaceTemplates = templates?.space ?? [];
  /*
    Space first, then church. Personal templates are deliberately absent: this
    hands a copy to everyone who writes about the entry, so offering one saved
    as private would publish it — and leave a co-leader looking at a starter
    they cannot open, edit or explain.
  */
  const starterTemplates = [...spaceTemplates, ...orgTemplates];

  /* Same shape from either scope — a tile does not care which list it came from,
     only the caption above it does. */
  const toStarterChoice = (template: (typeof starterTemplates)[number]) => ({
    id: template.id,
    name: template.name,
    content: template.content,
    iconColor: template.iconColor,
  });
  const selectedStarter = starterTemplateId
    ? (orgTemplates.find((template) => template.id === starterTemplateId) ?? null)
    : null;
  /*
    What the congregation will actually be handed, in the template author's own
    words where they wrote any.

    `description` first because it is the human explanation the browse sheet
    already shows; the stripped opening of the template second, because a shape
    with no description still has a first line, and seeing "Big idea · What
    stood out" answers "what does this do" better than any sentence about it
    could. Short — this sits under a select in a 420px rail, not in a preview
    pane — and quoted by the caller rather than here, so an empty template
    degrades to a sentence that still reads.
  */
  const starterPreview = selectedStarter
    ? (selectedStarter.description?.trim() ||
       stripHtmlForListPreview(selectedStarter.content ?? '', 60).trim())
    : '';

  /*
    Which of the pastor's own notes this sermon *is*.

    The direction that matters: a sermon is written before it is scheduled, so
    the plan points at existing work rather than seeding new work. An earlier
    build had this backwards — a "Write this sermon" button that created a
    blank note from the plan row — which inverted where the work actually
    starts.

    `viewerDraftNoteId` is the server's answer for "which note did *I* link",
    scoped to this viewer and nobody else. A colleague's draft never appears
    here and never changes what this shows.
  */
  const { homeSpaceId } = usePrototypeHomeSpaceId();
  const linkedNoteId = service?.viewerDraftNoteId ?? null;
  const [pickedNoteId, setPickedNoteId] = useState<string | null>(null);
  const [pickedNoteTitle, setPickedNoteTitle] = useState<string | null>(null);

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
    /*
      Sequential, and awaited — `actions` is one mutation object, so overlapping
      `mutate` calls would scramble a single `isPending` between them.

      The note link is necessarily a second write: it needs a service id, and the
      alternative (a bespoke create-from-note endpoint) would restate this
      route's date parsing, slot filtering, collision guards and series
      resolution. A create that lands and a link that fails leaves a real plan
      row the pastor can see — say so rather than rolling back.
    */
    void (async () => {
      let serviceId = isEditing ? service!.id : null;
      try {
        const res = await actions.mutateAsync(
          isEditing
            ? { kind: 'update', serviceId: service!.id, ...payload }
            : { kind: 'create', ...payload },
        );
        if (!serviceId) {
          serviceId = (res as { service?: { id?: string } } | undefined)?.service?.id ?? null;
        }
      } catch (err) {
        // The server's INVALID_REFERENCE carries the validator's own wording
        // ("Romans has 16 chapters.") — show it verbatim rather than a
        // generic failure, because it tells the pastor exactly what to fix.
        setError(
          err instanceof APIError && isPresentableServerMessage(err)
            ? err.message
            : err instanceof Error && isPresentableServerMessage(err)
              ? err.message
              : 'Could not save this sermon.',
        );
        return;
      }

      /*
        Unlink the old note before linking the new one — see
        `planSermonNoteLink`. `plannedForServiceId` is a column, not a join row,
        so writing the new link alone would leave both notes stamped and the
        planner would report an arbitrary one of the two.
      */
      const links = serviceId
        ? planSermonNoteLink({
            previousNoteId: linkedNoteId,
            nextNoteId: pickedNoteId,
            serviceId,
          })
        : [];
      try {
        for (const link of links) await actions.mutateAsync({ kind: 'link-note', ...link });
      } catch {
        setError(
          `Saved the ${noun}, but the note didn't link. Open it again to try.`,
        );
        return;
      }
      onDone();
    })();
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

  const [removeAnchor, setRemoveAnchor] = useState<DOMRect | null>(null);

  const remove = () => {
    if (!service) return;
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
        {/*
          The room's own rhythm, offered as dates.

          `schema.ts` says of `meetingDay`/`publishCadence`: "Nothing here
          schedules, reminds, or recurs; whoever runs the room still enters every
          gathering by hand." That stays true — this only stops them retyping a
          date the room already declares. Nothing recurs and nothing fires.

          Only while creating: an existing entry has a date, and offering to move
          it onto the rhythm is a different question nobody asked.
        */}
        {!service && rhythmSuggestions.length > 0 ? (
          <div className="proto-rhythm-dates">
            {rhythmSuggestions.map((iso) => (
              <button
                key={iso}
                type="button"
                className={`proto-chip${iso === serviceDate ? ' proto-chip--selected' : ''}`}
                aria-pressed={iso === serviceDate}
                onClick={() => {
                  setServiceDate(iso);
                  setDatePickerOpen(false);
                }}
              >
                {formatServiceDate(iso)}
              </button>
            ))}
          </div>
        ) : null}

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
              aria-label={`${noun.charAt(0).toUpperCase()}${noun.slice(1)} date`}
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
                    {/*
                      The input stays and stays real — it carries the checked
                      state, the keyboard, and the label association. It is
                      visually replaced, not removed, so the orb the rest of
                      the app selects with is what you see here too.
                    */}
                    <input
                      type="checkbox"
                      className="proto-service-editor__slot-input"
                      checked={checked}
                      onChange={() =>
                        setServiceTimeIds((ids) =>
                          checked ? ids.filter((id) => id !== slot.id) : [...ids, slot.id],
                        )
                      }
                    />
                    <span className="proto-service-editor__slot-orb" aria-hidden>
                      {checked ? (
                        <span className="proto-accent-check-orb proto-accent-check-orb--selected">
                          <Icon name="check" size={9} />
                        </span>
                      ) : (
                        <span className="proto-select-orb-idle" />
                      )}
                    </span>
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
        {!isUnscheduled && planKind !== 'content' && serviceTimeIds.length === 0 ? (
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
          placeholder={`${noun.charAt(0).toUpperCase()}${noun.slice(1)} title`}
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
          Which of my notes this sermon is.

          Above the starter template on purpose: this answers "what did I write",
          the starter answers "what does the congregation write into", and the
          first is the one a pastor came here to say. Optional — a plan row for a
          sermon not yet written is perfectly ordinary, which is why nothing here
          gates Save.

          Only when editing. A note is linked *to a service id*, and an unsaved
          row has none; on create the pick is held in state and written straight
          after the service exists.
        */}
        {canWrite && isEditing ? (
          <>
            <label className="proto-inspector-section-title proto-create-folder-sheet__field-label">
              <span>My notes for this {noun}</span>
              <span className="proto-service-editor__optional">optional</span>
            </label>
            {pickedNoteId ? (
              /* The linked note, in the same row shape the resources field uses
                 — one thing attached, with the way to detach it on the right. */
              <div className="proto-planner-resources__row">
                <span className="proto-planner-resources__row-text">
                  <span className="pds-list-title proto-marquee" title={pickedNoteTitle ?? undefined}>
                    <span>{pickedNoteTitle?.trim() || 'Untitled note'}</span>
                  </span>
                </span>
                <button
                  type="button"
                  className="proto-side-panel__action-btn"
                  aria-label="Unlink this note"
                  title="Unlink"
                  disabled={actions.isPending}
                  onClick={() => {
                    setPickedNoteId(null);
                    setPickedNoteTitle(null);
                  }}
                >
                  <Icon name="xmark" size={12} />
                </button>
              </div>
            ) : homeSpaceId ? (
              <div className="proto-service-editor__note-picker">
                {/*
                  My Home, and deliberately so: `resolveCanonicalCreateScope`
                  files every shared-space note under My Home canonically, so
                  this pool is every note this pastor has written — not only
                  the ones sitting loose in their personal space.
                */}
                <ProtoNoteSearch
                  homeSpaceId={homeSpaceId}
                  disabled={actions.isPending}
                  onPick={(note) => {
                    setPickedNoteId(note.id);
                    setPickedNoteTitle(note.title ?? null);
                  }}
                />
              </div>
            ) : (
              <p className="proto-caption proto-service-editor__starter-hint">Loading your notes…</p>
            )}
          </>
        ) : null}

        {/*
          A church with no starters used to see nothing here at all, which made
          the feature invisible to exactly the person who could create one. Tell
          them it exists and where it lives; congregants still see nothing.
        */}
        {starterTemplates.length === 0 ? (
          <>
            {/* Same label as the populated field below — a church with no
                templates yet should learn what the setting is, not meet a
                different name for it once they have one. */}
            <label className="proto-inspector-section-title proto-create-folder-sheet__field-label">
              Their notes start with
            </label>
            {/*
              The label opens the sentence and this finishes it, exactly as the
              tiles do once there is something to choose.

              Shown to *every* plan with no templates, not only a church that can
              write them. Gating the whole block on `canManageChurchTemplates`
              meant a churchless room — which cannot have church templates by
              definition — lost the field entirely and never learned starters
              existed. The second sentence is the part that varies: only a church
              gets a button, so everyone else is told where its templates come
              from instead.
            */}
            <p className="proto-caption proto-service-editor__starter-hint">
              The passage and a blank page.{' '}
              {canManageChurchTemplates && onOpenStarters
                ? 'Save a template to give everyone a shape to write into.'
                : 'Templates saved to this space appear here.'}
            </p>
            {/* The app's secondary action pill — same control as Add a sermon and
                New space. Noticeable without competing with Save, which is the
                only blue thing in this sheet. */}
            {canManageChurchTemplates && onOpenStarters ? (
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
            ) : null}
          </>
        ) : null}

        {starterTemplates.length > 0 ? (
          <>
            {/*
              Named for the object, not the trigger.

              This has now been wrong in both directions. "Notes start from"
              described the plumbing and never said *whose* notes, so a pastor
              read it as a setting for their own prep. "When someone takes
              notes" fixed the whose and lost the what: a bare subordinate
              clause among five one-word labels, naming the moment this applies
              and never the thing being chosen — and the options then had to
              carry the verb, which produced "Start from Here we go" for any
              template whose name is not a noun phrase.

              So: the label is the sentence's opening, the options finish it,
              and the hint below shows what the congregation actually receives
              rather than restating who they are.
            */}
            <label className="proto-inspector-section-title proto-create-folder-sheet__field-label">
              <span>Their notes start with</span>
              <span className="proto-service-editor__optional">optional</span>
            </label>
            {/*
              Tiles, not a select. A name in a dropdown could not answer the one
              question the field is asked — what does picking this do — and the
              app already had the answer's shape in two places: the appearance
              picker draws the theme it is offering, and the browse sheet gives
              every template a colour of its own.

              The bare names stay as the labels underneath. The verb belongs to
              the field's label, and gluing one on made each option read as a
              fragment of a sentence the template's author never wrote.
            */}
            <PrototypeStarterPreview
              label={`What a congregant's notes on this ${noun} start with`}
              value={starterTemplateId}
              hasPassage={Boolean(reference.trim())}
              disabled={actions.isPending}
              onChange={setStarterTemplateId}
              groups={[
                /* No caption on the head: "Just the passage" is not a scope, and
                   naming it would invent a category to balance the others. */
                { label: null, choices: [{ id: '', name: 'Just the passage' }] },
                ...(spaceTemplates.length > 0
                  ? [{ label: 'This space', choices: spaceTemplates.map(toStarterChoice) }]
                  : []),
                ...(orgTemplates.length > 0
                  ? [{ label: 'From your church', choices: orgTemplates.map(toStarterChoice) }]
                  : []),
              ]}
            />
            {/*
              What they get, not who they are. The old hint spent both its
              clauses on the audience — which the label already names — and left
              "this template" to do all the explaining, so the one question the
              field could not answer was what picking it would actually do.

              A template's own description is the author's explanation of it, and
              is what the browse sheet shows; falling back to the opening of the
              template itself is the next most honest thing, because that is
              literally the page the congregation lands on.
            */}
            <p className="proto-caption proto-service-editor__starter-hint">
              {selectedStarter
                ? `Everyone who writes about this ${noun} starts from this template, under the passage.`
                : `Everyone who writes about this ${noun} gets the passage and a blank page.`}
            </p>
            {/*
              The preview is its own line, not a clause inside the sentence
              above. Both things it can hold are free text an author wrote for
              some other purpose — a description is a sentence about the
              template, a content preview is the template's own first words —
              and neither slots into "…then X to write into" without breaking:
              the first draft of this read "then Lets see this to write into."
            */}
            {starterPreview ? (
              <p className="proto-caption proto-service-editor__starter-preview">
                {starterPreview}
              </p>
            ) : null}
          </>
        ) : null}

        {/*
          Inside the scrolling region, deliberately. A caller that appended its
          own block after this component got a section the card could not reach:
          the fields scroll, the footer is pinned, and anything between them
          simply hung off the bottom edge.
        */}
        {trailingFields}
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
          {actions.isPending
            ? 'Saving…'
            : isEditing
              ? 'Save'
              : isUnscheduled
                ? 'Add to ideas'
                : 'Add to plan'}
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
              <ProtoSelectMenu
                label="How many more weeks"
                className="proto-service-editor__repeat-select"
                value={repeatWeeks}
                disabled={actions.isPending}
                onChange={setRepeatWeeks}
                options={[3, 5, 7, 11].map((weeks) => ({
                  value: weeks,
                  /* Counted as the series a pastor would say out loud: a
                     "four-week series" is this week plus three more. */
                  label: `${weeks + 1}-week series`,
                }))}
              />
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
          ) : null
        ) : null}
        {/*
          The two secondary acts share a row. Stacked full-width they were three
          decks of button under the form — and equal width gave "Remove from
          plan" the same weight as Save, which is not the shape of the choice.
        */}
        {isEditing && !repeatOpen ? (
          <div className="proto-sheet-footer__row">
            {!isUnscheduled ? (
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
            ) : null}
            {/* "Remove" alone never said from what — and the answer matters
                here, because it isn't the congregation's notes. Those survive;
                the confirm says so, but the button shouldn't need the confirm
                to be legible. */}
            <button
              type="button"
              className="proto-sheet-quiet-action proto-sheet-quiet-action--danger"
              disabled={actions.isPending}
              onClick={(e) => setRemoveAnchor(e.currentTarget.getBoundingClientRect())}
            >
              Remove from plan
            </button>
          </div>
        ) : null}
      </div>
      {/* Anchored to the button that raised it, like every other destructive
          confirm in the prototype. This used to be `window.confirm` — an OS
          dialog with its own type, radius and buttons, dropped into the middle
          of a surface that has spent every other pixel not looking like that. */}
      {removeAnchor ? (
        <ProtoConfirmDialog
          anchorRect={removeAnchor}
          preferAbove
          alignRight
          title={`Remove ${service?.title ?? "this"} from the plan?`}
          description="Notes people already took stay in their own Harvous."
          confirmLabel="Remove"
          busy={actions.isPending}
          onConfirm={() => {
            setRemoveAnchor(null);
            remove();
          }}
          onCancel={() => setRemoveAnchor(null)}
        />
      ) : null}
    </>

  );
}
