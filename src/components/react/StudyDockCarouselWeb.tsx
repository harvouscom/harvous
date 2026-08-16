'use client';

import React, { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import type { StudyDockEntry, StudyDockStack } from '@/utils/study-dock-stack';
import {
  resolveStudyDockCenterTarget,
  syncStudyDockCenterOffset,
  syncStudyDockDragHandleHeight,
  updateStudyDockExpandedMaxHeight,
} from '@/utils/study-dock-layout';
import { applyHtml5DragPreview } from '@/utils/html5-drag-preview';
import '@/styles/html5-drag-preview.css';
import '@/styles/study-dock-card.css';
import '@/styles/study-dock-carousel.css';

export interface StudyDockCarouselWebProps {
  stack: StudyDockStack;
  onSelectEntry: (id: string) => void;
  onMoveEntry: (entryId: string, toIndex: number) => void;
  renderEntry: (entry: StudyDockEntry, isActive: boolean) => React.ReactNode;
}

export function studyDockEntryAccessibleLabel(entry: StudyDockEntry): string {
  if (entry.kind === 'scripture') {
    return `Scripture ${entry.session.reference || 'passage'}`;
  }
  if (entry.kind === 'reference') {
    return `Reference ${entry.session.query || 'study'}`;
  }
  if (entry.kind === 'resource') {
    return `Resource ${entry.session.title || entry.session.domain || 'link'}`;
  }
  const subject = entry.session.focusTitle?.trim() || entry.session.excerpt.trim() || 'Highlight';
  const actor = entry.session.authorDisplayName?.trim();
  return actor ? `${subject}, by ${actor}` : subject;
}

function StudyDockCarouselItem({
  entry,
  index,
  itemCount,
  accessibleLabel,
  tabIndex,
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
  onItemFocus,
  onItemKeyDown,
  onKeyboardMove,
  renderEntry,
}: {
  entry: StudyDockEntry;
  index: number;
  itemCount: number;
  accessibleLabel: string;
  tabIndex: number;
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
  onItemFocus: (entryId: string) => void;
  onItemKeyDown: (event: React.KeyboardEvent<HTMLDivElement>, index: number) => void;
  onKeyboardMove: (entryId: string, toIndex: number) => void;
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
      data-dock-roving-item="true"
      data-active={isActive ? 'true' : undefined}
      role="listitem"
      aria-current={isActive ? 'true' : undefined}
      aria-label={accessibleLabel}
      tabIndex={tabIndex}
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
      onFocus={() => onItemFocus(entry.id)}
      onKeyDown={(event) => {
        if (event.target === event.currentTarget) onItemKeyDown(event, index);
      }}
      onMouseDownCapture={(e) => {
        const target = e.target as HTMLElement;
        if (target.closest('.study-dock-carousel__drag-handle')) return;
        if (target.closest('.study-dock-card__header-actions')) return;
        if (target.closest('.study-dock-card__body-wrap')) return;
        if (target.closest('.scripture-pill-chrome__passage')) return;
        if (
          target.closest(
            'button, input, textarea, select, a[href], [contenteditable="true"], [role="button"], [role="menuitem"]',
          )
        ) {
          return;
        }
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
          tabIndex={isActive && !draggingId ? 0 : -1}
          className="study-dock-carousel__drag-handle"
          draggable
          aria-label={`Reorder ${accessibleLabel}, position ${index + 1} of ${itemCount}. Use Left and Right Arrow keys.`}
          onDragStart={(e) => onDragStart(e, entry.id)}
          onDragEnd={onDragEnd}
          onMouseDown={(e) => e.stopPropagation()}
          onKeyDown={(event) => {
            let toIndex: number | null = null;
            if (event.key === 'ArrowLeft') toIndex = index - 1;
            else if (event.key === 'ArrowRight') toIndex = index + 1;
            else if (event.key === 'Home') toIndex = 0;
            else if (event.key === 'End') toIndex = itemCount - 1;
            if (toIndex == null || toIndex < 0 || toIndex >= itemCount || toIndex === index) return;
            event.preventDefault();
            event.stopPropagation();
            onKeyboardMove(entry.id, toIndex);
          }}
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
  const carouselId = useId();
  const prevEntryIdsRef = useRef<Set<string>>(new Set());
  const enteringIdsRef = useRef<Set<string>>(new Set());
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [focusedId, setFocusedId] = useState<string | null>(stack.activeId ?? stack.entries[0]?.id ?? null);
  const [reorderAnnouncement, setReorderAnnouncement] = useState('');
  const draggingIdRef = useRef<string | null>(null);

  const currentIds = stack.entries.map((e) => e.id);
  const currentIdSet = new Set(currentIds);
  enteringIdsRef.current = new Set(currentIds.filter((id) => !prevEntryIdsRef.current.has(id)));
  prevEntryIdsRef.current = currentIdSet;

  const activeEntry = stack.entries.find((e) => e.id === stack.activeId);
  const activeExpanded = Boolean(activeEntry?.expanded);
  // A single dock has nothing to reorder — hide the handle so the card centers in the row.
  const showDragHandle = stack.entries.length > 1;
  const rovingId = currentIdSet.has(focusedId ?? '')
    ? focusedId
    : stack.activeId && currentIdSet.has(stack.activeId)
      ? stack.activeId
      : (stack.entries[0]?.id ?? null);

  useEffect(() => {
    if (focusedId !== rovingId) setFocusedId(rovingId);
  }, [focusedId, rovingId]);

  const moveEntryWithAnnouncement = useCallback(
    (entryId: string, toIndex: number) => {
      const fromIndex = stack.entries.findIndex((entry) => entry.id === entryId);
      if (fromIndex < 0 || toIndex < 0 || toIndex >= stack.entries.length || fromIndex === toIndex) return;
      const entry = stack.entries[fromIndex];
      onMoveEntry(entryId, toIndex);
      setReorderAnnouncement(
        `Moved ${studyDockEntryAccessibleLabel(entry)} to position ${toIndex + 1} of ${stack.entries.length}.`,
      );
    },
    [onMoveEntry, stack.entries],
  );

  const handleItemKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>, index: number) => {
      const isHorizontalMove = event.key === 'ArrowLeft' || event.key === 'ArrowRight';
      if (event.altKey && isHorizontalMove) {
        const toIndex = index + (event.key === 'ArrowLeft' ? -1 : 1);
        if (toIndex >= 0 && toIndex < stack.entries.length) {
          event.preventDefault();
          moveEntryWithAnnouncement(stack.entries[index].id, toIndex);
        }
        return;
      }

      let nextIndex: number | null = null;
      if (event.key === 'ArrowLeft') nextIndex = (index - 1 + stack.entries.length) % stack.entries.length;
      else if (event.key === 'ArrowRight') nextIndex = (index + 1) % stack.entries.length;
      else if (event.key === 'Home') nextIndex = 0;
      else if (event.key === 'End') nextIndex = stack.entries.length - 1;
      else if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        onSelectEntry(stack.entries[index].id);
        return;
      }

      if (nextIndex == null) return;
      event.preventDefault();
      const nextEntry = stack.entries[nextIndex];
      setFocusedId(nextEntry.id);
      const items = trackRef.current?.querySelectorAll<HTMLElement>('[data-dock-roving-item="true"]');
      items?.[nextIndex]?.focus({ preventScroll: true });
    },
    [moveEntryWithAnnouncement, onSelectEntry, stack.entries],
  );

  const dragPreviewCleanupRef = useRef<(() => void) | null>(null);

  const handleDragStart = useCallback((event: React.DragEvent<HTMLDivElement>, entryId: string) => {
    draggingIdRef.current = entryId;
    setDraggingId(entryId);
    event.dataTransfer.setData('text/plain', entryId);
    event.dataTransfer.effectAllowed = 'move';
    dragPreviewCleanupRef.current?.();
    const item = event.currentTarget.closest('.study-dock-carousel__item') as HTMLElement | null;
    const preview = applyHtml5DragPreview(event, item, {
      className: 'study-dock-carousel__drag-preview',
    });
    dragPreviewCleanupRef.current = preview?.cleanup ?? null;
    const handle = event.currentTarget;
    handle.blur();
    if (document.activeElement instanceof HTMLElement && document.activeElement !== handle) {
      document.activeElement.blur();
    }
  }, []);

  const handleDragEnd = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    draggingIdRef.current = null;
    setDraggingId(null);
    dragPreviewCleanupRef.current?.();
    dragPreviewCleanupRef.current = null;
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

  const handleDrop = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    draggingIdRef.current = null;
    setDraggingId(null);
    dragPreviewCleanupRef.current?.();
    dragPreviewCleanupRef.current = null;
  }, []);

  const scrollActiveToEditorCenter = useCallback(
    (track: HTMLDivElement, smooth: boolean) => {
      if (!stack.activeId || !activeExpanded || draggingId) return;
      const el = track.querySelector<HTMLElement>(`[data-dock-entry-id="${stack.activeId}"]`);
      if (!el) return;

      if (stack.entries.length === 1) {
        syncStudyDockCenterOffset(track);
        return;
      }

      // The reading column counts as a paper — see `resolveStudyDockCenterTarget`. Asking
      // for the editor's paper by name meant every chapter in the Bible reader took the
      // bail-out below, so a dock opened while reading never centred on anything.
      const paper = resolveStudyDockCenterTarget();
      const card = el.querySelector<HTMLElement>('.study-dock-card__card');
      if (!(paper instanceof HTMLElement) || !(card instanceof HTMLElement)) {
        syncStudyDockCenterOffset(track);
        return;
      }

      syncStudyDockCenterOffset(track);

      const paperCenterX = paper.getBoundingClientRect().left + paper.getBoundingClientRect().width / 2;
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

    /*
     * Place the card without animating the placement.
     *
     * A single dock is centred on the open document by a transform read from
     * `--proto-study-dock-center-offset`, and that variable lives on the shell, written here
     * from a measurement that needs the card to exist. So on the FIRST dock of a page load
     * there is no value yet: the card mounts at translateX(0) — flush against the left of the
     * band — and then this effect writes the real offset, which the `transition: transform`
     * on the item happily animates. The result is a card that slides in from the left on the
     * first open of a session and rises straight up on every one after, because by then the
     * variable is already set. That is the "why did it come from the left that time" bug.
     *
     * The offset is where the card *is*, not a move it makes, so the first application is
     * committed with transitions off: set none, write the value, read a layout property to
     * flush it, restore. Everything after — the sidebar being dragged, the inspector docking —
     * is a real change and still eases, including the settle below.
     */
    const item = track.querySelector<HTMLElement>('.study-dock-carousel__item');
    const previousTransition = item?.style.transition ?? '';
    if (item) item.style.transition = 'none';
    syncStudyDockCenterOffset(track);
    if (item) {
      void item.offsetWidth;
      item.style.transition = previousTransition;
    }

    // ...and again once the shell's own moves have settled, this time eased.
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
    const formatBar = document.querySelector('.proto-editor-bottom-bar[data-mode="format"]');
    if (formatBar instanceof HTMLElement) {
      ro.observe(formatBar);
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
      <p id={`${carouselId}-instructions`} className="sr-only">
        Use Left and Right Arrow keys to move between docks, Enter or Space to open one, and Alt plus Left or Right
        Arrow to reorder.
      </p>
      <div
        ref={trackRef}
        className={['study-dock-carousel__track', draggingId ? 'study-dock-carousel__track--dragging' : '']
          .filter(Boolean)
          .join(' ')}
        role="list"
        aria-label="Open study docks"
        aria-describedby={`${carouselId}-instructions`}
      >
        {stack.entries.map((entry, index) => {
          const isActive = entry.id === stack.activeId;
          const isExpandedSlot = isActive && entry.expanded;
          const isEntering = enteringIdsRef.current.has(entry.id);
          const isDragging = draggingId === entry.id;
          const accessibleLabel = studyDockEntryAccessibleLabel(entry);
          return (
            <StudyDockCarouselItem
              key={entry.id}
              entry={entry}
              index={index}
              itemCount={stack.entries.length}
              accessibleLabel={accessibleLabel}
              tabIndex={entry.id === rovingId ? 0 : -1}
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
              onItemFocus={setFocusedId}
              onItemKeyDown={handleItemKeyDown}
              onKeyboardMove={moveEntryWithAnnouncement}
              renderEntry={renderEntry}
            />
          );
        })}
      </div>
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {reorderAnnouncement}
      </div>
    </div>
  );
}
