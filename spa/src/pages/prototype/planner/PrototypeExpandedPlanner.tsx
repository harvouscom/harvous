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
  type TeachingPlanSermon,
} from '../../../hooks/queries/useChurchTeachingPlan';
import {
  useChurchSpacePlan,
  useChurchSpaceSermonActions,
} from '../../../hooks/queries/useChurchSpacePlan';
import { useChurchPlannerAccess } from '../../../hooks/useChurchPlannerAccess';
import { planVocabulary } from '../../../lib/church-services';
import { useProtoShell } from '../../../layouts/proto-shell-context';
import ProtoSpaceLoading from '../ProtoSpaceLoading';
import PrototypeListEmptyState from '../PrototypeListEmptyState';
import PrototypePlannerBoard from './PrototypePlannerBoard';
import PrototypePlannerCalendar from './PrototypePlannerCalendar';
import PrototypePlannerList from './PrototypePlannerList';
import PrototypePlannerEditorPane from './PrototypePlannerEditorPane';
import PrototypePlannerScopeChips from './PrototypePlannerScopeChips';
import { usePlannerSchedule } from './usePlannerSchedule';
import { usePlannerScope } from './usePlannerScope';

export type PlannerView = 'board' | 'calendar' | 'list';
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
];

function readStoredView(): PlannerView {
  if (typeof window === 'undefined') return 'board';
  try {
    const stored = window.localStorage.getItem(VIEW_STORAGE_KEY);
    if (stored === 'board' || stored === 'calendar' || stored === 'list') return stored;
  } catch {
    /* ignore */
  }
  return 'board';
}

export default function PrototypeExpandedPlanner({ exiting, onClose }: ExpandedSidebarToolProps) {
  const { activeChurchOrgId, closeExpandedSidebar } = useProtoShell();
  const access = useChurchPlannerAccess(activeChurchOrgId);
  const { orgId, canView, canWrite, readOnlyReason, canManageChurchTemplates, plannableSpaces } =
    access;

  /* Shared with the compact pane, so expanding keeps the plan you were on. */
  const { planSpaceId, lastChannelId, selectPlanScope } = usePlannerScope(orgId, plannableSpaces);
  const [view, setView] = useState<PlannerView>(readStoredView);
  const [selection, setSelection] = useState<PlannerSelection>(null);

  const changeScope = useCallback(
    (next: string | null) => {
      selectPlanScope(next);
      /* A selection points at a row in the plan you just left. */
      setSelection(null);
    },
    [selectPlanScope],
  );

  const churchPlan = useChurchTeachingPlan(orgId, { enabled: canView && planSpaceId === null });
  const spacePlan = useChurchSpacePlan(planSpaceId, { enabled: canView && planSpaceId !== null });
  const churchActions = useChurchSermonActions(orgId);
  const spaceActions = useChurchSpaceSermonActions(planSpaceId);

  const onSpacePlan = planSpaceId !== null;
  const data = onSpacePlan ? spacePlan.data : churchPlan.data;
  const actions = onSpacePlan ? spaceActions : churchActions;
  /* Server-decided; a channel plans content, everything else gathers. */
  const planKind = onSpacePlan ? spacePlan.data?.planKind : undefined;
  const vocab = planVocabulary({ onSpacePlan, planKind });
  const services = useMemo(() => data?.services ?? [], [data]);
  const series = data?.series ?? [];
  const serviceTimes = onSpacePlan ? [] : (churchPlan.data?.serviceTimes ?? []);

  /*
    The plan's own gathering day, which is what an undated idea lands on when
    it is dropped onto a week. The church's first recurring slot, or the space's
    single meeting day; null when neither has been set, and the board then falls
    back to the column's own start.
  */
  const defaultDay = onSpacePlan
    ? (spacePlan.data?.space.meetingDay ?? null)
    : (churchPlan.data?.serviceTimes?.[0]?.dayOfWeek ?? null);

  const schedule = usePlannerSchedule({
    planSpaceId,
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
  const scopeSwitcher = canView ? (
    <PrototypePlannerScopeChips
      plannableSpaces={plannableSpaces}
      planSpaceId={planSpaceId}
      lastChannelId={lastChannelId}
      onChange={changeScope}
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
      toolbar={canView ? viewSwitcher : undefined}
      actions={
        canWrite ? (
          <button
            type="button"
            className="proto-glass-surface proto-glass-surface--control proto-glass-action"
            onClick={() => setSelection({ mode: 'create', date: null })}
          >
            <Icon name="plus" size={12} aria-hidden />
            <span className="proto-glass-action__label">{vocab.addLabel}</span>
          </button>
        ) : undefined
      }
      exiting={exiting}
      onClose={onClose}
    >
      {!canView ? (
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
                canWrite={canWrite}
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
                canWrite={canWrite}
                selection={selection}
                onSelect={setSelection}
                onMoveToDate={schedule.moveToDate}
              />
            ) : (
              <PrototypePlannerList
                services={services}
                serviceTimes={serviceTimes}
                canWrite={canWrite}
                readOnlyReason={readOnlyReason}
                emptyWritable={vocab.emptyWritable}
                selection={selection}
                onSelect={setSelection}
              />
            )}
          </div>

          {selection ? (
            <PrototypePlannerEditorPane
              orgId={orgId}
              planSpaceId={planSpaceId}
              service={editingService}
              createDate={selection.mode === 'create' ? selection.date : undefined}
              series={series}
              serviceTimes={serviceTimes}
              canWrite={canWrite}
              readOnlyReason={readOnlyReason}
              canManageChurchTemplates={canManageChurchTemplates}
              planKind={planKind}
              onClose={() => setSelection(null)}
              onNavigateAway={leaveForNote}
            />
          ) : null}
        </div>
      )}
    </ProtoSidebarExpandedPanel>
  );
}
