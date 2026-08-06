/**
 * Teaching plan in the My Church hub — the staff half of "This Sunday".
 *
 * Two capabilities, not one. `sermon_tools` decides who may *see* the plan — a
 * teacher teaches from it. `manage_teaching_plan` decides who may reshape it,
 * and arrives here as `canWrite`. A plain staff member gets neither; they
 * publish into channels.
 *
 * Collapsed by default, matching PrototypeChurchStaffSection — planning is
 * periodic work, not the daily job. Upcoming first, because that is what a
 * pastor is looking for when they open it mid-week; past stays reachable so
 * last Sunday can be backfilled.
 *
 * `docs/future/MY_CHURCH_SIDEBAR.md` allows this as "a staff door into creating
 * those places". The congregant equivalent deliberately does not exist.
 */
import { useMemo, useState } from 'react';
import Icon from '@/components/react/Icon';
import {
  useChurchSermonActions,
  useChurchTeachingPlan,
  type TeachingPlanSeries,
  type TeachingPlanSermon,
} from '../../hooks/queries/useChurchTeachingPlan';
import {
  useChurchSpacePlan,
  useChurchSpaceSermonActions,
} from '../../hooks/queries/useChurchSpacePlan';
import { formatServiceTime, formatServiceTimes, localTodayIso } from '../../lib/church-services';
import PrototypeSermonEditorSheet from './PrototypeSermonEditorSheet';
import PrototypeSeriesSheet from './PrototypeSeriesSheet';

function formatServiceDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return iso;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** Same row anatomy as Church tools, with the date where the icon would sit. */
function SermonRow({
  service,
  timeLabel,
  disabled,
  onEdit,
  past,
}: {
  service: TeachingPlanSermon;
  /** Which services it's preached at — the only thing telling two Sundays apart. */
  timeLabel: string | null;
  disabled: boolean;
  onEdit: (service: TeachingPlanSermon) => void;
  past?: boolean;
}) {
  return (
    <button
      type="button"
      className={`proto-church-tools__row${past ? ' proto-church-tools__row--past' : ''}`}
      disabled={disabled}
      onClick={() => onEdit(service)}
    >
      <span className="proto-church-tools__row-date">{formatServiceDate(service.serviceDate)}</span>
      <span className="proto-church-tools__row-text">
        <span className="pds-list-title proto-church-tools__row-title">{service.title}</span>
        <span className="proto-caption proto-church-tools__row-meta">
          {/* Time first: a church with a morning and an evening sermon has two
              rows on one date, and without this they read as duplicates. */}
          {timeLabel ? `${timeLabel} · ` : ''}
          {service.reference || 'No passage yet'}
          {service.seriesTitle ? ` · ${service.seriesTitle}` : ''}
        </span>
      </span>
      {disabled ? null : (
        <span className="proto-church-tools__row-chevron" aria-hidden>
          <Icon name="caret-right" size={11} />
        </span>
      )}
    </button>
  );
}

