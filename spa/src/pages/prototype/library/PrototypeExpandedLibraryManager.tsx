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
import { useCallback, useMemo, useState } from 'react';
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
