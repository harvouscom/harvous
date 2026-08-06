/**
 * The catalog, at a width where an item's audience and rooms fit on its row.
 *
 * That is the whole reason this is not the sidebar list: a curator's question
 * is "who can see this, and where does it show up", and answering it in 304px
 * meant hiding it behind a tap.
 */
import Icon from '@/components/react/Icon';
import { resourceSourceLabel } from '@/utils/resource-source-label';
import type { PlannableSpace } from '../../../hooks/useChurchPlannerAccess';
import type { ChurchLibraryStaffItem } from '../../../hooks/queries/useChurchLibrary';
import PrototypeListEmptyState from '../PrototypeListEmptyState';
import type { LibrarySelection } from './PrototypeExpandedLibraryManager';

/** "Whole church", or the rooms it is scoped to, in the church's own words. */
function scopeLabel(item: ChurchLibraryStaffItem, spaces: PlannableSpace[]): string {
  const spaceScopes = item.scopes.filter((s) => s.scopeKind === 'space' && s.spaceId);
  if (item.scopes.length === 0 || item.scopes.some((s) => s.scopeKind === 'org')) {
    return 'Whole church';
  }
  const names = spaceScopes
    .map((s) => spaces.find((sp) => sp.id === s.spaceId)?.title)
    .filter((t): t is string => Boolean(t));
  if (names.length === 0) return 'No rooms yet';
  if (names.length <= 2) return names.join(' · ');
  return `${names[0]} · ${names[1]} +${names.length - 2}`;
}

export default function PrototypeLibraryManagerItems({
  items,
  canCurate,
  plannableSpaces,
  selection,
  onSelect,
}: {
  items: ChurchLibraryStaffItem[];
  canCurate: boolean;
  plannableSpaces: PlannableSpace[];
  selection: LibrarySelection;
  onSelect: (selection: LibrarySelection) => void;
}) {
  /*
    The full empty state, not the one-line caption the other panes use. This is
    a whole panel of blank space — a sentence pinned to the top-left of it read
    as a stray label rather than the state of the shelf. `proto-list-empty-state`
    is `flex: 1 0 auto` and centres its own children, so as the only child of
    the column it fills the body and lands in the middle of it.

    Same icon and voice as the sidebar's own library list: one shelf, seen at
    two widths, should not introduce itself twice.
  */
  if (items.length === 0) {
    return (
      <PrototypeListEmptyState
        iconName="newspaper"
        title="No Resources"
        description={
          canCurate
            ? 'Add the commentary, handout, or talk your church keeps coming back to.'
            : 'Your church has not added any resources yet.'
        }
      />
    );
  }

  return (
    <div className="proto-planner-list">
      <div className="proto-glass-surface proto-glass-surface--panel proto-church-tools">
        {items.map((item) => {
          const subtitle = resourceSourceLabel(item.sourceDomain, item.sourceSiteName);
          const selected = selection?.mode === 'edit' && selection.itemId === item.id;
          return (
            <button
              key={item.id}
              type="button"
              className={[
                'proto-church-tools__row',
                'proto-planner-list__row',
                selected ? 'proto-planner-list__row--selected' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              /* A teacher browsing opens the link; a curator opens the editor.
                 Same row, different job, decided by what they may do. */
              onClick={() => {
                if (canCurate) onSelect({ mode: 'edit', itemId: item.id });
                else if (item.sourceUrl) window.open(item.sourceUrl, '_blank', 'noopener');
              }}
            >
              <span className="proto-church-tools__row-icon" aria-hidden>
                <Icon name="newspaper" size={13} />
              </span>
              <span className="proto-church-tools__row-text">
                <span
                  className="pds-list-title proto-church-tools__row-title proto-marquee"
                  title={item.title}
                >
                  <span>{item.title}</span>
                </span>
                <span className="proto-caption proto-church-tools__row-meta proto-marquee-self">
                  {subtitle ? `${subtitle} · ` : ''}
                  {scopeLabel(item, plannableSpaces)}
                  {/* Audience only when it narrows — "Members" on every row
                      would be noise on the default. */}
                  {item.access === 'leaders' ? ' · Leaders only' : ''}
                </span>
              </span>
              <span className="proto-church-tools__row-chevron" aria-hidden>
                <Icon name={canCurate ? 'caret-right' : 'arrow-up-right-from-square'} size={11} />
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
