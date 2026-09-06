/**
 * The church's Resource Library, from the curator's side.
 *
 * The second consumer of the expanded-sidebar pattern, and the reason the
 * pattern was built generic: a catalog with an audience toggle, a scope
 * picker, and a review queue does not fit a 304px column, and it is work you
 * sit in rather than a thing you finish and dismiss.
 *
 * Two views. **Items** is the catalog. **Suggestions** is what the congregation
 * has proposed — a separate view rather than a badge on the list, because
 * reviewing is a different posture from curating and mixing them would make the
 * queue something you scroll past.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Icon, { type IconName } from '@/components/react/Icon';
import ProtoSidebarExpandedPanel from '../ProtoSidebarExpandedPanel';
import type { ExpandedSidebarToolProps } from '../PrototypeExpandedSidebarHost';
import ProtoSpaceLoading from '../ProtoSpaceLoading';
import PrototypeListEmptyState from '../PrototypeListEmptyState';
import { useChurchPlannerAccess } from '../../../hooks/useChurchPlannerAccess';
import { useChurchStaffStatus } from '../../../hooks/queries/useChurchStaffStatus';
import { useProtoShell } from '../../../layouts/proto-shell-context';
import {
  useChurchLibraryManage,
  useLibrarySuggestionQueue,
  useMarkLibrarySuggestionsRead,
  unreadLibrarySuggestionCount,
  type ChurchLibraryStaffItem,
} from '../../../hooks/queries/useChurchLibrary';
import PrototypeLibraryManagerItems from './PrototypeLibraryManagerItems';
import PrototypeLibraryItemEditorPane from './PrototypeLibraryItemEditorPane';
import PrototypeLibrarySuggestionQueue from './PrototypeLibrarySuggestionQueue';

export type LibraryManagerView = 'items' | 'suggestions';
export type LibrarySelection =
  | { mode: 'edit'; itemId: string }
  | { mode: 'create' }
  | null;

const VIEWS: { id: LibraryManagerView; label: string; icon: IconName }[] = [
  { id: 'items', label: 'Items', icon: 'newspaper' },
  { id: 'suggestions', label: 'Suggestions', icon: 'inbox' },
];

export default function PrototypeExpandedLibraryManager({
  exiting,
  origin,
  onClose,
}: ExpandedSidebarToolProps) {
  const { activeChurchOrgId } = useProtoShell();
  const { orgId, plannableSpaces } = useChurchPlannerAccess(activeChurchOrgId);
  const { can } = useChurchStaffStatus(orgId);

  /* Browsing is `sermon_tools`; curating is `manage_library`. A teacher can
     open this and read the catalog without the buttons that change it. */
  const canBrowse = can('sermon_tools');
  const canCurate = can('manage_library');

  const [view, setView] = useState<LibraryManagerView>('items');
  const [selection, setSelection] = useState<LibrarySelection>(null);

  const manage = useChurchLibraryManage(orgId, { enabled: canBrowse });
  const items = useMemo(() => manage.data?.items ?? [], [manage.data]);

  const editingItem = useMemo<ChurchLibraryStaffItem | null>(() => {
    if (selection?.mode !== 'edit') return null;
    return items.find((i) => i.id === selection.itemId) ?? null;
  }, [selection, items]);

  const changeView = useCallback((next: LibraryManagerView) => {
    setView(next);
    setSelection(null);
  }, []);

  /*
    The unread count on the Suggestions chip.

    Same query the queue itself runs, so opening the panel costs one request and
    both surfaces read the same cache. Unread is "waiting, and staff have not
    looked" — which is a fact this codebase only started recording when the
    mark-read route below was added; before that `staffReadAt` was stamped by a
    review, so a count of nulls would have been the queue's own length.
  */
  const suggestionQueue = useLibrarySuggestionQueue(orgId, { enabled: canCurate });
  const unreadSuggestions = unreadLibrarySuggestionCount(suggestionQueue.data?.suggestions);
  const markRead = useMarkLibrarySuggestionsRead(orgId);

  /* Marked read when staff actually open the view, once per unread batch —
     not on mount, or the badge would clear itself for someone who never looked
     at it. */
  const markedRef = useRef(false);
  useEffect(() => {
    if (view !== 'suggestions') {
      markedRef.current = false;
      return;
    }
    if (markedRef.current || !canCurate || unreadSuggestions === 0) return;
    markedRef.current = true;
    markRead.mutate();
  }, [view, canCurate, unreadSuggestions, markRead]);

  const viewSwitcher = (
    <div
      className="proto-chip-bar proto-planner__views"
      role="radiogroup"
      aria-label="Library view"
    >
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
          {option.id === 'suggestions' && unreadSuggestions > 0 ? (
            <span className="proto-chip__badge" aria-label={`${unreadSuggestions} not yet read`}>
              {unreadSuggestions}
            </span>
          ) : null}
        </button>
      ))}
    </div>
  );

  return (
    <ProtoSidebarExpandedPanel
      label="Resource library"
      title="Resource library"
      toolbar={canBrowse ? viewSwitcher : undefined}
      actions={
        canCurate && view === 'items' ? (
          <button
            type="button"
            className="proto-glass-surface proto-glass-surface--control proto-glass-action"
            onClick={() => setSelection({ mode: 'create' })}
          >
            <Icon name="plus" size={12} aria-hidden />
            <span className="proto-glass-action__label">Add a resource</span>
          </button>
        ) : undefined
      }
      exiting={exiting}
      origin={origin}
      onClose={onClose}
    >
      {!canBrowse ? (
        <PrototypeListEmptyState
          iconName="user-shield"
          title="For church staff"
          description="Your church's shelf is curated by its staff."
        />
      ) : (
        <div className="proto-planner">
          <div className="proto-planner__main">
            {manage.isLoading ? (
              <ProtoSpaceLoading label="Loading library" />
            ) : view === 'items' ? (
              <PrototypeLibraryManagerItems
                items={items}
                canCurate={canCurate}
                plannableSpaces={plannableSpaces}
                selection={selection}
                onSelect={setSelection}
              />
            ) : (
              <PrototypeLibrarySuggestionQueue orgId={orgId} canReview={canCurate} />
            )}
          </div>

          {selection && canCurate ? (
            <PrototypeLibraryItemEditorPane
              orgId={orgId}
              item={editingItem}
              plannableSpaces={plannableSpaces}
              onClose={() => setSelection(null)}
            />
          ) : null}
        </div>
      )}
    </ProtoSidebarExpandedPanel>
  );
}
