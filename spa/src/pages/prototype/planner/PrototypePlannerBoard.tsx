/**
 * The planner board — an Ideas column and a column per upcoming week.
 *
 * The columns are *when*, not *how far along*. A status pipeline (drafting →
 * ready) would track a workflow nobody described; weeks track the thing a
 * pastor is actually deciding, which is what gets preached and when. Dropping a
 * card on a week schedules it; dropping it back on Ideas unschedules it, and
 * that is the whole vocabulary.
 *
 * Weeks begin on the church's own service day rather than Sunday — see
 * `buildPlannerWeeks`.
 */
import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import Icon from '@/components/react/Icon';
import type {
  ChurchServiceTimeOption,
  TeachingPlanSermon,
} from '../../../hooks/queries/useChurchTeachingPlan';
import { localTodayIso, sermonTimeLabel } from '../../../lib/church-services';
import {
  BACKLOG_DROPPABLE_ID,
  buildPlannerWeeks,
  parseDroppableId,
  partitionPlan,
  sermonsInWeek,
  type PlannerWeek,
} from '../../../lib/planner-board';
import PrototypePlannerCard, { PlannerCardBody } from './PrototypePlannerCard';
import type { PlannerSelection } from './PrototypeExpandedPlanner';

/** A quarter at a glance, which is the unit a teaching plan is decided in. */
const INITIAL_WEEKS = 8;
const WEEKS_STEP = 8;

