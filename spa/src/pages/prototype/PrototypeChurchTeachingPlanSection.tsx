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
  type SpaceSermonAction,
} from '../../hooks/queries/useChurchSpacePlan';
import {
  formatSeriesRun,
  localTodayIso,
  planVocabulary,
  rhythmDates,
  sermonTimeLabel,
  seriesRunsByServiceRows,
} from '../../lib/church-services';
import { cadenceIntervalDays, parsePublishCadence } from '@/utils/channel-publish-cadence';
import ProtoSpaceLoading from './ProtoSpaceLoading';
import ProtoServiceDateTile from './ProtoServiceDateTile';
import PrototypeListEmptyState from './PrototypeListEmptyState';
import PrototypeSeriesSheet from './PrototypeSeriesSheet';
import PrototypeNewSeriesSheet from './planner/PrototypeNewSeriesSheet';
import PrototypePlannerScopeChips from './planner/PrototypePlannerScopeChips';
import { usePlannerScope } from './planner/usePlannerScope';
import { markPendingPlannerIntent } from '../../lib/pending-planner-intent';
import { useProtoShell } from '../../layouts/proto-shell-context';
import type { PlannableSpace } from '../../hooks/useChurchPlannerAccess';

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
      <ProtoServiceDateTile iso={service.serviceDate} unwritten={!service.reference} />
      <span className="proto-church-tools__row-text">
        <span className="pds-list-title proto-church-tools__row-title proto-marquee" title={service.title}><span>{service.title}</span></span>
        <span className="proto-caption proto-church-tools__row-meta proto-marquee-self">
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
  plannableSpaces?: PlannableSpace[];
  /** Server's `manage_templates` verdict — only drives the editor's nudge. */
  canManageChurchTemplates?: boolean;
  /** Hub callback that switches to the Church starters pane. */
  onOpenStarters?: () => void;
}) {
  const { openExpandedSidebar } = useProtoShell();
  const [openSeries, setOpenSeries] = useState<TeachingPlanSeries | null>(null);
  const [seriesError, setSeriesError] = useState<string | null>(null);
  const [creatingSeries, setCreatingSeries] = useState(false);
  /* Shared with the expanded planner, so opening the board keeps your scope. */
  const { planSpaceId, lastChannelId, selectPlanScope } = usePlannerScope(orgId, plannableSpaces);

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
  /* Server-decided; a channel plans content, everything else gathers. */
  const planKind = onSpacePlan ? spacePlan.data?.planKind : undefined;
  /*
    `hasChurch` matters here for the same reason it does in the expanded
    planner: without it this pane told a churchless book club "Plan what this
    ministry studies" while the expanded view said "this group" about the very
    same plan.
  */
  const hasChurch = onSpacePlan ? spacePlan.data?.church !== null : true;
  const vocab = planVocabulary({ onSpacePlan, planKind, hasChurch });

  const today = localTodayIso();
  /*
    Three groups, not two. A null date fails *both* `>= today` and `< today` in
    JS, so the obvious two-way split would have dropped every backlog idea on
    the floor — visible in the expanded planner, silently gone here. The board
    is where ideas are meant to live, but they must at least be reachable from
    the compact pane that created them.
  */
  const { backlog, upcoming, past } = useMemo(() => {
    const services = data?.services ?? [];
    const dated = services.filter((s) => s.serviceDate !== null);
    return {
      backlog: services.filter((s) => s.serviceDate === null),
      upcoming: dated.filter((s) => s.serviceDate! >= today),
      // Most recent first — backfilling last Sunday is the common case.
      past: [...dated.filter((s) => s.serviceDate! < today)].reverse(),
    };
  }, [data, today]);

  /*
    The plan's own gathering day, which is what a new series' first week lands
    on. Same derivation as the expanded planner so both doors agree.
  */
  const defaultDay = onSpacePlan
    ? (spacePlan.data?.space.meetingDay ?? null)
    : (churchPlan.data?.serviceTimes?.[0]?.dayOfWeek ?? null);

  const timeLabelFor = useMemo(() => {
    // Only the church plan has slots; a space row's time is the space's own
    // meetingTime, rendered in the switcher's subtitle rather than per row.
    const slots = onSpacePlan ? [] : (churchPlan.data?.serviceTimes ?? []);
    return (sermon: TeachingPlanSermon): string | null => sermonTimeLabel(sermon, slots);
  }, [onSpacePlan, churchPlan.data?.serviceTimes]);

  /**
   * When each series runs, derived from the sermons already in hand — the
   * server sends no dates on a series, and it does not need to.
   *
   * Undated members are skipped rather than counted as the start: a series can
   * hold a backlog idea, and "starts —" would be worse than saying nothing.
   */
  /* Shared with the planner's Series view, so the two panes cannot disagree
     about how long a run is or how much of it is still unwritten. */
  const seriesRunById = useMemo(
    () => seriesRunsByServiceRows(data?.services ?? []),
    [data],
  );

  /*
    Which plan you are looking at. Hidden entirely when the church has no other
    room to plan for, so a single-room church sees exactly the pane it saw
    before space plans existed. Radio semantics, not tabs: these are two
    different plans, not two views of one.

    Hoisted out of the body so it survives the loading branch below — switching
    to a ministry's plan for the first time used to blank the switcher along
    with the list, and you lost the control you had just used.
  */
  const scopeChips = (
    <PrototypePlannerScopeChips
      plannableSpaces={plannableSpaces}
      planSpaceId={planSpaceId}
      lastChannelId={lastChannelId}
      onChange={selectPlanScope}
    />
  );

  /*
    The pane's own load state. The plan is a request of its own, fired only when
    this pane mounts, so it lands well after the hub finished animating — and
    until it did, the pane rendered nothing at all.

    Gated on `canManage` deliberately: a disabled query stays `isPending`
    forever in React Query v5, so a viewer without `sermon_tools` would sit on
    dots that never resolve. `isPending` goes false once the query errors, so a
    failed plan still falls through to the empty pane rather than hanging.
  */
  if (!data) {
    const loading = canManage && (onSpacePlan ? spacePlan.isPending : churchPlan.isPending);
    return (
      <div className="proto-home-section">
        {scopeChips}
        {loading ? <ProtoSpaceLoading label="Loading plan" /> : null}
      </div>
    );
  }

  /*
    Hand off to the expanded planner rather than opening a modal over the pane.
    The editor there is a docked rail beside the plan you are editing against,
    which is the whole reason it exists — a sheet covered the weeks either side
    of the one being written, and the fields it had to stack (date, title,
    series, passage, times, starter, resources, notes, repeat) never fit a
    sidebar-width modal without becoming a scroll well.
  */
  /*
    A create lands on the plan's next slot, not on no date at all. The button
    says "New gathering"; an undated row is backlog that `coming-up` never
    returns, so the label named something the click did not do. Same rule and
    same helper as the expanded planner, so the two entry points agree.
  */
  const nextPlanDate =
    rhythmDates(
      planKind === 'content'
        ? {
            meetingDay: null,
            intervalDays: cadenceIntervalDays(
              parsePublishCadence(spacePlan.data?.space.publishCadence),
            ),
            count: 1,
          }
        : { meetingDay: defaultDay, intervalDays: 7, count: 1 },
    )[0] ?? localTodayIso();

  const openEditor = (service: TeachingPlanSermon | null) => {
    markPendingPlannerIntent(
      service ? { mode: 'edit', serviceId: service.id } : { mode: 'create', date: nextPlanDate },
    );
    openExpandedSidebar('planner');
  };

  /*
    The two plans' action unions overlap but are not identical — publishing a
    study plan exists only on a room's plan — so a union of mutations infers
    their intersection, which is narrower than either. Branch instead of
    casting: each plan's mutate keeps its own action type.
  */
  const runSeries = (
    action: Parameters<typeof churchActions.mutate>[0] | SpaceSermonAction,
    onDone?: () => void,
  ) => {
    setSeriesError(null);
    const opts = {
      onSuccess: () => onDone?.(),
      onError: (err: unknown) =>
        setSeriesError(err instanceof Error ? err.message : 'Could not change this series'),
    };
    if (onSpacePlan) spaceActions.mutate(action as SpaceSermonAction, opts);
    else churchActions.mutate(action as Parameters<typeof churchActions.mutate>[0], opts);
  };

  const activeSpace = plannableSpaces.find((s) => s.id === planSpaceId) ?? null;

  return (
    <div className="proto-home-section">
      {scopeChips}

      {/*
        A pane, not a disclosure — the hub's Church tools row is what opens it,
        so the caret toggle that used to live here is gone.

        Gone entirely when the plan is empty. Its count would only say what the
        empty state says louder, and the scope name it carried is already on the
        chip directly above — "Young Adults" twice, four lines apart. The add
        button moves into the empty state's own stack, which is where the one
        thing to do about an empty pane belongs.
      */}
      {data.services.length > 0 ? (
        <div className="proto-church-tools__lane-head">
          <p className="proto-caption proto-home-section__eyebrow">
            {`${data.services.length} planned${activeSpace ? ` · ${activeSpace.title}` : ''}`}
          </p>
          {canWrite ? (
            <>
              <button
                type="button"
                className="proto-glass-surface proto-glass-surface--control proto-glass-action"
                disabled={actions.isPending}
                onClick={() => (vocab.addOpens === 'series' ? setCreatingSeries(true) : openEditor(null))}
              >
                <Icon name="plus" size={12} aria-hidden />
                <span className="proto-glass-action__label">{vocab.addLabel}</span>
              </button>
              {vocab.secondaryAddLabel ? (
                <button
                  type="button"
                  className="proto-sheet-quiet-action"
                  disabled={actions.isPending}
                  onClick={() => openEditor(null)}
                >
                  {vocab.secondaryAddLabel}
                </button>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}

      {data.services.length === 0 ? (
        /*
          The full empty state, not the caption it replaces. This pane is
          mostly blank space when a plan has not started, and a grey sentence
          under the heading read as a footnote to a list that was not there.
          The icon and title name what the pane is for; the description is the
          plan's own vocabulary, so a channel is invited to publish and a
          gathering to meet.
        */
        <PrototypeListEmptyState
          iconName="calendar-week"
          title="Nothing planned yet"
          description={
            canWrite
              ? vocab.emptyWritable
              : readOnlyReason === 'role'
                ? 'A pastor or admin adds sermons here.'
                : undefined
          }
          action={
            canWrite ? (
              <button
                type="button"
                className="proto-glass-surface proto-glass-surface--control proto-glass-action"
                disabled={actions.isPending}
                onClick={() => (vocab.addOpens === 'series' ? setCreatingSeries(true) : openEditor(null))}
              >
                <Icon name="plus" size={12} aria-hidden />
                <span className="proto-glass-action__label">{vocab.addLabel}</span>
              </button>
            ) : undefined
          }
        />
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

          {backlog.length > 0 ? (
            <>
              <p className="proto-caption proto-teaching-plan__divider">Ideas</p>
              {backlog.map((service) => (
                <SermonRow
                  key={service.id}
                  service={service}
                  timeLabel={null}
                  disabled={!canWrite}
                  onEdit={openEditor}
                />
              ))}
            </>
          ) : null}

          {past.length > 0 ? (
            <>
              {upcoming.length > 0 || backlog.length > 0 ? (
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
                <span className="proto-caption proto-church-tools__row-meta proto-marquee-self">
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
          {/* A lane head, not a row divider — it introduces its own card, the
              way "N planned" introduces the sermons above. */}
          <div className="proto-church-tools__lane-head proto-church-tools__lane-head--stacked">
            <p className="proto-caption proto-home-section__eyebrow">Series</p>
            {/* The sermon lane above has had an add button since it shipped;
                this lane listed runs you could open but gave no way to start
                one, so naming a series before its first week was a trip to the
                expanded planner. Same control, same sheet. */}
            {canWrite ? (
              <button
                type="button"
                className="proto-glass-surface proto-glass-surface--control proto-glass-action"
                disabled={actions.isPending}
                onClick={() => {
                  setSeriesError(null);
                  setCreatingSeries(true);
                }}
              >
                <Icon name="plus" size={12} aria-hidden />
                <span className="proto-glass-action__label">New series</span>
              </button>
            ) : null}
          </div>
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
                {/*
                  The run's first date, in the same tile the sermon rows use.
                  A generic glyph said only "this is a series", which the lane's
                  own heading already says; the date says when it starts, and
                  keeps both lanes' titles on one edge.
                */}
                <ProtoServiceDateTile iso={seriesRunById.get(entry.id)?.first || null} />
                <span className="proto-church-tools__row-text">
                  <span className="pds-list-title proto-church-tools__row-title proto-marquee" title={entry.title}><span>{entry.title}</span></span>
                  <span className="proto-caption proto-church-tools__row-meta proto-marquee-self">
                    {entry.serviceCount === 1 ? '1 week' : `${entry.serviceCount} weeks`}
                    {(() => {
                      const run = seriesRunById.get(entry.id);
                      if (!run) return '';
                      const span = formatSeriesRun(run);
                      /* The tile answers when it starts, the span how far it
                         runs, and the count how much of it is actually
                         written. Each is absent when it would only repeat
                         what a neighbour already said. */
                      return `${span ? ` · ${span}` : ''}${run.toFill > 0 ? ` · ${run.toFill} to fill` : ''}`;
                    })()}
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

      {/* Naming a run before its first week exists — the same sheet the
          expanded planner uses, so the two doors cannot drift apart. */}
      <PrototypeNewSeriesSheet
        open={creatingSeries}
        pending={actions.isPending}
        error={seriesError}
        defaultDay={defaultDay}
        onCancel={() => {
          setSeriesError(null);
          setCreatingSeries(false);
        }}
        onCreate={(input) =>
          runSeries(
            {
              kind: 'series-create',
              title: input.title,
              color: input.color,
              firstDate: input.firstDate,
            },
            () => setCreatingSeries(false),
          )
        }
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
        onUpdate={(entry, changes) =>
          runSeries(
            { kind: 'series-update', seriesId: entry.id, ...changes },
            /* Only a rename closes the sheet. Colour and description are edits
               you make while looking at the run they change, so closing on them
               would hide the result of the thing you just did. */
            'title' in changes ? () => setOpenSeries(null) : undefined,
          )
        }
        onDelete={(entry) => {
          /*
            The confirm names what survives, because the answer is not obvious
            and it is the whole reason delete is offered at all: the sermons
            stay, they simply stop belonging to a series.
          */
          runSeries({ kind: 'series-delete', seriesId: entry.id }, () => setOpenSeries(null));
        }}
        /*
          Extending reuses `repeat`, which already generates exactly the right
          rows: the series' name, the next Sundays, and deliberately no passage
          because next week is a different one. The sheet stays open — you are
          shaping the run, and closing would hide the result.
        */
        planServices={data?.services ?? []}
        onAssign={(entry, serviceIds) => {
        /* N ordinary updates, fired in sequence. The last one closes the
        sheet; an earlier failure leaves the ones that landed, which
        the plan renders correctly either way. */
        setSeriesError(null);
        void (async () => {
        try {
        for (const serviceId of serviceIds) {
        await actions.mutateAsync({ kind: 'update', serviceId, seriesId: entry.id });
        }
        setOpenSeries(null);
        } catch (err) {
        setSeriesError(
        err instanceof Error ? err.message : 'Could not move those weeks',
        );
        }
        })();
        }}
        onRerun={(entry, input) =>
        runSeries(
        {
        kind: 'series-rerun',
        sourceSeriesId: entry.id,
        startDate: input.startDate,
        copy: input.copy,
        },
        () => setOpenSeries(null),
        )
        }
        onAddWeeks={(_entry, seedServiceId, weeks) =>
          runSeries({ kind: 'repeat', serviceId: seedServiceId, weeks })
        }
        /*
          One delete per week rather than a bulk endpoint: each is independent
          and already gated, so a failure part-way leaves a shorter run rather
          than an inconsistent one. The sheet's own filter has already proven
          every id is an untouched placeholder.
        */
        onRemoveEmpty={(_entry, serviceIds) => {
          setSeriesError(null);
          void (async () => {
            try {
              for (const serviceId of serviceIds) {
                await actions.mutateAsync({ kind: 'delete', serviceId });
              }
            } catch (err) {
              setSeriesError(
                err instanceof Error ? err.message : 'Could not remove those weeks',
              );
            }
          })();
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
