'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { StudyDockEntry, StudyDockStack } from '@/utils/study-dock-stack';
import '@/styles/study-dock-card.css';
import '@/styles/study-dock-carousel.css';

export interface StudyDockCarouselWebProps {
  stack: StudyDockStack;
  onSelectEntry: (id: string) => void;
  onMoveEntry: (entryId: string, toIndex: number) => void;
  renderEntry: (entry: StudyDockEntry, isActive: boolean) => React.ReactNode;
}

/**
 * Per-note dock carousel: each stack entry is a card; inactive cards stay collapsed in a horizontal row.
 */
export default function StudyDockCarouselWeb({
  stack,
  onSelectEntry,
  onMoveEntry,
  renderEntry,
}: StudyDockCarouselWebProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const prevEntryIdsRef = useRef<Set<string>>(new Set());
  const enteringIdsRef = useRef<Set<string>>(new Set());
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const draggingIdRef = useRef<string | null>(null);

  const currentIds = stack.entries.map((e) => e.id);
  const currentIdSet = new Set(currentIds);
  enteringIdsRef.current = new Set(currentIds.filter((id) => !prevEntryIdsRef.current.has(id)));
  prevEntryIdsRef.current = currentIdSet;

  const activeEntry = stack.entries.find((e) => e.id === stack.activeId);
  const activeExpanded = Boolean(activeEntry?.expanded);

  const handleDragStart = useCallback((event: React.DragEvent<HTMLDivElement>, entryId: string) => {
    draggingIdRef.current = entryId;
    setDraggingId(entryId);
    event.dataTransfer.setData('text/plain', entryId);
    event.dataTransfer.effectAllowed = 'move';
    const handle = event.currentTarget;
    handle.blur();
    if (document.activeElement instanceof HTMLElement && document.activeElement !== handle) {
      document.activeElement.blur();
    }
  }, []);

  const handleDragEnd = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    draggingIdRef.current = null;
    setDraggingId(null);
    event.currentTarget.blur();
  }, []);

  const handleDragOver = useCallback(
    (event: React.DragEvent<HTMLDivElement>, targetId: string) => {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      const dragged = draggingIdRef.current;
      if (!dragged || dragged === targetId) return;
      const fromIndex = stack.entries.findIndex((e) => e.id === dragged);
      const toIndex = stack.entries.findIndex((e) => e.id === targetId);
      if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return;
      onMoveEntry(dragged, toIndex);
    },
    [onMoveEntry, stack.entries],
  );

  const handleDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      draggingIdRef.current = null;
      setDraggingId(null);
    },
    [],
  );

  useEffect(() => {
    const track = trackRef.current;
    if (!track || !stack.activeId || !activeExpanded || draggingId) return;

    const centerActiveInTrack = () => {
      const el = track.querySelector<HTMLElement>(`[data-dock-entry-id="${stack.activeId}"]`);
      if (!el) return;
      const prefersReducedMotion =
        typeof window !== 'undefined' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const elCenter = el.offsetLeft + el.offsetWidth / 2;
      const targetLeft = elCenter - track.clientWidth / 2;
      const maxScroll = Math.max(0, track.scrollWidth - track.clientWidth);
      track.scrollTo({
        left: Math.max(0, Math.min(targetLeft, maxScroll)),
        behavior: prefersReducedMotion ? 'auto' : 'smooth',
      });
    };

    centerActiveInTrack();
    const afterLayout = window.setTimeout(centerActiveInTrack, 340);
    return () => window.clearTimeout(afterLayout);
  }, [stack.activeId, activeExpanded, stack.entries.length, draggingId, currentIds.join(',')]);

  if (stack.entries.length === 0) return null;

  return (
    <div className="study-dock-carousel" role="region" aria-label="Study docks">
      <div
        ref={trackRef}
        className={[
          'study-dock-carousel__track',
          draggingId ? 'study-dock-carousel__track--dragging' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        role="tablist"
        aria-label="Open study docks"
      >
        {stack.entries.map((entry) => {
          const isActive = entry.id === stack.activeId;
          const isExpandedSlot = isActive && entry.expanded;
          const isEntering = enteringIdsRef.current.has(entry.id);
          const isDragging = draggingId === entry.id;
          return (
            <div
              key={entry.id}
              data-dock-entry-id={entry.id}
              role="tab"
              aria-selected={isActive}
              tabIndex={draggingId ? -1 : undefined}
              className={[
                'study-dock-carousel__item',
                isExpandedSlot
                  ? 'study-dock-carousel__item--expanded-slot'
                  : 'study-dock-carousel__item--compact',
                !isActive ? 'study-dock-carousel__item--inactive' : '',
                isEntering ? 'study-dock-carousel__item--enter' : '',
                isDragging ? 'study-dock-carousel__item--dragging' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onDragOver={(e) => handleDragOver(e, entry.id)}
              onDrop={handleDrop}
              onMouseDownCapture={(e) => {
                if ((e.target as HTMLElement).closest('.study-dock-carousel__drag-handle')) return;
                if ((e.target as HTMLElement).closest('.study-dock-card__header-actions')) return;
                if (isActive && entry.expanded) return;
                e.preventDefault();
                e.stopPropagation();
                onSelectEntry(entry.id);
              }}
            >
              <div
                role="button"
                tabIndex={-1}
                className="study-dock-carousel__drag-handle"
                draggable
                aria-label="Reorder study dock"
                onDragStart={(e) => handleDragStart(e, entry.id)}
                onDragEnd={handleDragEnd}
                onMouseDown={(e) => e.stopPropagation()}
              />
              <div className="study-dock-carousel__item-inner">{renderEntry(entry, isActive)}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
