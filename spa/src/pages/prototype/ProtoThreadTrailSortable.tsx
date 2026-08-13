/**
 * Sortable plumbing for thread trails.
 *
 * Both trails — the connected-notes one on a note page and the Thread list
 * inside a shared space — need the same gesture, and it is the one the space
 * switcher already settled on. This is that setup in one place so the two
 * cannot drift apart, and so a third trail does not re-derive the sensor
 * constants a fourth time.
 *
 * The gesture, and why it is shaped this way (see `SpaceSwitcherMenu`, which
 * learned it first): the listeners belong on the ROW, not on the handle,
 * because touch has no hover and therefore no handle to press — a drag has to
 * be able to start from the row itself. The sensors are what keep the two
 * intents apart: a mouse click with no movement still opens the note, 6px of
 * movement reorders, and on touch a tap opens while a 200ms hold lifts. The
 * handle stays as the visual cue that a row can be moved, and as the keyboard
 * activator.
 *
 * This replaced HTML5 drag-and-drop, which is why reordering used to be
 * desktop-only: `draggable` + dragstart/dragover/drop never fire on touch at
 * all, so the handle was hidden on coarse pointers rather than degrading to
 * anything.
 */
import type { CSSProperties, ReactNode } from 'react';
import type { DraggableAttributes } from '@dnd-kit/core';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

/** What a trail row needs to become draggable. */
export interface ThreadTrailSortable {
  setNodeRef: (node: HTMLElement | null) => void;
  setActivatorNodeRef: (node: HTMLElement | null) => void;
  listeners: Record<string, unknown> | undefined;
  /** role / tabIndex / aria-describedby — dnd-kit's own drag instructions. */
  attributes: DraggableAttributes;
  style: CSSProperties;
}

/**
 * The context every sortable trail row must sit inside.
 *
 * `items` is the display order — dnd-kit resolves a drop against this list, so
 * it has to be the same array the rows are rendered from or a drop lands on the
 * wrong index.
 */
export function ProtoThreadTrailSortableList({
  items,
  onDragStart,
  onDragEnd,
  onDragCancel,
  children,
}: {
  items: string[];
  onDragStart: (id: string) => void;
  onDragEnd: (activeId: string, overId: string | null) => void;
  onDragCancel: () => void;
  children: ReactNode;
}) {
  /*
    Same pairing the planner board and the space switcher use. The touch delay
    is what makes a lift distinct from a scroll, and the 8px tolerance is the
    half that matters: move further than that before the delay elapses and the
    list scrolls instead of the row lifting.
  */
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={(event: DragStartEvent) => onDragStart(String(event.active.id))}
      onDragEnd={(event: DragEndEvent) =>
        onDragEnd(String(event.active.id), event.over ? String(event.over.id) : null)
      }
      onDragCancel={onDragCancel}
    >
      <SortableContext items={items} strategy={verticalListSortingStrategy}>
        {children}
      </SortableContext>
    </DndContext>
  );
}

/**
 * One sortable row, as a render prop.
 *
 * A component rather than a helper function because `useSortable` is a hook:
 * calling it from a loop in the parent would change the parent's hook count
 * with the number of notes. A render prop rather than a wrapper element because
 * the trail's row IS the `<li>`, and an extra div between the list and its rows
 * would break both the hairline dividers and `:last-child` on the spine.
 */
export function ProtoThreadTrailSortableRow({
  id,
  children,
}: {
  id: string;
  children: (sortable: ThreadTrailSortable) => ReactNode;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition } =
    useSortable({ id });

  return (
    <>
      {children({
        setNodeRef,
        setActivatorNodeRef,
        listeners,
        attributes,
        style: { transform: CSS.Transform.toString(transform), transition }
      })}
    </>
  );
}
