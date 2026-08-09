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
import ProtoConfirmDialog from './ProtoConfirmDialog';
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
import ProtoDatePicker from './ProtoDatePicker';
import { nextOccurrenceOfDay } from '../../lib/church-services';
import { formatLocalDateInput } from '../../lib/proto-date-picker';
import ProtoSelectMenu from './ProtoSelectMenu';
import ProtoSpaceMenuIcon from './ProtoSpaceMenuIcon';
import { SPACE_COVER_PICKER_COLORS, spacePickerSwatchColor } from '@/utils/space-cover';
import { seriesAccent } from '../../lib/church-services';

export interface PrototypeSeriesSheetProps {
  open: boolean;
  series: TeachingPlanSeries | null;
  /** This series' sermons, ascending — the plan pane already holds them. */
  services: TeachingPlanSermon[];
  /**
   * Every sermon in this plan — the pool "add weeks that already exist" picks
   * from. Passed whole rather than pre-filtered so the sheet can explain *why*
   * a row is unavailable rather than silently omitting it.
   */
  planServices?: TeachingPlanSermon[];
  /** False for a teacher, or a lapsed church: the sheet reads, never writes. */
  canWrite: boolean;
  pending: boolean;
  error: string | null;
  /**
   * A partial success — "copied 3 of 8, stopped at Sep 6". Not an error, and
   * deliberately not rendered as one: the run that landed is real and the
   * pastor needs to see where it stopped, which is the whole reason the server
   * reports the date rather than failing the batch.
   */
  notice?: string | null;
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
   * Publish (or re-publish) this series into the room as a study plan.
   * Absent on the church-wide plan, which has no single room to publish into.
   */
  onPublishThread?: (series: TeachingPlanSeries) => void;
  /**
   * Extend the run: `weeks` more Sundays after its last dated one, each a
   * placeholder carrying the series name and no passage.
   */
  onAddWeeks: (series: TeachingPlanSeries, seedServiceId: string, weeks: number) => void;
  /** Drop the untouched placeholders — never a week anyone has written into. */
  onRemoveEmpty: (series: TeachingPlanSeries, serviceIds: string[]) => void;
  /**
   * Move sermons that already exist under this series. No new endpoint — this
   * is N ordinary updates, which is also why it is all-or-nothing per row
   * rather than a batch: a failure leaves the ones that landed, which is a
   * state the plan can already show.
   */
  onAssign?: (series: TeachingPlanSeries, serviceIds: string[]) => void;
  /** Teach this series again on new dates — the seasonal case. */
  onRerun?: (
    series: TeachingPlanSeries,
    input: { startDate: string; copy: { titles: boolean; references: boolean; starterTemplate: boolean; resources: boolean } },
  ) => void;
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
  onPublishThread,
  error,
  notice = null,
  onUpdate,
  onDelete,
  onAddWeeks,
  onRemoveEmpty,
  planServices = [],
  onAssign,
  onRerun,
  onOpenChange,
}: PrototypeSeriesSheetProps) {
  const { isMobileSidebar } = useProtoShell();
  const { mounted, exiting } = useProtoOverlayMotion(open);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  /** How many weeks the "Add weeks" control will append. */
  const [addWeeks, setAddWeeks] = useState(3);
  /** Which existing sermons are checked for moving under this series. */
  const [assigning, setAssigning] = useState(false);
  const [assignIds, setAssignIds] = useState<string[]>([]);
  /** The re-run form, and what it carries across. */
  const [rerunOpen, setRerunOpen] = useState(false);
  const [rerunDate, setRerunDate] = useState('');
  const [rerunCopy, setRerunCopy] = useState({
    titles: true,
    references: true,
    starterTemplate: true,
    /* Off: a handout carrying last year's dates, or a link that has since
       moved, is worse than an empty shelf. */
    resources: false,
  });

  // Reset from the row each time the sheet opens, so an abandoned rename never
  // leaks into the next series you look at.
  useEffect(() => {
    if (!open) return;
    setTitle(series?.title ?? '');
    setDescription(series?.description ?? '');
    setAssigning(false);
    setAssignIds([]);
    setRerunOpen(false);
    setRerunDate('');
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
  /* Sermons with no series at all. Moving one *between* series is a different
     decision and would quietly shorten somebody else's run. */
  const assignable = planServices.filter((s) => !s.seriesId);

  /* Both confirms live here rather than in the parent: this is where the
     buttons are, and an anchored confirm needs the rect of the thing that
     raised it. The parents used to ask with `window.confirm` from inside a
     callback, which is also why they could not anchor. */
  const [emptyAnchor, setEmptyAnchor] = useState<DOMRect | null>(null);
  const [deleteAnchor, setDeleteAnchor] = useState<DOMRect | null>(null);
  const removable = services.filter(
    (s) => !s.reference && s.title.trim() === series.title.trim(),
  );

  const content = (
    <>
      <div className="proto-study-thread-popover__header">
        {/*
          The tile earns its place now that it carries a *colour*.

          It was dropped once, correctly: a generic glyph beside the name only
          repeated "this is a series", which the sheet's contents already said.
          What it says now is which run this is — the same hue the board's spine
          and every card in the run are drawn in — so opening a series from the
          plan confirms you opened the one you pointed at.
        */}
        <div className="proto-study-thread-popover__title-row">
          <ProtoSpaceMenuIcon
            color={shownColor}
            iconName="layer-group"
            size={22}
            radius={6}
          />
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
              <span>Color</span>
              {/* Says the run is already drawn, so this reads as a change rather
                  than as a required field nobody filled in. */}
              {!series.color ? (
                <span className="proto-service-editor__optional">Chosen for you</span>
              ) : null}
            </p>
            <div
              className="proto-space-cover-picker__tray"
              role="radiogroup"
              aria-label="Series color"
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

        {/*
          Weeks that already exist.

          A pastor who has planned four standalone Sundays and then decides they
          are one study had, until now, to open each sermon and retype the
          series name. This is that, in one act — and it is deliberately not a
          batch endpoint: N ordinary updates means a partial failure leaves the
          ones that landed, which is a state the plan can already render.

          Only sermons not already in a series are offered. Moving one *between*
          series is a different decision, and doing it silently from here would
          quietly empty somebody else's run.
        */}
        {canWrite && assignable.length > 0 ? (
          <div className="proto-series-sheet__assign">
            {assigning ? (
              <>
                <p className="proto-inspector-section-title proto-create-folder-sheet__field-label">
                  <span>Weeks to move here</span>
                  <span className="proto-service-editor__optional">
                    {assignIds.length} chosen
                  </span>
                </p>
                <div className="proto-glass-surface proto-glass-surface--panel proto-church-tools proto-series-sheet__assign-list">
                  {assignable.map((service) => {
                    const checked = assignIds.includes(service.id);
                    return (
                      <button
                        key={service.id}
                        type="button"
                        className="proto-church-tools__row"
                        aria-pressed={checked}
                        disabled={pending}
                        onClick={() =>
                          setAssignIds((prev) =>
                            checked ? prev.filter((id) => id !== service.id) : [...prev, service.id],
                          )
                        }
                      >
                        <ProtoServiceDateTile
                          iso={service.serviceDate}
                          unwritten={!service.reference}
                        />
                        <span className="proto-church-tools__row-text">
                          <span className="pds-list-title proto-church-tools__row-title">
                            {service.title}
                          </span>
                          <span className="proto-caption proto-church-tools__row-meta">
                            {service.reference || 'No passage yet'}
                          </span>
                        </span>
                        <span className="proto-church-tools__row-chevron" aria-hidden>
                          <Icon name={checked ? 'check' : 'plus'} size={11} />
                        </span>
                      </button>
                    );
                  })}
                </div>
                <div className="proto-sheet-footer__row">
                  <button
                    type="button"
                    className="proto-share-popover__primary"
                    disabled={pending || assignIds.length === 0}
                    onClick={() => onAssign?.(series, assignIds)}
                  >
                    {pending
                      ? 'Moving…'
                      : `Move ${assignIds.length === 1 ? '1 week' : `${assignIds.length} weeks`}`}
                  </button>
                  <button
                    type="button"
                    className="proto-sheet-quiet-action"
                    disabled={pending}
                    onClick={() => {
                      setAssigning(false);
                      setAssignIds([]);
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </>
            ) : onAssign ? (
              <button
                type="button"
                className="proto-sheet-quiet-action"
                disabled={pending}
                onClick={() => setAssigning(true)}
              >
                Move existing weeks here
              </button>
            ) : null}
          </div>
        ) : null}

        {/*
          Teach it again.

          The seasonal case: Advent comes round every year, and last year's
          outline is the best starting point there is. Deliberately unlike "Add
          weeks", which extends *this* run forward into blank weeks — this
          copies a finished study onto new dates, preserving the run's own day
          offsets so a Christmas Eve stays a Christmas Eve.

          Both runs end up labelled by year, because the moment a second run
          exists is the moment "Advent" stops being an unambiguous name.
        */}
        {canWrite && onRerun && dated.length > 0 ? (
          <div className="proto-series-sheet__rerun">
            {rerunOpen ? (
              <>
                <p className="proto-inspector-section-title proto-create-folder-sheet__field-label">
                  <span>Start the new run on</span>
                </p>
                <ProtoDatePicker
                  value={rerunDate || nextOccurrenceOfDay(null)}
                  min={formatLocalDateInput(new Date())}
                  onChange={setRerunDate}
                  aria-label="First week of the new run"
                />
                <p className="proto-inspector-section-title proto-create-folder-sheet__field-label">
                  <span>Bring across</span>
                </p>
                {(
                  [
                    ['titles', 'Week titles'],
                    ['references', 'Passages'],
                    ['starterTemplate', 'Note starter'],
                    ['resources', 'Attached resources'],
                  ] as const
                ).map(([key, label]) => (
                  <label key={key} className="proto-series-sheet__copy-toggle">
                    <input
                      type="checkbox"
                      checked={rerunCopy[key]}
                      disabled={pending}
                      onChange={(e) =>
                        setRerunCopy((prev) => ({ ...prev, [key]: e.target.checked }))
                      }
                    />
                    <span className="proto-caption">{label}</span>
                  </label>
                ))}
                <div className="proto-sheet-footer__row">
                  <button
                    type="button"
                    className="proto-share-popover__primary"
                    disabled={pending}
                    onClick={() =>
                      onRerun(series, {
                        startDate: rerunDate || nextOccurrenceOfDay(null),
                        copy: rerunCopy,
                      })
                    }
                  >
                    {pending ? 'Copying…' : `Copy ${dated.length === 1 ? '1 week' : `${dated.length} weeks`}`}
                  </button>
                  <button
                    type="button"
                    className="proto-sheet-quiet-action"
                    disabled={pending}
                    onClick={() => setRerunOpen(false)}
                  >
                    Cancel
                  </button>
                </div>
              </>
            ) : (
              <button
                type="button"
                className="proto-sheet-quiet-action"
                disabled={pending}
                onClick={() => {
                  setRerunDate(nextOccurrenceOfDay(null));
                  setRerunOpen(true);
                }}
              >
                Teach this again
              </button>
            )}
          </div>
        ) : null}

        {/*
          Hand the series to the room as something to walk.

          The plan is staff-side: dates, passages, who is preaching. Publishing
          turns it into what the group actually sees — one note per week, in
          order, with the room's current step marked. Republishing appends the
          weeks added since, so this is the update path too rather than a
          one-way door that would strand week nine.

          Only ever offered on a room's own plan: the church-wide plan has no
          single room to publish into, and the server refuses it outright.
        */}
        {canWrite && onPublishThread ? (
          <div className="proto-series-sheet__publish">
            <button
              type="button"
              className="proto-sheet-quiet-action"
              disabled={pending || services.length === 0}
              onClick={() => onPublishThread(series)}
            >
              {pending
                ? 'Publishing…'
                : series.publishedThreadId
                  ? 'Update the study plan'
                  : 'Publish as a study plan'}
            </button>
            {services.length === 0 ? (
              <p className="proto-caption proto-teaching-plan__empty">
                Add a week first — a study plan needs something to walk through.
              </p>
            ) : null}
          </div>
        ) : null}

        {canWrite && removable.length > 0 ? (
          <button
            type="button"
            className="proto-sheet-quiet-action"
            disabled={pending}
            onClick={(e) => setEmptyAnchor(e.currentTarget.getBoundingClientRect())}
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
            onClick={(e) => setDeleteAnchor(e.currentTarget.getBoundingClientRect())}
          >
            Delete series
          </button>
        </div>
      ) : null}

      {emptyAnchor ? (
        <ProtoConfirmDialog
          anchorRect={emptyAnchor}
          preferAbove
          alignRight
          title={
            removable.length === 1
              ? 'Remove the one empty week?'
              : `Remove ${removable.length} empty weeks?`
          }
          description="Nothing written is touched."
          confirmLabel="Remove"
          busy={pending}
          onConfirm={() => {
            setEmptyAnchor(null);
            onRemoveEmpty(
              series,
              removable.map((s) => s.id),
            );
          }}
          onCancel={() => setEmptyAnchor(null)}
        />
      ) : null}

      {deleteAnchor ? (
        <ProtoConfirmDialog
          anchorRect={deleteAnchor}
          preferAbove
          alignRight
          title={`Delete "${series.title}"?`}
          description={`The ${
            services.length === 1 ? '1 week' : `${services.length} weeks`
          } under it stay in the plan — they just won't belong to a series.`}
          confirmLabel="Delete"
          busy={pending}
          onConfirm={() => {
            setDeleteAnchor(null);
            onDelete(series);
          }}
          onCancel={() => setDeleteAnchor(null)}
        />
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
