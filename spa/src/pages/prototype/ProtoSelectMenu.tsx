/**
 * The prototype's choice control — a trigger that opens a menu of options.
 *
 * **Use this instead of a native `<select>`.** Harvous does not use OS select
 * chrome anywhere a user actually chooses something: the space switcher, the
 * list-view picker, the note row menu and the planner's scope chips are all a
 * button plus a portaled `ProtoPopoverShell` of `menuitemradio` rows with a
 * tick on the current one. A `<select>` renders the platform's popup, which
 * matches none of it — different type, different radius, different selected
 * state, and on macOS a different font entirely.
 *
 * It exists because that pattern had been hand-rolled four times over, which
 * is exactly how a fifth call site reaches for the native element instead: the
 * convention was real but there was nothing to import.
 *
 * Portaled and fixed-positioned like its siblings, so an ancestor with
 * `overflow: hidden` — every sheet and rail in this app — cannot clip it.
 */
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import Icon from '@/components/react/Icon';
import ProtoPopoverShell from './ProtoPopoverShell';
import { computeRightAnchoredPopoverPosition } from './proto-popover-position';
import { PROTO_MENU_CHECK_ICON_SIZE } from './proto-toolbar-tokens';

const FALLBACK_WIDTH = 220;
const FALLBACK_HEIGHT = 240;
const OFFSET = 6;

export type ProtoSelectOption<T extends string | number> = {
  value: T;
  label: string;
  /**
   * What the trigger reads when this option is chosen, when that differs from its row.
   * A menu may abbreviate to fit — the thing you picked should still say its own name.
   */
  triggerLabel?: string;
  /**
   * Optional heading this option sits under. Consecutive options sharing a group render
   * beneath one sticky label — for lists long enough that "which part am I in" is a real
   * question. Omit it and the menu is a flat list exactly as before.
   */
  group?: string;
  /**
   * A mark shown before the label — a space's colour tile, a house, a glyph.
   *
   * For menus whose rows are *places* rather than settings: the note destination picker
   * proved that a coloured tile is how someone finds their own space in a list, well before
   * they have read its name. Omit it and rows are label-only exactly as before.
   */
  icon?: ReactNode;
};

/**
 * Past this many rows, scanning beats reading — the note destination picker's threshold,
 * shared so two menus of the same spaces do not disagree about when a list got long.
 */
export const PROTO_SELECT_FILTER_THRESHOLD = 5;

