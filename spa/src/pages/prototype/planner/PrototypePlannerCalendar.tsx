/**
 * The plan on a month grid — the view that answers "is Advent covered?".
 *
 * Built on the same month arithmetic as `ProtoDatePicker`, but not that
 * component: a picker returns one date and closes, and this one holds sermons,
 * accepts drops on any day, and stays open. Sharing the grid maths and nothing
 * else is the right amount of sharing.
 *
 * Dropping here sets an exact day, unlike the board's week columns which keep a
 * sermon's weekday. That is the point of the view — you came to this grid
 * because you wanted to say *which* day.
 */
import { useMemo, useState, useSyncExternalStore } from 'react';
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
import { spaceIconAccentHex, type SpaceCoverPickerColor } from '@/utils/space-cover';
import { getColorSchemeSnapshot, subscribeColorScheme } from '../../../lib/prototype-background';
import { localTodayIso, sermonTimeLabel } from '../../../lib/church-services';
import {
  addMonths,
  buildProtoDatePickerMonth,
  formatProtoDatePickerMonthLabel,
  parseLocalDateInput,
} from '../../../lib/proto-date-picker';
import {
  calendarBandLanesByRow,
  calendarSeriesBands,
  dayDroppableId,
  parseDroppableId,
  partitionPlan,
} from '../../../lib/planner-board';
import PrototypePlannerCard, { PlannerCardBody } from './PrototypePlannerCard';
import type { PlannerSelection } from './PrototypeExpandedPlanner';

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function DayCell({
  iso,
  day,
  inMonth,
  isToday,
  colorScheme,
  gridRow,
  gridColumn,
  bandLanes,
  canDrop,
  onAdd,
  children,
}: {
  iso: string;
  day: number;
  inMonth: boolean;
  isToday: boolean;
  /**
   * The series standing on this day — usually one, two when a church runs a
   * morning and an evening series.
   *
   * **A rule per cell, not a band across cells.** The board's run band works
   * because its slots are consecutive *weeks*, which sit side by side. A month
   * grid's slots are consecutive *days*, and an eight-week series touches one
   * cell per row — so a horizontal band would be eight separate one-cell marks
   * and say nothing. Here continuity reads *down* the column instead: five
   * Sundays carrying the same rule is the run, and the week the colour changes
   * is where the series did.
   */
  /** Resolved once by the grid, not per cell — see the day map below. */
  colorScheme: 'light' | 'dark';
  /** Explicit placement — see the call site. */
  gridRow: number;
  gridColumn: number;
  /** Band lines above this row's cells; their height is reserved as padding. */
  bandLanes: number;
  canDrop: boolean;
  onAdd?: () => void;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: dayDroppableId(iso), disabled: !canDrop });
  return (
    <div
      ref={setNodeRef}
      style={{ gridRow, gridColumn, ['--band-lanes' as string]: bandLanes }}
      className={[
        'proto-planner-day',
        inMonth ? '' : 'proto-planner-day--outside',
        isToday ? 'proto-planner-day--today' : '',
        isOver && canDrop ? 'proto-planner-day--over' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="proto-planner-day__head">
        <span className="proto-planner-day__number">{day}</span>
        {onAdd ? (
          <button
            type="button"
            className="proto-planner-day__add"
            aria-label={`Add a sermon on ${iso}`}
            title="Add here"
            onClick={onAdd}
          >
            <Icon name="plus" size={9} />
          </button>
        ) : null}
      </div>
      {children}
    </div>
  );
}

export default function PrototypePlannerCalendar({
  services,
  serviceTimes,
  accentFor,
  canWrite,
  selection,
  onSelect,
  onMoveToDate,
}: {
  services: TeachingPlanSermon[];
  serviceTimes: ChurchServiceTimeOption[];
  /** Shared with the board and list so one run is one colour everywhere. */
  accentFor: (seriesId: string | null | undefined) => SpaceCoverPickerColor | null;
  canWrite: boolean;
  selection: PlannerSelection;
  onSelect: (selection: PlannerSelection) => void;
  onMoveToDate: (serviceId: string, iso: string | null) => void;
}) {
  const today = localTodayIso();
  /* Resolved once for the whole grid rather than per cell — 42 subscriptions
     to the same store is 41 more than the month needs. */
  const colorScheme = useSyncExternalStore(
    subscribeColorScheme,
    getColorSchemeSnapshot,
    () => 'light' as const,
  );
  const [cursor, setCursor] = useState(() => parseLocalDateInput(today) ?? new Date());
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
  );

  const cells = useMemo(
    () => buildProtoDatePickerMonth(cursor.getFullYear(), cursor.getMonth()),
    [cursor],
  );
  const { backlog, byDate } = useMemo(() => partitionPlan(services), [services]);

  /* One band per series per week row — see calendarSeriesBands for why a run
     never spans a row break. */
  const seriesBands = useMemo(() => calendarSeriesBands(cells, byDate), [cells, byDate]);
  /* How many band lines each week row has to make room for, so a cell's own
     content starts below them instead of underneath. */
  const bandLanes = useMemo(() => calendarBandLanesByRow(seriesBands), [seriesBands]);
  const timeLabel = (service: TeachingPlanSermon) => sermonTimeLabel(service, serviceTimes);
  const dragging = draggingId ? services.find((s) => s.id === draggingId) ?? null : null;

  /*
    Deduped by *series*, not by colour: a morning and an evening sermon in the
    same series is one run standing on that day and gets one mark. Two different
    series get two, which is the case the marks exist to tell apart.
  */
  const onDragEnd = (event: DragEndEvent) => {
    setDraggingId(null);
    const overId = event.over ? String(event.over.id) : null;
    if (!overId) return;
    const target = parseDroppableId(overId);
    if (!target) return;
    if (target.kind === 'day') onMoveToDate(String(event.active.id), target.iso);
    if (target.kind === 'backlog') onMoveToDate(String(event.active.id), null);
  };

  return (
    <DndContext
      sensors={sensors}
      onDragStart={(event: DragStartEvent) => setDraggingId(String(event.active.id))}
      onDragCancel={() => setDraggingId(null)}
      onDragEnd={onDragEnd}
    >
      <div className="proto-planner-calendar">
        <div className="proto-planner-calendar__grid-wrap">
          <header className="proto-planner-calendar__head">
            <button
              type="button"
              className="proto-side-panel__action-btn"
              aria-label="Previous month"
              onClick={() => setCursor((c) => addMonths(c, -1))}
            >
              <Icon name="caret-left" size={13} />
            </button>
            <span className="proto-planner-calendar__month">
              {formatProtoDatePickerMonthLabel(cursor.getFullYear(), cursor.getMonth())}
            </span>
            <button
              type="button"
              className="proto-side-panel__action-btn"
              aria-label="Next month"
              onClick={() => setCursor((c) => addMonths(c, 1))}
            >
              <Icon name="caret-right" size={13} />
            </button>
          </header>

          <div className="proto-planner-calendar__weekdays" aria-hidden>
            {WEEKDAY_LABELS.map((label) => (
              <span key={label}>{label}</span>
            ))}
          </div>

          <div className="proto-planner-calendar__grid">
            {/*
              Bands first, so they paint under the cells' own content. They are
              grid items placed on the same tracks as the days they cover —
              grid allows the overlap, which is what lets a run read as one
              object spanning several columns instead of N tinted squares.
            */}
            {seriesBands.map((band) => (
              <span
                key={band.key}
                className={[
                  'proto-planner-calendar__band',
                  /* Square where the run carries on, rounded where it starts or
                     stops — so a reader can see which end is an edge and which
                     is a wrap. */
                  band.continuesFromPrev ? 'proto-planner-calendar__band--from-prev' : '',
                  band.continuesToNext ? 'proto-planner-calendar__band--to-next' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                style={{
                  gridRow: band.row,
                  gridColumn: `${band.colStart} / span ${band.colSpan}`,
                  ['--band-lane' as string]: band.lane,
                  ['--space-icon-accent' as string]: spaceIconAccentHex(
                    accentFor(band.seriesId) ?? 'paper',
                    colorScheme,
                  ),
                }}
                title={band.label ?? undefined}
                aria-hidden
              />
            ))}
            {cells.map((cell, index) => (
              <DayCell
                colorScheme={colorScheme}
                key={cell.iso}
                /*
                  Placed explicitly, not auto-flowed. The bands above are grid
                  items with their own row/column, and an explicitly placed item
                  makes auto-placement skip the cells it occupies — which slid
                  every day after the first band a column to the right.
                */
                gridRow={Math.floor(index / 7) + 1}
                gridColumn={(index % 7) + 1}
                bandLanes={bandLanes[Math.floor(index / 7)] ?? 0}
                iso={cell.iso}
                day={cell.day}
                inMonth={cell.inMonth}
                isToday={cell.iso === today}
                canDrop={canWrite}
                onAdd={canWrite ? () => onSelect({ mode: 'create', date: cell.iso }) : undefined}
              >
                {(byDate.get(cell.iso) ?? []).map((service) => (
                  <PrototypePlannerCard
                    key={service.id}
                    service={service}
                    timeLabel={timeLabel(service)}
                    accent={accentFor(service.seriesId)}
                    draggable={canWrite}
                    compact
                    selected={selection?.mode === 'edit' && selection.serviceId === service.id}
                    onSelect={() => onSelect({ mode: 'edit', serviceId: service.id })}
                  />
                ))}
              </DayCell>
            ))}
          </div>
        </div>

        {/*
          The Ideas rail rides along so scheduling and unscheduling both work in
          this view. Without it a calendar could only ever move dated sermons
          around, and the backlog would be board-only — which would make the two
          views disagree about what the plan contains.
        */}
        <CalendarBacklogRail
          backlog={backlog}
          timeLabel={timeLabel}
          accentFor={accentFor}
          canWrite={canWrite}
          selection={selection}
          onSelect={onSelect}
        />
      </div>

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

function CalendarBacklogRail({
  backlog,
  timeLabel,
  accentFor,
  canWrite,
  selection,
  onSelect,
}: {
  backlog: TeachingPlanSermon[];
  timeLabel: (service: TeachingPlanSermon) => string | null;
  accentFor: (seriesId: string | null | undefined) => SpaceCoverPickerColor | null;
  canWrite: boolean;
  selection: PlannerSelection;
  onSelect: (selection: PlannerSelection) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: 'planner-backlog', disabled: !canWrite });
  return (
    <aside
      ref={setNodeRef}
      className={`proto-planner-calendar__rail${isOver && canWrite ? ' proto-planner-calendar__rail--over' : ''}`}
      aria-label="Ideas"
    >
      {/* No subtitle. "Drag onto a day" instructed at the one moment nobody is
          reading — a strip that is usually empty — and the drag it describes is
          discovered by trying it, not by being told. The board's columns keep
          theirs, where the second line carries a date rather than a hint. */}
      <header className="proto-planner-column__head">
        <div className="proto-planner-column__head-text">
          <span className="proto-planner-column__title">Ideas</span>
        </div>
      </header>
      <div className="proto-planner-column__body">
        {backlog.length === 0 ? (
          <p className="proto-caption proto-planner-column__empty">Nothing yet</p>
        ) : (
          backlog.map((service) => (
            <PrototypePlannerCard
              key={service.id}
              service={service}
              timeLabel={timeLabel(service)}
              accent={accentFor(service.seriesId)}
              draggable={canWrite}
              selected={selection?.mode === 'edit' && selection.serviceId === service.id}
              onSelect={() => onSelect({ mode: 'edit', serviceId: service.id })}
            />
          ))
        )}
      </div>
      {/*
        At the end of the strip, not inside the header. Sitting after the label
        it landed between "Drag onto a day" and the cards — a control adrift in
        the middle of a bar, reading as punctuation between two things rather
        than as the way to add one.
      */}
      {canWrite ? (
        <button
          type="button"
          className="proto-side-panel__action-btn proto-planner-calendar__rail-add"
          title="Add an idea"
          aria-label="Add an idea"
          onClick={() => onSelect({ mode: 'create', date: null })}
        >
          <Icon name="plus" size={12} />
        </button>
      ) : null}
    </aside>
  );
}
