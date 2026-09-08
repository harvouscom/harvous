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
import type { SpaceCoverPickerColor } from '@/utils/space-cover';
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
import ProtoSeriesPill from './ProtoSeriesPill';
import type { PlannerSelection } from './PrototypeExpandedPlanner';

/** A quarter at a glance, which is the unit a teaching plan is decided in. */
const INITIAL_WEEKS = 8;
const WEEKS_STEP = 8;

/** One series crossing one week column, and which sides it carries on to. */

/**
 * The run band above a week's cards — a progress spine, not a rule.
 *
 * Bridged across the 10px column gap with negative margins on whichever side
 * the run carries on: a band that stopped at every column edge would draw eight
 * separate marks for one eight-week study, which is the thing this is here to
 * fix. Ends are rounded only where the run actually ends, so the shape itself
 * says "starts here", "passes through", "ends here".
 *
 * **Each column is a segment, and the segment is filled only when that week has
 * a passage.** The board already draws one band per week column, so the
 * segmentation costs nothing — and it turns a mark that only said "these weeks
 * belong together" into one that also answers *how far through am I*. An
 * eight-week run reads as five solid and three hollow without anyone reading a
 * number, which is the whole reason colour is here rather than decoration.
 */

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
          <span className="proto-planner-column__title proto-marquee" title={title}>
            <span>{title}</span>
          </span>
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
      {/* The run band moved to the calendar. A board column is one week, and
          how long a run lasts is a question about time — which the calendar
          answers by spanning the days it covers. Here the pill on each card
          says which run it belongs to, and that is the whole job. */}
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
  accentFor,
  canWrite,
  readOnlyMessage,
  defaultDay,
  selection,
  onSelect,
  onMove,
}: {
  services: TeachingPlanSermon[];
  serviceTimes: ChurchServiceTimeOption[];
  /** Shared with the other views so one run is one colour everywhere. */
  accentFor: (seriesId: string | null | undefined) => SpaceCoverPickerColor | null;
  canWrite: boolean;
  /** The resolved sentence, or null when the viewer may write. */
  readOnlyMessage: string | null;
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

  /*
    Run bands, per week column. `seriesTitle` rides on the sermon rows already
    (the plan payload joins it), so the label comes from the plan rather than
    from a second lookup that could disagree with the card underneath it.
  */
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
        {/* No subtitle. The week columns use theirs to say *which* week ("This week"),
            which is information; "No date yet" only restated what the column is already
            called and what its emptiness already shows. */}
        <Column
          id={BACKLOG_DROPPABLE_ID}
          title="Ideas"
          count={backlog.length}
          canDrop={canWrite}
          onAdd={canWrite ? () => onSelect({ mode: 'create', date: null }) : undefined}
        >
          {backlog.map((service) => (
            <PrototypePlannerCard
              key={service.id}
              service={service}
              timeLabel={timeLabel(service)}
              /* Ideas get the rail but never a band: an undated card belongs to
                 a series without yet belonging to a stretch of weeks. */
              accent={accentFor(service.seriesId)}
              draggable={canWrite}
              selected={selection?.mode === 'edit' && selection.serviceId === service.id}
              onSelect={() => onSelect({ mode: 'edit', serviceId: service.id })}
            />
          ))}
        </Column>

        {weeks.map((week, index) => {
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
                  accent={accentFor(service.seriesId)}
                  draggable={canWrite}
                  selected={selection?.mode === 'edit' && selection.serviceId === service.id}
                  onSelect={() => onSelect({ mode: 'edit', serviceId: service.id })}
                />
              ))}
            </Column>
          );
        })}

        {/*
          The next column, rather than a button parked beside the last one.
          The board is a run of weeks you scroll through, so "further out" is a
          place on it — a pill wedged against the final column read as a
          toolbar control that had drifted into the canvas, and had nowhere to
          breathe. Dashed and unfilled: it is where the plan could go, not a
          week that exists.

          A caret, not a plus. Every other plus on this board creates a row;
          this one only scrolls the board further out, and wearing the same
          glyph made it the eleventh identical-looking add button on a screen
          that already had ten. It is also the one control here that is not
          gated on `canWrite` — correctly, since looking further ahead is not
          editing, which is another reason it should not look like adding.
        */}
        <button
          type="button"
          className="proto-planner-board__more"
          onClick={() => setWeekCount((count) => count + WEEKS_STEP)}
        >
          <span className="proto-planner-board__more-label">
            <Icon name="caret-right" size={12} aria-hidden />
            {WEEKS_STEP} more weeks
          </span>
        </button>
      </div>

      {readOnlyMessage ? (
        <p className="proto-caption proto-planner__readonly" role="status">
          {readOnlyMessage}
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
                <div
                  className="proto-planner-card proto-planner-card--overlay"
                  data-series-accent={accentFor(dragging.seriesId) ?? undefined}
                  data-in-series={accentFor(dragging.seriesId) ? 'true' : undefined}
                >
                  <PlannerCardBody
                    service={dragging}
                    timeLabel={timeLabel(dragging)}
                    seriesAccent={accentFor(dragging.seriesId)}
                  />
                </div>
              ) : null}
            </DragOverlay>,
            document.body,
          )
        : null}
    </DndContext>
  );
}
