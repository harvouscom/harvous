/**
 * Type and sort for a resource shelf, folded into one button at the end of the shelf switch.
 *
 * Two menus on a row of their own cost the list a band of chrome above every row; the switch
 * already owns that row, and the narrow column has room for exactly one more square. A dot
 * on the button says something other than "everything, most recent first" is in force, so a
 * filtered shelf never looks like a short one.
 *
 * Picks keep the menu open — type and sort are often set together, and a menu that closes
 * after each would be two trips.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Icon from '@/components/react/Icon';
import ProtoPopoverShell from '../ProtoPopoverShell';
import { computeRightAnchoredPopoverPosition } from '../proto-popover-position';
import { PROTO_TOOLBAR_ICON_SIZE, PROTO_TOOLBAR_POPOVER_OFFSET } from '../proto-toolbar-tokens';
import {
  RESOURCE_SORT_OPTIONS,
  resourceTypeIcon,
  resourceTypeNoun,
  type ResourceSort,
  type ResourceType,
} from './resource-type-display';

const POPOVER_WIDTH = 220;
const POPOVER_FALLBACK_HEIGHT = 360;

export default function ResourceFilterMenu({
  types,
  typeFilter,
  onTypeFilter,
  sort,
  onSort,
}: {
  /** The types this shelf has — the only ones worth offering. */
  types: readonly ResourceType[];
  typeFilter: ResourceType | 'all';
  onTypeFilter: (type: ResourceType | 'all') => void;
  sort: ResourceSort;
  onSort: (sort: ResourceSort) => void;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const changed = typeFilter !== 'all' || sort !== 'recent';

  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return undefined;
    }
    const update = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const measured = popoverRef.current?.getBoundingClientRect();
      const next = computeRightAnchoredPopoverPosition(
        rect,
        measured?.width || POPOVER_WIDTH,
        measured?.height || POPOVER_FALLBACK_HEIGHT,
        PROTO_TOOLBAR_POPOVER_OFFSET,
      );
      setPos({ top: next.top, left: next.left });
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target) || popoverRef.current?.contains(target)) return;
      setOpen(false);
    };
    /* Capture, and claimed: the expanded tool closes itself on an unclaimed Escape, and the
       press was meant for this menu. */
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown, true);
    };
  }, [open]);

  const radio = (key: string, checked: boolean, label: string, onPick: () => void, icon?: ResourceType) => (
    <button
      key={key}
      type="button"
      role="menuitemradio"
      aria-checked={checked}
      className="proto-menu-item"
      onClick={onPick}
    >
      <span className="proto-menu-item__icon" aria-hidden>
        {icon ? <Icon name={resourceTypeIcon(icon)} size={PROTO_TOOLBAR_ICON_SIZE} /> : null}
      </span>
      <span className="proto-menu-item__label">{label}</span>
      {checked ? (
        <span className="proto-menu-item__check" aria-hidden>
          <Icon name="check" size={12} />
        </span>
      ) : null}
    </button>
  );

  const label = changed ? 'Filter and sort (changed)' : 'Filter and sort';

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="proto-resource-filter-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        title="Filter and sort"
        data-changed={changed ? 'true' : undefined}
        onClick={() => setOpen((x) => !x)}
      >
        <Icon name="sliders" size={13} />
        {changed ? <span className="proto-resource-filter-btn__dot" aria-hidden /> : null}
      </button>
      {open && typeof document !== 'undefined'
        ? createPortal(
            <ProtoPopoverShell
              ref={popoverRef}
              className="proto-menu__popover proto-resource-filter-menu"
              role="menu"
              aria-label="Filter and sort"
              style={{ top: pos?.top ?? -9999, left: pos?.left ?? 0, width: POPOVER_WIDTH }}
            >
              {types.length > 1 || typeFilter !== 'all' ? (
                <div className="proto-menu-section" role="group" aria-label="Type">
                  <div className="proto-menu-section-label">Type</div>
                  {radio('all', typeFilter === 'all', 'All types', () => onTypeFilter('all'))}
                  {types.map((type) =>
                    radio(type, typeFilter === type, resourceTypeNoun(type), () => onTypeFilter(type), type),
                  )}
                </div>
              ) : null}
              <div className="proto-menu-section" role="group" aria-label="Sort">
                <div className="proto-menu-section-label">Sort</div>
                {RESOURCE_SORT_OPTIONS.map((option) =>
                  radio(option.value, sort === option.value, option.label, () => onSort(option.value)),
                )}
              </div>
            </ProtoPopoverShell>,
            document.body,
          )
        : null}
    </>
  );
}