function Column({
  id,
  title,
  subtitle,
  count,
  accented,
  canDrop,
  onAdd,
  children,
}: {
  id: string;
  title: string;
  subtitle?: string;
  count: number;
  accented?: boolean;
  canDrop: boolean;
  onAdd?: () => void;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id, disabled: !canDrop });
  return (
    <section
      ref={setNodeRef}
      className={[
        'proto-planner-column',
        accented ? 'proto-planner-column--current' : '',
        isOver && canDrop ? 'proto-planner-column--over' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      aria-label={title}
    >
      <header className="proto-planner-column__head">
        <div className="proto-planner-column__head-text">
          <span className="proto-planner-column__title">{title}</span>
          {subtitle ? <span className="proto-caption proto-planner-column__subtitle">{subtitle}</span> : null}
        </div>
        {onAdd ? (
          <button
            type="button"
            className="proto-side-panel__action-btn"
            title={`Add to ${title}`}
            aria-label={`Add to ${title}`}
            onClick={onAdd}
          >
            <Icon name="plus" size={12} />
          </button>
        ) : null}
      </header>
      <div className="proto-planner-column__body">
        {count === 0 ? (
          <p className="proto-caption proto-planner-column__empty">Nothing yet</p>
        ) : (
          children
        )}
      </div>
    </section>
  );
}

export default function PrototypePlannerBoard({
  services,
  serviceTimes,
  canWrite,
  readOnlyReason,
  defaultDay,
  selection,
  onSelect,
  onMove,
}: {
  services: TeachingPlanSermon[];
  serviceTimes: ChurchServiceTimeOption[];
  canWrite: boolean;
  readOnlyReason: 'lapsed' | 'role' | null;
  defaultDay: number | null;
  selection: PlannerSelection;
  onSelect: (selection: PlannerSelection) => void;
  /** `null` week = back to Ideas. */
  onMove: (serviceId: string, week: PlannerWeek | null) => void;
}) {
  const [weekCount, setWeekCount] = useState(INITIAL_WEEKS);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  /*
    A pointer drag needs to travel before it counts, or every click on a card
    would be a one-pixel drag that never opens the editor. Touch waits on time
    instead of distance — a finger that moves immediately is scrolling the
    board, and stealing that gesture would make the columns unscrollable.
  */
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
  );

  const today = localTodayIso();
  const anchorDay = defaultDay ?? 0;
  const weeks = useMemo(
    () => buildPlannerWeeks(anchorDay, today, weekCount),
    [anchorDay, today, weekCount],
  );
  const { backlog, byDate } = useMemo(() => partitionPlan(services), [services]);
  const timeLabel = (service: TeachingPlanSermon) => sermonTimeLabel(service, serviceTimes);

  const dragging = draggingId ? services.find((s) => s.id === draggingId) ?? null : null;

  const onDragEnd = (event: DragEndEvent) => {
    setDraggingId(null);
    const serviceId = String(event.active.id);
    const overId = event.over ? String(event.over.id) : null;
    if (!overId) return;
    const target = parseDroppableId(overId);
    if (!target) return;
    if (target.kind === 'backlog') {
      onMove(serviceId, null);
      return;
    }
    if (target.kind === 'week') {
      const week = weeks.find((w) => w.startIso === target.startIso);
      if (week) onMove(serviceId, week);
    }
  };

  return (
    <DndContext
      sensors={sensors}
      onDragStart={(event: DragStartEvent) => setDraggingId(String(event.active.id))}
      onDragCancel={() => setDraggingId(null)}
      onDragEnd={onDragEnd}
    >
      <div className="proto-planner-board">
        <Column
          id={BACKLOG_DROPPABLE_ID}
          title="Ideas"
          subtitle="No date yet"
          count={backlog.length}
          canDrop={canWrite}
          onAdd={canWrite ? () => onSelect({ mode: 'create', date: null }) : undefined}
        >
          {backlog.map((service) => (
            <PrototypePlannerCard
              key={service.id}
              service={service}
              timeLabel={timeLabel(service)}
              draggable={canWrite}
              selected={selection?.mode === 'edit' && selection.serviceId === service.id}
              onSelect={() => onSelect({ mode: 'edit', serviceId: service.id })}
            />
          ))}
        </Column>

        {weeks.map((week) => {
          const inWeek = sermonsInWeek(byDate, week);
          return (
            <Column
              key={week.id}
              id={week.id}
              title={week.label}
              subtitle={week.isCurrent ? 'This week' : undefined}
              count={inWeek.length}
              accented={week.isCurrent}
              canDrop={canWrite}
              onAdd={canWrite ? () => onSelect({ mode: 'create', date: week.startIso }) : undefined}
            >
              {inWeek.map((service) => (
                <PrototypePlannerCard
                  key={service.id}
                  service={service}
                  timeLabel={timeLabel(service)}
                  draggable={canWrite}
                  selected={selection?.mode === 'edit' && selection.serviceId === service.id}
                  onSelect={() => onSelect({ mode: 'edit', serviceId: service.id })}
                />
              ))}
            </Column>
          );
        })}

        <div className="proto-planner-board__more">
          <button
            type="button"
            className="proto-glass-surface proto-glass-surface--control proto-glass-action"
            onClick={() => setWeekCount((count) => count + WEEKS_STEP)}
          >
            <span className="proto-glass-action__label">{WEEKS_STEP} more weeks</span>
          </button>
        </div>
      </div>

      {readOnlyReason ? (
        <p className="proto-caption proto-planner__readonly" role="status">
          {readOnlyReason === 'lapsed'
            ? 'This plan is read-only while the church pilot is paused.'
            : 'A pastor or admin changes what is planned here.'}
        </p>
      ) : null}

      {/*
        Portaled to the body: the shell frame carries a backdrop-filter, which
        makes it a containing block for fixed positioning — a DragOverlay left
        inside it would be clipped to the panel and lag the cursor.
      */}
      {typeof document !== 'undefined'
        ? createPortal(
            <DragOverlay dropAnimation={null}>
              {dragging ? (
                <div className="proto-planner-card proto-planner-card--overlay">
                  <PlannerCardBody service={dragging} timeLabel={timeLabel(dragging)} />
                </div>
              ) : null}
            </DragOverlay>,
            document.body,
          )
        : null}
    </DndContext>
  );
}
