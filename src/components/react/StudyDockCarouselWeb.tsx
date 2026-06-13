'use client';

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { StudyDockEntry, StudyDockStack } from '@/utils/study-dock-stack';
import {
  syncStudyDockCenterOffset,
  syncStudyDockDragHandleHeight,
  updateStudyDockExpandedMaxHeight,
} from '@/utils/study-dock-layout';
import '@/styles/study-dock-card.css';
import '@/styles/study-dock-carousel.css';

export interface StudyDockCarouselWebProps {
  stack: StudyDockStack;
  onSelectEntry: (id: string) => void;
  onMoveEntry: (entryId: string, toIndex: number) => void;
  renderEntry: (entry: StudyDockEntry, isActive: boolean) => React.ReactNode;
}

function StudyDockCarouselItem({
  entry,
  isActive,
  isExpandedSlot,
  isEntering,
  isDragging,
  draggingId,
  showDragHandle,
  onSelectEntry,
  onDragOver,
  onDrop,
  onDragStart,
  onDragEnd,
  renderEntry,
}: {
  entry: StudyDockEntry;
  isActive: boolean;
  isExpandedSlot: boolean;
  isEntering: boolean;
  isDragging: boolean;
  draggingId: string | null;
  showDragHandle: boolean;
  onSelectEntry: (id: string) => void;
  onDragOver: (event: React.DragEvent<HTMLDivElement>, targetId: string) => void;
  onDrop: (event: React.DragEvent<HTMLDivElement>) => void;
  onDragStart: (event: React.DragEvent<HTMLDivElement>, entryId: string) => void;
  onDragEnd: (event: React.DragEvent<HTMLDivElement>) => void;
  renderEntry: (entry: StudyDockEntry, isActive: boolean) => React.ReactNode;
}) {
  const handleRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const handle = handleRef.current;
    const inner = innerRef.current;
    if (!handle || !inner || !showDragHandle) return undefined;

    const sync = () => {
      const cardOuter = inner.querySelector<HTMLElement>('.study-dock-card__outer');
      if (cardOuter) syncStudyDockDragHandleHeight(handle, cardOuter);
    };

    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(inner);
    const cardOuter = inner.querySelector<HTMLElement>('.study-dock-card__outer');
    if (cardOuter) ro.observe(cardOuter);
    const header = inner.querySelector<HTMLElement>('.study-dock-card__header');
    if (header) ro.observe(header);

    const afterEnter = window.setTimeout(sync, 360);
    return () => {
      ro.disconnect();
      window.clearTimeout(afterEnter);
    };
  }, [entry.id, entry.expanded, isActive, isExpandedSlot, showDragHandle]);

  return (
    <div
      data-dock-entry-id={entry.id}
      role="tab"
      aria-selected={isActive}
      tabIndex={draggingId ? -1 : undefined}
      className={[
        'study-dock-carousel__item',
        isExpandedSlot ? 'study-dock-carousel__item--expanded-slot' : 'study-dock-carousel__item--compact',
        !isActive ? 'study-dock-carousel__item--inactive' : '',
        isEntering ? 'study-dock-carousel__item--enter' : '',
        isDragging ? 'study-dock-carousel__item--dragging' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      onDragOver={(e) => onDragOver(e, entry.id)}
      onDrop={onDrop}
      onMouseDownCapture={(e) => {
        if ((e.target as HTMLElement).closest('.study-dock-carousel__drag-handle')) return;
        if ((e.target as HTMLElement).closest('.study-dock-card__header-actions')) return;
        if ((e.target as HTMLElement).closest('.study-dock-card__body-wrap')) return;
        if ((e.target as HTMLElement).closest('.scripture-pill-chrome__passage')) return;
        if (isActive && entry.expanded) return;
        e.preventDefault();
        e.stopPropagation();
        onSelectEntry(entry.id);
      }}
    >
      {showDragHandle ? (
        <div
          ref={handleRef}
          role="button"
          tabIndex={-1}
          className="study-dock-carousel__drag-handle"
          draggable
          aria-label="Reorder study dock"
          onDragStart={(e) => onDragStart(e, entry.id)}
          onDragEnd={onDragEnd}
          onMouseDown={(e) => e.stopPropagation()}
        />
      ) : null}
      <div ref={innerRef} className="study-dock-carousel__item-inner">
        {renderEntry(entry, isActive)}
      </div>
    </div>
  );
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
  // A single dock has nothing to reorder — hide the handle so the card centers in the row.
  const showDragHandle = stack.entries.length > 1;

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

  const scrollActiveToEditorCenter = useCallback(
    (track: HTMLDivElement, smooth: boolean) => {
      if (!stack.activeId || !activeExpanded || draggingId) return;
      const el = track.querySelector<HTMLElement>(`[data-dock-entry-id="${stack.activeId}"]`);
      if (!el) return;

      if (stack.entries.length === 1) {
        syncStudyDockCenterOffset(track);
        return;
      }

      const paper = document.querySelector('.proto-editor-paper');
      const card = el.querySelector<HTMLElement>('.study-dock-card__card');
      if (!(paper instanceof HTMLElement) || !(card instanceof HTMLElement)) {
        syncStudyDockCenterOffset(track);
        return;
      }

      syncStudyDockCenterOffset(track);

      const paperCenterX =
        paper.getBoundingClientRect().left + paper.getBoundingClientRect().width / 2;
      const cardRect = card.getBoundingClientRect();
      const cardCenterX = cardRect.left + cardRect.width / 2;
      const delta = cardCenterX - paperCenterX;
      const maxScroll = Math.max(0, track.scrollWidth - track.clientWidth);
      const left = Math.max(0, Math.min(track.scrollLeft + delta, maxScroll));

      if (smooth) {
        const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        track.scrollTo({
          left,
          behavior: prefersReducedMotion ? 'auto' : 'smooth',
        });
      } else {
        track.scrollLeft = left;
      }
    },
    [activeExpanded, draggingId, stack.activeId, stack.entries.length],
  );

  useLayoutEffect(() => {
    const track = trackRef.current;
    if (!track || stack.entries.length === 0) return;
    syncStudyDockCenterOffset(track);
    const afterLayout = window.setTimeout(() => syncStudyDockCenterOffset(track), 340);
    return () => window.clearTimeout(afterLayout);
  }, [stack.entries.length, stack.activeId, activeExpanded, currentIds.join(',')]);

  useEffect(() => {
    const track = trackRef.current;
    if (!track || !stack.activeId || !activeExpanded || draggingId) return;

    scrollActiveToEditorCenter(track, true);
    const afterLayout = window.setTimeout(() => scrollActiveToEditorCenter(track, true), 340);
    return () => window.clearTimeout(afterLayout);
  }, [
    stack.activeId,
    activeExpanded,
    stack.entries.length,
    draggingId,
    currentIds.join(','),
    scrollActiveToEditorCenter,
  ]);

  useEffect(() => {
    updateStudyDockExpandedMaxHeight(trackRef.current);
    const track = trackRef.current;
    if (!track) return undefined;

    const onLayoutChange = () => {
      updateStudyDockExpandedMaxHeight(track);
      scrollActiveToEditorCenter(track, false);
    };

    const ro = new ResizeObserver(onLayoutChange);
    ro.observe(track);
    const editorSurface = document.querySelector('.proto-editor-surface');
    if (editorSurface instanceof HTMLElement) {
      ro.observe(editorSurface);
    }
    const contentWrap = document.querySelector('.proto-editor-content-wrap');
    if (contentWrap instanceof HTMLElement) {
      ro.observe(contentWrap);
    }
    const paper = document.querySelector('.proto-editor-paper');
    if (paper instanceof HTMLElement) {
      ro.observe(paper);
    }

    const afterLayout = window.setTimeout(() => updateStudyDockExpandedMaxHeight(track), 360);
    return () => {
      ro.disconnect();
      window.clearTimeout(afterLayout);
    };
  }, [stack.entries.length, stack.activeId, activeExpanded, draggingId, scrollActiveToEditorCenter]);

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
            <StudyDockCarouselItem
              key={entry.id}
              entry={entry}
              isActive={isActive}
              isExpandedSlot={isExpandedSlot}
              isEntering={isEntering}
              isDragging={isDragging}
              draggingId={draggingId}
              showDragHandle={showDragHandle}
              onSelectEntry={onSelectEntry}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
              renderEntry={renderEntry}
            />
          );
        })}
      </div>
    </div>
  );
}
