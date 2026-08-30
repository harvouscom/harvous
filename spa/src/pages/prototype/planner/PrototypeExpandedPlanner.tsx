/**
 * The Planner with room to work — board, calendar, and list over the whole
 * main pane, with the sermon editor as a docked rail instead of a modal.
 *
 * The compact pane in the church hub answers "what am I preaching Sunday". This
 * answers "what is the next quarter", which is a different posture: you sit in
 * it, drag things around, and change your mind. That is why the editor is a
 * pane here — a modal you must dismiss to see the plan you are editing against
 * fights the whole activity.
 *
 * Scope (church plan vs a ministry's) carries over from the compact pane, and
 * both queries stay mounted with only the selected one enabled — switching is
 * instant after the first visit, and the inactive plan costs nothing.
 */
import { useCallback, useMemo, useState } from 'react';
import Icon, { type IconName } from '@/components/react/Icon';
import ProtoSidebarExpandedPanel from '../ProtoSidebarExpandedPanel';
import type { ExpandedSidebarToolProps } from '../PrototypeExpandedSidebarHost';
import {
  useChurchSermonActions,
  useChurchTeachingPlan,
  type TeachingPlanSeries,
  type TeachingPlanSermon,
} from '../../../hooks/queries/useChurchTeachingPlan';
import { cadenceIntervalDays, parsePublishCadence } from '@/utils/channel-publish-cadence';
import {
  useChurchSpacePlan,
  useChurchSpaceSermonActions,
  type SpaceSermonAction,
} from '../../../hooks/queries/useChurchSpacePlan';
import { useChurchPlannerAccess } from '../../../hooks/useChurchPlannerAccess';
import {
  buildSeriesAccentLookup,
  describeRerunResult,
  planVocabulary,
} from '../../../lib/church-services';
import { useProtoShell } from '../../../layouts/proto-shell-context';
import ProtoSpaceLoading from '../ProtoSpaceLoading';
import PrototypeListEmptyState from '../PrototypeListEmptyState';
import PrototypePlannerBoard from './PrototypePlannerBoard';
import PrototypePlannerCalendar from './PrototypePlannerCalendar';
import PrototypePlannerList from './PrototypePlannerList';
import PrototypePlannerEditorPane from './PrototypePlannerEditorPane';
import PrototypePlannerScopeChips from './PrototypePlannerScopeChips';
import PrototypePlannerSeries from './PrototypePlannerSeries';
import PrototypeNewSeriesSheet from './PrototypeNewSeriesSheet';
import PrototypeSeriesSheet from '../PrototypeSeriesSheet';
import { usePlannerSchedule } from './usePlannerSchedule';
import { usePlannerScope } from './usePlannerScope';
import { useSpaceCompanion } from '../../../hooks/queries/useChannelLinks';
import { consumePendingPlannerIntent } from '../../../lib/pending-planner-intent';

export type PlannerView = 'board' | 'calendar' | 'list' | 'series';
export type PlannerSelection =
  | { mode: 'edit'; serviceId: string }
  /** `date` null = a new idea for the backlog; a string = the day you clicked. */
  | { mode: 'create'; date: string | null }
  | null;

const VIEW_STORAGE_KEY = 'harvous-prototype-planner-view';

const VIEWS: { id: PlannerView; label: string; icon: IconName }[] = [
  { id: 'board', label: 'Board', icon: 'table-columns' },
  { id: 'calendar', label: 'Calendar', icon: 'calendar' },
  /* `list`, not `list-check`: the ticks read as completion, and a planned week
     is not a task anyone checks off. */
  { id: 'list', label: 'List', icon: 'list' },
  /* The plan by run. A fourth way of looking at the same rows, so it sits in
     the same switcher — and it is where a series' colour, description, and
     length are reached from, which is why the planner needs it at all. */
  { id: 'series', label: 'Series', icon: 'layer-group' },
];

function readStoredView(): PlannerView {
  if (typeof window === 'undefined') return 'board';
  try {
    const stored = window.localStorage.getItem(VIEW_STORAGE_KEY);
    if (stored === 'board' || stored === 'calendar' || stored === 'list' || stored === 'series') {
      return stored;
    }
  } catch {
    /* ignore */
  }
  return 'board';
}