export default function ProtoSelectMenu<T extends string | number>({
  value,
  options,
  onChange,
  label,
  disabled,
  className,
  menuWidth,
  menuClassName,
  footer,
  groupsAsTabs = false,
  filterPlaceholder,
}: {
  value: T;
  options: ProtoSelectOption<T>[];
  onChange: (value: T) => void;
  /** Accessible name for the trigger — what is being chosen. */
  label: string;
  disabled?: boolean;
  /** Extra class on the trigger, for callers that need their own width. */
  className?: string;
  menuWidth?: number;
  /** Extra class on the popover, for callers whose options are not a list of labels. */
  menuClassName?: string;
  /**
   * Rendered as its own section under the options.
   *
   * For a verb that belongs *with* a picker without being one of its answers — the library
   * panel's "Select multiple folders" sits under the kind list the way the sidebar's
   * `ListViewMenu` puts "Select Threads" under its view modes. Its own section rather than an
   * extra option, because an option would read as a seventh kind rather than as a mode you
   * enter, and picking it would leave the trigger claiming it as the current value.
   *
   * Takes the close handle rather than a plain node: a footer action is still a choice made
   * in this menu, and leaving it open afterwards would be the one row here that does not
   * behave like the rest.
   */
  footer?: (close: () => void) => ReactNode;
  /**
   * Render the groups as a segmented control showing one at a time, rather than as headings
   * down a single scroll. For a list where the groups partition it evenly and you always know
   * which half you want — the testaments — two taps beat scrolling past the other thirty.
   */
  groupsAsTabs?: boolean;
  /**
   * Offer a filter field once the list passes `PROTO_SELECT_FILTER_THRESHOLD`.
   *
   * Placeholder doubles as the opt-in: a menu of five settings does not want a search box,
   * and a menu of twenty spaces is unusable without one.
   */
  filterPlaceholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const filterInputRef = useRef<HTMLInputElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const selectedRef = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const menuId = useId();

  const selected = options.find((option) => option.value === value) ?? options[0];
  const width = menuWidth ?? FALLBACK_WIDTH;

  /*
   * Filtering happens before grouping, so a heading whose rows all filtered out goes with
   * them rather than sitting over an empty run.
   */
  const showFilter = Boolean(filterPlaceholder) && options.length > PROTO_SELECT_FILTER_THRESHOLD;
  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!showFilter || !q) return options;
    return options.filter((option) => option.label.toLowerCase().includes(q));
  }, [filter, options, showFilter]);

  const sections = useMemo(() => groupOptions(filtered), [filtered]);
  /*
   * Opens on the tab holding the current value, so the book you are in is on screen rather
   * than one tap away. Re-keyed on that value, not held in state across opens: reopening the
   * picker in Romans should show the New Testament even if you last browsed the Old.
   */
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const defaultTab = selected?.group ?? sections[0]?.label ?? null;
  const currentTab = activeTab ?? defaultTab;
  const visibleSections =
    groupsAsTabs && currentTab ? sections.filter((s) => s.label === currentTab) : sections;

  /*
   * Layout, not passive: `pos` is null on the first render, so an effect that runs after paint
   * shows one frame of the menu parked at -9999 before it lands. Measuring before the browser
   * paints means it is only ever drawn where it belongs.
   */
  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      setActiveTab(null);
      setFilter('');
      return undefined;
    }
    const update = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;

      /*
       * Once the trigger has left the viewport, close rather than follow. The positioner
       * clamps a menu that would land off-screen to the top margin, so chasing a trigger out
       * of view does not keep them together — it detaches the menu and slides it up the page
       * on its own, which is what scrolling the reader behind an open book picker looked
       * like. A menu whose trigger you can no longer see has nothing left to be anchored to.
       */
      if (rect.bottom <= 0 || rect.top >= window.innerHeight) {
        setOpen(false);
        return;
      }

      /*
       * `offsetWidth`/`offsetHeight`, not `getBoundingClientRect()`.
       *
       * The menu animates in under `proto-menu-pop-in`, which scales it. A client rect reports
       * the *visually transformed* box, so measuring during those frames read 263.8px for a
       * menu that is 272px, and `left = anchor.right - width` came out 8px too far right. The
       * ResizeObserver could not save it either: a transform does not change the layout box,
       * so it never fired, and the wrong position stuck until some later scroll or tab switch
       * recomputed it — which is exactly what the sideways jump was.
       *
       * The offset properties report the layout box and ignore transforms, so every observer
       * agrees and the position is right on the first frame.
       */
      const el = popoverRef.current;
      const next = computeRightAnchoredPopoverPosition(
        rect,
        el?.offsetWidth || width,
        el?.offsetHeight || FALLBACK_HEIGHT,
        OFFSET,
      );
      // Scroll fires per frame; re-rendering on an unchanged position is pure churn.
      setPos((prev) =>
        prev && prev.top === next.top && prev.left === next.left
          ? prev
          : { top: next.top, left: next.left },
      );
    };
    update();

    /*
     * Open where you already are. A 66-book list that always starts at Genesis makes the
     * reader scroll to find the chapter they are currently in before they can leave it —
     * the one place in the list they did not need to be shown. `block: 'center'` rather
     * than 'nearest' so the neighbours either side come with it, which is what makes the
     * position legible as a position.
     */
    selectedRef.current?.scrollIntoView({ block: 'center' });

    /*
     * Reposition when the menu's own box changes, not only when the window moves.
     *
     * `left` is derived from the measured width, so a width that settles *after* the first
     * measurement — a late font, a scrollbar, the viewport clamp — left the menu at a stale
     * left edge with nothing scheduled to correct it. The correction then rode in on the
     * first scroll event, which is why the menu appeared to jump sideways the moment you
     * started scrolling it. Observing the box applies it at open instead, where it is
     * invisible.
     */
    const observer = new ResizeObserver(update);
    if (popoverRef.current) observer.observe(popoverRef.current);

    /* Capture-phase: these open inside scrolling sheets, and a menu that stays
       put while its trigger slides away points at nothing. */
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [open, width]);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (popoverRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      /* Claimed here so the sheet or panel around it stays open — Escape means
         "close this menu", not "abandon what I was editing". */
      event.preventDefault();
      event.stopPropagation();
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

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={`proto-select-menu__trigger${className ? ` ${className}` : ''}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        disabled={disabled}
        onClick={() => setOpen((x) => !x)}
      >
        <span className="proto-select-menu__value">
          {selected?.triggerLabel ?? selected?.label ?? ''}
        </span>
        <Icon name={open ? 'caret-up' : 'caret-down'} size={9} aria-hidden />
      </button>

      {open && typeof document !== 'undefined'
        ? createPortal(
            <ProtoPopoverShell
              ref={popoverRef}
              id={menuId}
              className={`proto-menu__popover proto-menu__popover--list-view proto-select-menu__popover${menuClassName ? ` ${menuClassName}` : ''}`}
              role="menu"
              aria-label={label}
              style={{
                position: 'fixed',
                top: pos?.top ?? -9999,
                left: pos?.left ?? 0,
                width,
                zIndex: 6000,
              }}
            >
              {showFilter ? (
                <div className="proto-note-destination__filter">
                  <input
                    ref={filterInputRef}
                    type="search"
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                    placeholder={filterPlaceholder}
                    aria-label={filterPlaceholder}
                    /* The menu is already focused for keyboard nav; typing should reach the
                       field without a tab, the way the destination picker's does. */
                    autoFocus
                  />
                  {/*
                    The app's own clear, not the platform's. A bare `type="search"` renders
                    WebKit's cancel button, which is a blue glyph of its own size and shape
                    sitting inside a surface that draws every other control itself — see the
                    `::-webkit-search-cancel-button` reset this field now shares with the
                    sidebar's field. Focus goes back to the input, because clearing a filter
                    is something you do in order to type again.
                  */}
                  {filter ? (
                    <button
                      type="button"
                      className="proto-sidebar-search__clear"
                      aria-label="Clear filter"
                      onClick={() => {
                        setFilter('');
                        filterInputRef.current?.focus();
                      }}
                    >
                      <Icon name="circle-xmark" size={15} aria-hidden />
                    </button>
                  ) : null}
                </div>
              ) : null}
              {showFilter && filtered.length === 0 ? (
                <p className="proto-note-destination__hint">No spaces match your search.</p>
              ) : null}
              {groupsAsTabs && sections.length > 1 ? (
                <div className="proto-menu-tabs" role="tablist" aria-label={`${label} sections`}>
                  {sections.map((section) => (
                    <button
                      key={section.label ?? ''}
                      type="button"
                      role="tab"
                      aria-selected={section.label === currentTab}
                      className="proto-menu-tab"
                      onClick={() => setActiveTab(section.label)}
                    >
                      {section.label}
                    </button>
                  ))}
                </div>
              ) : null}
              {visibleSections.map((section) => (
                <div
                  key={section.label ?? '__ungrouped__'}
                  className="proto-menu-section"
                  role="group"
                  aria-label={section.label ?? undefined}
                >
                  {section.label && !groupsAsTabs ? (
                    <div className="proto-menu-section-label proto-menu-section-label--sticky">
                      {section.label}
                    </div>
                  ) : null}
                  {section.options.map((option) => {
                    const checked = option.value === value;
                    return (
                      <button
                        key={String(option.value)}
                        ref={checked ? selectedRef : undefined}
                        type="button"
                        role="menuitemradio"
                        aria-checked={checked}
                        className="proto-menu-item"
                        onClick={() => {
                          onChange(option.value);
                          setOpen(false);
                          triggerRef.current?.focus();
                        }}
                      >
                        {option.icon ? (
                          <span className="proto-menu-item__icon" aria-hidden>
                            {option.icon}
                          </span>
                        ) : null}
                        <span className="proto-menu-item__label">{option.label}</span>
                        <span className="proto-menu-item__check" aria-hidden>
                          {checked ? <Icon name="check" size={PROTO_MENU_CHECK_ICON_SIZE} /> : null}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ))}
              {footer?.(() => setOpen(false))}
            </ProtoPopoverShell>,
            document.body,
          )
        : null}
    </>
  );
}

/**
 * Split options into consecutive runs sharing a group label.
 *
 * Runs, not a keyed bucket: the order the caller gave is the order that matters — for books
 * that is the canon — and grouping by key would quietly reorder it. A list with no groups
 * comes back as one unlabelled section, which renders exactly as the flat list it was.
 */
function groupOptions<T extends string | number>(
  options: ProtoSelectOption<T>[],
): { label: string | null; options: ProtoSelectOption<T>[] }[] {
  const sections: { label: string | null; options: ProtoSelectOption<T>[] }[] = [];
  for (const option of options) {
    const label = option.group ?? null;
    const current = sections[sections.length - 1];
    if (current && current.label === label) current.options.push(option);
    else sections.push({ label, options: [option] });
  }
  return sections;
}