export default function PrototypeChurchTeachingPlanSection({
  orgId,
  canManage,
  canManageChurchTemplates = false,
  onOpenStarters,
  /** False when the plan is read-only for any reason — reads stay, writes don't. */
  canWrite,
  readOnlyReason = null,
  plannableSpaces = [],
}: {
  orgId: string | null;
  canManage: boolean;
  canWrite: boolean;
  /**
   * Why it's read-only, when it is: the church's pilot lapsed, or the viewer
   * lacks `manage_teaching_plan`. The two need different copy — telling a
   * teacher at a healthy church that the plan has ended would be a lie.
   */
  readOnlyReason?: 'lapsed' | 'role' | null;
  /**
   * Org spaces that may carry their own plan. The switcher is hidden when this
   * is empty, so a church with one room sees exactly today's pane.
   */
  plannableSpaces?: { id: string; title: string }[];
  /** Server's `manage_templates` verdict — only drives the editor's nudge. */
  canManageChurchTemplates?: boolean;
  /** Hub callback that switches to the Church starters pane. */
  onOpenStarters?: () => void;
}) {
  const [editing, setEditing] = useState<TeachingPlanSermon | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [openSeries, setOpenSeries] = useState<TeachingPlanSeries | null>(null);
  const [seriesError, setSeriesError] = useState<string | null>(null);
  /** null = the church's own plan; a space id = that ministry's. */
  const [planSpaceId, setPlanSpaceId] = useState<string | null>(null);

  /*
    Both plans are always mounted but only the selected one is enabled, so
    switching is instant after the first visit and the inactive plan costs no
    request. They stay separate queries because they are separate resources —
    different endpoints, different gates, different series vocabularies.
  */
  const churchPlan = useChurchTeachingPlan(orgId, { enabled: canManage && planSpaceId === null });
  const spacePlan = useChurchSpacePlan(planSpaceId, { enabled: canManage && planSpaceId !== null });
  const churchActions = useChurchSermonActions(orgId);
  const spaceActions = useChurchSpaceSermonActions(planSpaceId);

  const onSpacePlan = planSpaceId !== null;
  const data = onSpacePlan ? spacePlan.data : churchPlan.data;
  const actions = onSpacePlan ? spaceActions : churchActions;

  const today = localTodayIso();
  const { upcoming, past } = useMemo(() => {
    const services = data?.services ?? [];
    return {
      upcoming: services.filter((s) => s.serviceDate >= today),
      // Most recent first — backfilling last Sunday is the common case.
      past: [...services.filter((s) => s.serviceDate < today)].reverse(),
    };
  }, [data, today]);

  /**
   * A sermon's times, resolved from the church's slots.
   *
   * The staff payload ships slot *ids* so the editor can check boxes; the list
   * needs clock readings, and it is the only thing distinguishing a morning
   * sermon from an evening one on the same date.
   */
  const timeLabelFor = useMemo(() => {
    // Only the church plan has slots; a space row's time is the space's own
    // meetingTime, rendered in the switcher's subtitle rather than per row.
    const slots = onSpacePlan ? [] : (churchPlan.data?.serviceTimes ?? []);
    const startById = new Map(slots.map((slot) => [slot.id, slot.startTime]));
    return (sermon: TeachingPlanSermon): string | null => {
      const slotTimes = sermon.serviceTimeIds
        .map((id) => startById.get(id))
        .filter((time): time is string => Boolean(time))
        .sort();
      if (slotTimes.length > 0) return formatServiceTimes(slotTimes);
      // A one-off only speaks when the sermon claims no usual service.
      return formatServiceTime(sermon.serviceTime);
    };
  }, [onSpacePlan, churchPlan.data?.serviceTimes]);

  if (!data) return null;

  const openEditor = (service: TeachingPlanSermon | null) => {
    setEditing(service);
    setSheetOpen(true);
  };

  const runSeries = (action: Parameters<typeof actions.mutate>[0], onDone?: () => void) => {
    setSeriesError(null);
    actions.mutate(action, {
      onSuccess: () => onDone?.(),
      onError: (err) =>
        setSeriesError(err instanceof Error ? err.message : 'Could not change this series'),
    });
  };

  const activeSpace = plannableSpaces.find((s) => s.id === planSpaceId) ?? null;

  return (
    <div className="proto-home-section">
      {/*
        Which plan you are looking at. Hidden entirely when the church has no
        other room to plan for, so a single-room church sees exactly the pane it
        saw before space plans existed. Radio semantics, not tabs: these are two
        different plans, not two views of one.
      */}
      {plannableSpaces.length > 0 ? (
        <div className="proto-chip-bar proto-teaching-plan__scope" role="radiogroup" aria-label="Plan">
          <button
            type="button"
            role="radio"
            aria-checked={planSpaceId === null}
            className={`proto-chip${planSpaceId === null ? ' proto-chip--selected' : ''}`}
            onClick={() => setPlanSpaceId(null)}
          >
            Church
          </button>
          {plannableSpaces.map((space) => (
            <button
              key={space.id}
              type="button"
              role="radio"
              aria-checked={planSpaceId === space.id}
              className={`proto-chip${planSpaceId === space.id ? ' proto-chip--selected' : ''}`}
              onClick={() => setPlanSpaceId(space.id)}
            >
              {space.title}
            </button>
          ))}
        </div>
      ) : null}

      {/* A pane, not a disclosure — the hub's Church tools row is what opens
          it, so the caret toggle that used to live here is gone. */}
      <div className="proto-church-tools__lane-head">
        <p className="proto-caption proto-home-section__eyebrow">
          {data.services.length > 0
            ? `${data.services.length} planned${activeSpace ? ` · ${activeSpace.title}` : ''}`
            : 'Nothing planned yet'}
        </p>
        {canWrite ? (
          <button
            type="button"
            className="proto-glass-surface proto-glass-surface--control proto-glass-action"
            disabled={actions.isPending}
            onClick={() => openEditor(null)}
          >
            <Icon name="plus" size={12} aria-hidden />
            <span className="proto-glass-action__label">
              {onSpacePlan ? 'Add a gathering' : 'Add a sermon'}
            </span>
          </button>
        ) : null}
      </div>

      {data.services.length === 0 ? (
        <p className="proto-caption proto-teaching-plan__empty">
          {canWrite
            ? onSpacePlan
              ? 'Plan what this ministry studies. Its members see it inside the space.'
              : 'Plan a sermon and everyone connected to your church sees it on their Home.'
            : readOnlyReason === 'role'
              ? 'Nothing planned yet. A pastor or admin adds sermons here.'
              : 'Nothing planned yet.'}
        </p>
      ) : (
        <div className="proto-glass-surface proto-glass-surface--panel proto-church-tools">
          {upcoming.map((service) => (
            <SermonRow
              key={service.id}
              service={service}
              timeLabel={timeLabelFor(service)}
              disabled={!canWrite}
              onEdit={openEditor}
            />
          ))}

          {past.length > 0 ? (
            <>
              {upcoming.length > 0 ? (
                <p className="proto-caption proto-teaching-plan__divider">Past</p>
              ) : null}
              {past.slice(0, 6).map((service) => (
                <SermonRow
                  key={service.id}
                  service={service}
                  timeLabel={timeLabelFor(service)}
                  disabled={!canWrite}
                  onEdit={openEditor}
                  past
                />
              ))}
            </>
          ) : null}

          {readOnlyReason ? (
            <div className="proto-church-tools__row proto-church-tools__row--status">
              <span className="proto-church-tools__row-icon" aria-hidden>
                <Icon
                  name={readOnlyReason === 'lapsed' ? 'circle-exclamation' : 'book-open'}
                  size={13}
                />
              </span>
              <span className="proto-church-tools__row-text">
                <span className="pds-list-title proto-church-tools__row-title">
                  {readOnlyReason === 'lapsed' ? 'Plan ended' : 'View only'}
                </span>
                <span className="proto-caption proto-church-tools__row-meta">
                  {readOnlyReason === 'lapsed'
                    ? 'Planned sermons stay visible'
                    : 'A pastor or admin plans the sermons'}
                </span>
              </span>
            </div>
          ) : null}
        </div>
      )}

      {/*
        The Series lane. Only appears once this plan has a series, so a church
        that preaches standalone Sundays never sees an empty second list.

        Deliberately below the sermons: the plan is the spine, and a series is a
        way of looking at it — not a competing list.
      */}
      {data.series.length > 0 ? (
        <>
          <p className="proto-caption proto-teaching-plan__divider">Series</p>
          <div className="proto-glass-surface proto-glass-surface--panel proto-church-tools">
            {data.series.map((entry) => (
              <button
                key={entry.id}
                type="button"
                className="proto-church-tools__row"
                onClick={() => {
                  setSeriesError(null);
                  setOpenSeries(entry);
                }}
              >
                <span className="proto-church-tools__row-icon" aria-hidden>
                  <Icon name="layer-group" size={13} />
                </span>
                <span className="proto-church-tools__row-text">
                  <span className="pds-list-title proto-church-tools__row-title">{entry.title}</span>
                  <span className="proto-caption proto-church-tools__row-meta">
                    {entry.serviceCount === 1 ? '1 week' : `${entry.serviceCount} weeks`}
                  </span>
                </span>
                <span className="proto-church-tools__row-chevron" aria-hidden>
                  <Icon name="caret-right" size={11} />
                </span>
              </button>
            ))}
          </div>
        </>
      ) : null}

      <PrototypeSermonEditorSheet
        open={sheetOpen}
        orgId={orgId}
        service={editing}
        series={data.series}
        serviceTimes={onSpacePlan ? [] : (churchPlan.data?.serviceTimes ?? [])}
        planSpaceId={planSpaceId}
        canManageChurchTemplates={canManageChurchTemplates}
        onOpenStarters={onOpenStarters}
        onOpenChange={(next) => {
          setSheetOpen(next);
          if (!next) setEditing(null);
        }}
      />

      <PrototypeSeriesSheet
        open={Boolean(openSeries)}
        series={openSeries}
        services={
          openSeries ? data.services.filter((s) => s.seriesId === openSeries.id) : []
        }
        canWrite={canWrite}
        pending={actions.isPending}
        error={seriesError}
        onRename={(entry, title) =>
          runSeries({ kind: 'series-rename', seriesId: entry.id, title }, () => setOpenSeries(null))
        }
        onDelete={(entry) => {
          /*
            The confirm names what survives, because the answer is not obvious
            and it is the whole reason delete is offered at all: the sermons
            stay, they simply stop belonging to a series.
          */
          const weeks = entry.serviceCount === 1 ? '1 week' : `${entry.serviceCount} weeks`;
          if (
            !window.confirm(
              `Delete "${entry.title}"? The ${weeks} under it stay in the plan — they just won't belong to a series.`,
            )
          ) {
            return;
          }
          runSeries({ kind: 'series-delete', seriesId: entry.id }, () => setOpenSeries(null));
        }}
        onOpenChange={(next) => {
          if (!next) {
            setOpenSeries(null);
            setSeriesError(null);
          }
        }}
      />
    </div>
  );
}