export default function PrototypeExpandedPlanner({ exiting, origin, onClose }: ExpandedSidebarToolProps) {
  const { activeChurchOrgId, closeExpandedSidebar } = useProtoShell();
  const access = useChurchPlannerAccess(activeChurchOrgId);
  const { orgId, canView, canWrite, readOnlyReason, canManageChurchTemplates, plannableSpaces } =
    access;

  /* Shared with the compact pane, so expanding keeps the plan you were on. */
  const { planSpaceId, lastChannelId, selectPlanScope } = usePlannerScope(orgId, plannableSpaces);
  const [view, setView] = useState<PlannerView>(readStoredView);
  /*
    Seeded from the hub's handoff so "Add a sermon" in the compact pane lands
    with the editor already open, rather than expanding to a board and asking
    the pastor to find the button again. Read in the initializer, not an
    effect: an effect would render the empty planner for a frame first, and
    the flag is one-shot so a second render must not re-open anything.
  */
  /*
    One read of the one-shot intent, for both things it can carry: what to open,
    and which room to open it on. Two `consume` calls would race for the same
    key and the second would find it already cleared.
  */
  const [entry] = useState(() => {
    const intent = consumePendingPlannerIntent();
    const initialSelection: PlannerSelection =
      intent?.mode === 'edit'
        ? { mode: 'edit', serviceId: intent.serviceId }
        : intent?.mode === 'create'
          ? { mode: 'create', date: intent.date }
          : null;
    return { selection: initialSelection, spaceId: intent?.scopeSpaceId ?? null };
  });
  const [selection, setSelection] = useState<PlannerSelection>(entry.selection);
  /*
    Opened from a room rather than from the church hub.

    Its scope lives here rather than in `usePlannerScope`, whose store is keyed
    by org: a churchless room has no org to key on, and even when it has one,
    restoring the church's remembered scope over the room you just opened would
    be answering a question nobody asked. The chips still move this — it is only
    where it starts that differs.
  */
  const [spaceEntryScope, setSpaceEntryScope] = useState<string | null>(entry.spaceId);
  const spaceEntry = entry.spaceId !== null;
  const [openSeries, setOpenSeries] = useState<TeachingPlanSeries | null>(null);
  const [seriesError, setSeriesError] = useState<string | null>(null);
  /* A re-run that stopped short is a partial success, not a failure — see
     `describeRerunResult`. */
  const [seriesNotice, setSeriesNotice] = useState<string | null>(null);
  const [creatingSeries, setCreatingSeries] = useState(false);

  const changeScope = useCallback(
    (next: string | null) => {
      if (spaceEntry) setSpaceEntryScope(next);
      else selectPlanScope(next);
      /* A selection points at a row in the plan you just left — and so does an
         open series, which is scoped to its plan by construction. */
      setSelection(null);
      setOpenSeries(null);
      setCreatingSeries(false);
    },
    [selectPlanScope, spaceEntry],
  );

  /** The plan actually on screen: the room we came from, or the hub's scope. */
  const scopeSpaceId = spaceEntry ? spaceEntryScope : planSpaceId;

  /*
    A room's plan answers for itself who may read and write it — the space lane
    has no church capabilities to consult, so `useChurchPlannerAccess` returns
    nothing for a churchless room and cannot be the gate here. Fetching is
    therefore not gated on `canView`: the request *is* the permission check, and
    a refusal simply leaves the query in error.
  */
  const churchPlan = useChurchTeachingPlan(orgId, {
    enabled: canView && scopeSpaceId === null && !spaceEntry,
  });
  const spacePlan = useChurchSpacePlan(scopeSpaceId, {
    enabled: scopeSpaceId !== null && (canView || spaceEntry),
  });
  const churchActions = useChurchSermonActions(orgId);
  const spaceActions = useChurchSpaceSermonActions(scopeSpaceId);

  const onSpacePlan = scopeSpaceId !== null;
  const data = onSpacePlan ? spacePlan.data : churchPlan.data;
  const actions = onSpacePlan ? spaceActions : churchActions;
  /* Server-decided; a channel plans content, everything else gathers. */
  const planKind = onSpacePlan ? spacePlan.data?.planKind : undefined;
  /*
    Whether this plan has a church behind it. Only the empty-state wording turns
    on it, but "this ministry" is a church's word for a room and a Tuesday book
    club is not one.
  */
  const hasChurch = onSpacePlan ? spacePlan.data?.church !== null : true;
  const vocab = planVocabulary({ onSpacePlan, planKind, hasChurch });

  /*
    Who is allowed what, in the lane that applies. A room entered directly is
    answered by its own payload — `viewer.canManage` is the server's word, since
    the space lane's rule is a membership role the client has no business
    re-deriving. The church hub keeps the capability answers it always had.
  */
  /*
    The room we came from and the channel it feeds, when there is one.
    Membership-gated, so a member asking is not a leak — and the *plan* of the
    companion is probed separately below, because being able to see that a room
    has a channel is not the same as being allowed to plan it.
  */
  const companion = useSpaceCompanion(entry.spaceId, { enabled: spaceEntry });
  const companionChannel = companion.data?.companionChannel ?? null;
  const companionPlan = useChurchSpacePlan(companionChannel?.id ?? null, {
    enabled: Boolean(companionChannel),
  });
  /*
    Probing the plan rather than re-deriving "may this person plan a channel"
    from staff and grant rules the server already owns. If the query refuses,
    the chip simply is not offered.
  */
  const scopePair =
    spaceEntry && companionChannel && !companionPlan.isError && entry.spaceId
      ? {
          space: {
            id: entry.spaceId,
            title: spacePlan.data?.space.title ?? 'This space',
          },
          channel: { id: companionChannel.id, title: companionChannel.title },
        }
      : null;

  const effectiveCanView = spaceEntry ? !spacePlan.isError : canView;
  const effectiveCanWrite = spaceEntry
    ? Boolean(spacePlan.data?.viewer?.canManage)
    : canWrite;
  const services = useMemo(() => data?.services ?? [], [data]);
  const series = useMemo(() => data?.series ?? [], [data]);
  const serviceTimes = onSpacePlan ? [] : (churchPlan.data?.serviceTimes ?? []);

  /*
    Built once here rather than in each view: board, calendar, and list all ask
    "what colour is this run", and three answers is how the same series ends up
    two colours on two tabs.
  */
  const accentFor = useMemo(() => buildSeriesAccentLookup(series), [series]);

  /*
    The plan's own gathering day, which is what an undated idea lands on when
    it is dropped onto a week. The church's first recurring slot, or the space's
    single meeting day; null when neither has been set, and the board then falls
    back to the column's own start.
  */
  const defaultDay = onSpacePlan
    ? (spacePlan.data?.space.meetingDay ?? null)
    : (churchPlan.data?.serviceTimes?.[0]?.dayOfWeek ?? null);

  /*
    The room's rhythm, as dates the editor can offer.

    Two vocabularies meet here, which is why this is resolved once rather than
    inside the form: a room that *gathers* has a meeting day and repeats weekly,
    while a channel that *publishes* has no day at all and repeats on its
    cadence. An irregular channel yields a null interval, and the editor then
    offers nothing — which is correct, because an irregular room has not
    declared a rhythm to offer.

    Offers only. Nothing here schedules, reminds, or recurs.
  */
  const rhythm = useMemo(
    () =>
      planKind === 'content'
        ? {
            meetingDay: null,
            intervalDays: cadenceIntervalDays(
              parsePublishCadence(spacePlan.data?.space.publishCadence),
            ),
          }
        : { meetingDay: defaultDay, intervalDays: 7 },
    [planKind, defaultDay, spacePlan.data?.space.publishCadence],
  );

  const schedule = usePlannerSchedule({
    planSpaceId: scopeSpaceId,
    orgId,
    services,
    actions,
    defaultDay,
  });

  const changeView = useCallback((next: PlannerView) => {
    setView(next);
    try {
      window.localStorage.setItem(VIEW_STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  }, []);

  /*
    Re-read from the plan rather than holding the row that was clicked: after a
    recolour the sheet must show the new swatch as selected, and a captured
    object would keep showing the old one until it was reopened.
  */
  const openSeriesRow = useMemo<TeachingPlanSeries | null>(
    () => (openSeries ? (series.find((s) => s.id === openSeries.id) ?? openSeries) : null),
    [openSeries, series],
  );

  /*
    The two plans' action unions overlap but are not identical — publishing a
    study plan exists only on a room's plan — so the inferred parameter of a
    union of mutations is their intersection, which is narrower than either.
    The scope decides which `actions` this is, and every call site is already
    gated on that same `onSpacePlan`, so widening here is the honest shape.
  */
  const runSeries = useCallback(
    (action: Parameters<typeof churchActions.mutate>[0] | SpaceSermonAction, onDone?: () => void) => {
      setSeriesError(null);
      const opts = {
        onSuccess: () => onDone?.(),
        onError: (err: unknown) =>
          setSeriesError(err instanceof Error ? err.message : 'Could not change this series'),
      };
      // Branch rather than cast the union away: each plan's mutate keeps its
      // own action type, so a variant only one of them has still typechecks.
      if (onSpacePlan) spaceActions.mutate(action as SpaceSermonAction, opts);
      else churchActions.mutate(action as Parameters<typeof churchActions.mutate>[0], opts);
    },
    [onSpacePlan, spaceActions, churchActions],
  );

  const editingService = useMemo<TeachingPlanSermon | null>(() => {
    if (selection?.mode !== 'edit') return null;
    return services.find((s) => s.id === selection.serviceId) ?? null;
  }, [selection, services]);

  /*
    A note opened from the editor's passage history lives in the main pane —
    underneath this surface. Closing without popping keeps the router's own
    entry as the one Back returns to.
  */
  const leaveForNote = useCallback(() => {
    closeExpandedSidebar({ preserveHistory: true });
  }, [closeExpandedSidebar]);

  /*
    Just "Planner". The scope switcher sits right beside it now and names the
    space itself, so "Planner · Young Adults" would say it twice in the same
    breath — and the title is the one that could not be changed from.
  */
  const title = 'Planner';

  /*
    Which plan you are looking at. Radio semantics, not tabs: these are two
    different plans, not two views of one — which is also why it is not in the
    toolbar slot beside Board/Calendar/List. Those change how you look; this
    changes what you are looking at.
  */
  /*
    Entered from a room with no companion: there is nothing to switch to, and
    the church-hub bar would offer the church's plan and a ministry to someone
    who came here to arrange one room — including someone whose room has no
    church at all.
  */
  const showScopeSwitcher = effectiveCanView && (!spaceEntry || scopePair !== null);
  const scopeSwitcher = showScopeSwitcher ? (
    <PrototypePlannerScopeChips
      plannableSpaces={plannableSpaces}
      planSpaceId={scopeSpaceId}
      lastChannelId={lastChannelId}
      onChange={changeScope}
      pair={scopePair}
    />
  ) : undefined;

  const viewSwitcher = (
    <div className="proto-chip-bar proto-planner__views" role="radiogroup" aria-label="Planner view">
      {VIEWS.map((option) => (
        <button
          key={option.id}
          type="button"
          role="radio"
          aria-checked={view === option.id}
          className={`proto-chip${view === option.id ? ' proto-chip--selected' : ''}`}
          onClick={() => changeView(option.id)}
        >
          <Icon name={option.icon} size={11} aria-hidden />
          <span>{option.label}</span>
        </button>
      ))}
    </div>
  );

  return (
    <ProtoSidebarExpandedPanel
      label="Planner"
      title={title}
      scope={scopeSwitcher}
      toolbar={effectiveCanView ? viewSwitcher : undefined}
      actions={
        effectiveCanWrite ? (
          /*
            The primary opens what its label names — a run of weeks on a
            channel, one row everywhere else — and the one-off follows it as a
            quiet action rather than disappearing. Two buttons only where there
            are genuinely two things to add.
          */
          <>
            <button
              type="button"
              className="proto-glass-surface proto-glass-surface--control proto-glass-action"
              onClick={() => {
                if (vocab.addOpens === 'series') {
                  setSeriesError(null);
                  setCreatingSeries(true);
                  return;
                }
                setSelection({ mode: 'create', date: null });
              }}
            >
              <Icon name="plus" size={12} aria-hidden />
              <span className="proto-glass-action__label">{vocab.addLabel}</span>
            </button>
            {vocab.secondaryAddLabel ? (
              <button
                type="button"
                className="proto-sheet-quiet-action"
                onClick={() => setSelection({ mode: 'create', date: null })}
              >
                {vocab.secondaryAddLabel}
              </button>
            ) : null}
          </>
        ) : undefined
      }
      exiting={exiting}
      origin={origin}
      onClose={onClose}
    >
      {!effectiveCanView ? (
        <PrototypeListEmptyState
          iconName="user-shield"
          title="For church staff"
          description="A pastor, teacher or admin plans what the church teaches."
        />
      ) : (
        <div className="proto-planner">
          <div className="proto-planner__main">
            {schedule.error ? (
              <p className="proto-connect-note-sheet__error proto-planner__error" role="alert">
                {schedule.error}
              </p>
            ) : null}

            {!data ? (
              <ProtoSpaceLoading label="Loading plan" />
            ) : view === 'board' ? (
              <PrototypePlannerBoard
                services={services}
                serviceTimes={serviceTimes}
                accentFor={accentFor}
                canWrite={effectiveCanWrite}
                readOnlyReason={readOnlyReason}
                defaultDay={defaultDay}
                selection={selection}
                onSelect={setSelection}
                onMove={schedule.move}
              />
            ) : view === 'calendar' ? (
              <PrototypePlannerCalendar
                services={services}
                serviceTimes={serviceTimes}
                accentFor={accentFor}
                canWrite={effectiveCanWrite}
                selection={selection}
                onSelect={setSelection}
                onMoveToDate={schedule.moveToDate}
              />
            ) : view === 'list' ? (
              <PrototypePlannerList
                services={services}
                serviceTimes={serviceTimes}
                accentFor={accentFor}
                canWrite={effectiveCanWrite}
                readOnlyReason={readOnlyReason}
                emptyWritable={vocab.emptyWritable}
                selection={selection}
                onSelect={setSelection}
              />
            ) : (
              (
                <PrototypePlannerSeries
                  series={series}
                  services={services}
                  accentFor={accentFor}
                  openSeriesId={openSeries?.id ?? null}
                  canWrite={effectiveCanWrite}
                  onOpen={(entry) => {
                    setSeriesError(null);
                    setOpenSeries(entry);
                  }}
                  onNewSeries={() => {
                    setSeriesError(null);
                    setCreatingSeries(true);
                  }}
                />
              )
            )}
          </div>

          <PrototypeSeriesSheet
            open={openSeriesRow !== null}
            series={openSeriesRow}
            services={services.filter((s) => s.seriesId === openSeriesRow?.id)}
            canWrite={effectiveCanWrite}
            pending={actions.isPending}
            error={seriesError}
            notice={seriesNotice}
            onUpdate={(entry, changes) =>
              runSeries(
                { kind: 'series-update', seriesId: entry.id, ...changes },
                /* Only a rename closes it. Colour and description are edits you
                   make while watching the run they change. */
                'title' in changes ? () => setOpenSeries(null) : undefined,
              )
            }
            onDelete={(entry) => {
              runSeries({ kind: 'series-delete', seriesId: entry.id }, () => setOpenSeries(null));
            }}
            /* Only a room's own plan can be published — the church-wide plan
               has no single room to hand it to, and the server refuses it. */
            onPublishThread={
              onSpacePlan
                ? (entry) =>
                    runSeries({ kind: 'series-publish-thread', seriesId: entry.id }, () =>
                      setOpenSeries(null),
                    )
                : undefined
            }
            planServices={services}
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
            onRemoveEmpty={(_entry, serviceIds) => {
              for (const serviceId of serviceIds) {
                runSeries({ kind: 'delete', serviceId });
              }
            }}
            onOpenChange={(next) => {
              if (!next) setOpenSeries(null);
            }}
          />

          {/*
            Docked beside the series list, not in place of it. Rendered inline
            it replaced the whole view: a 420px form floating in a 950px pane,
            the list you were adding to gone, and the form's own actions pushed
            below the fold by the date picker. Same rail the sermon editor uses,
            so both ways of adding to a plan sit in the same place.
          */}
          {creatingSeries ? (
            <aside
              className="proto-planner-editor proto-planner-editor--form"
              aria-label="New series"
            >
              {/* The editor rail's own header, not a hand-rolled one — the
                  first attempt stacked the close button under the title
                  because the classes it used did not exist. */}
              <div className="proto-side-panel__header proto-side-panel__header--minimal">
                <span className="proto-side-panel__header-label">New series</span>
                <div className="proto-side-panel__header-actions">
                  <button
                    type="button"
                    className="proto-side-panel__action-btn"
                    title="Close"
                    aria-label="Close new series"
                    onClick={() => {
                      setSeriesError(null);
                      setCreatingSeries(false);
                    }}
                  >
                    <Icon name="xmark" size={12} />
                  </button>
                </div>
              </div>
              <div className="proto-planner-editor__body proto-create-folder-sheet">
                <PrototypeNewSeriesSheet
                  open
                  showHeading={false}
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
              </div>
            </aside>
          ) : null}

          {selection ? (
            <PrototypePlannerEditorPane
              orgId={orgId}
              planSpaceId={scopeSpaceId}
              service={editingService}
              createDate={selection.mode === 'create' ? selection.date : undefined}
              series={series}
              serviceTimes={serviceTimes}
              canWrite={effectiveCanWrite}
              readOnlyReason={readOnlyReason}
              canManageChurchTemplates={canManageChurchTemplates}
              planKind={planKind}
              rhythm={rhythm}
              onClose={() => setSelection(null)}
              onNavigateAway={leaveForNote}
            />
          ) : null}
        </div>
      )}
    </ProtoSidebarExpandedPanel>
  );
}
