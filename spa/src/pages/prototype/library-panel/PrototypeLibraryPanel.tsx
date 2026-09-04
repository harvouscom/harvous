/**
 * The Library panel — the browse surface that took over from the left sidebar.
 *
 * It morphs out of the toolbar's center chip: the chip names your context, and expanding
 * it shows you that context's contents. On desktop it is a centered panel hanging from
 * the toolbar; on mobile it is a full-height sheet, because a 880px centered panel on a
 * phone is just a worse sheet.
 *
 * Chrome behavior is deliberately the same bargain `ProtoSidebarExpandedPanel` struck,
 * and for the same reasons — a `region` rather than a dialog, no scrim, no focus trap,
 * Escape only when nothing inside claimed it, outside-mousedown to dismiss. Browsing is
 * something you dip into and out of while the note underneath stays mounted; a modal
 * would say "finish this and get out", which is the wrong posture for rediscovery.
 *
 * One structural difference from that panel: this one holds the space switcher in its
 * header. Switching space here re-scopes the panel rather than closing it (see the
 * `setLocation` rule in proto-shell-context), because the reader is steering this
 * surface, not leaving it.
 */
import { useEffect, useRef, type ReactNode } from 'react';
import Icon from '@/components/react/Icon';
import { useProtoShell } from '../../../layouts/proto-shell-context';
import { LIBRARY_PANEL_DOM_ID } from '../PrototypeLibraryChip';
import {
  LIBRARY_TAB_LABELS,
  libraryDrillKind,
  libraryDrillTitle,
  libraryPanelShowsBack,
  type LibraryPanelView,
} from './library-panel-view';
import { useLibraryPanelMorph } from './use-library-panel-morph';
import { useLibraryPanelKeys } from './use-library-panel-keys';

export default function PrototypeLibraryPanel({
  view,
  exiting,
  isMobile,
  onClose,
  onBackToRoot,
  /** Resolved name for drill views whose title comes from loaded data. */
  subject,
  search,
  tabs,
  selectBar,
  bulkBar,
  spaceSwitcher,
  children,
}: {
  view: LibraryPanelView;
  exiting: boolean;
  isMobile: boolean;
  onClose: () => void;
  onBackToRoot: () => void;
  subject?: string | null;
  search?: ReactNode;
  /** The tab row. Rendered between the header and the scrolling body. */
  tabs?: ReactNode;
  /**
   * Shown only while a selection stands, under the header and above the list.
   *
   * Its own slot rather than more header chrome: the header is the search field, and a mode
   * indicator tucked into that corner is exactly what made selecting unreadable twice.
   */
  selectBar?: ReactNode;
  /**
   * Actions for a standing selection, pinned under the body.
   *
   * Outside the scrolling body on purpose: what you can do with fifty selected notes must
   * not scroll away while you look at the fiftieth. That is the same place the sidebar's
   * bar holds, so the two surfaces put the answer in the same corner.
   */
  bulkBar?: ReactNode;
  spaceSwitcher?: ReactNode;
  children: ReactNode;
}) {
  /*
   * The morph owns the panel's ref, because it has to measure the element it animates.
   * Desktop only — the sheet slides on `translateY` and has nothing to FLIP onto.
   */
  const morph = useLibraryPanelMorph(!isMobile && !exiting, !isMobile && exiting);
  const panelRef = morph.ref;
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  useLibraryPanelKeys(bodyRef);

  /* Focus moves in once on mount and back to the opener — the chip — on close. Not a
     trap: the toolbar and the note underneath stay reachable by keyboard. */
  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return undefined;
    const active = document.activeElement;
    restoreFocusRef.current = active instanceof HTMLElement ? active : null;
    /*
     * Only if nothing inside already claimed it. React runs child effects before the
     * parent's, so the search field's `autoFocus` has already landed by the time this
     * runs — and focusing the container here would take it straight back off the field
     * the reader is meant to be typing in.
     */
    if (!panel.contains(document.activeElement)) panel.focus({ preventScroll: true });
    return () => {
      const restore = restoreFocusRef.current;
      if (restore?.isConnected) restore.focus({ preventScroll: true });
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      /* The search field, inner menus and confirm dialogs consume Escape first —
         closing the whole panel out from under an open menu loses the reader's place. */
      if (event.defaultPrevented) return;
      event.preventDefault();
      onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  /*
    `mousedown`, matching usePopoverDismiss and the expanded panel: a `click` listener
    fires after the button under the cursor has already acted, so closing on click would
    let a stray press land on the note underneath on its way out.
  */
  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      const panel = panelRef.current;
      if (!panel || !(event.target instanceof Node)) return;
      if (panel.contains(event.target)) return;
      /* Portaled children — the space switcher's menu, row menus, confirm dialogs — are
         outside the panel in the DOM but inside it to the reader. */
      if (
        event.target instanceof Element &&
        event.target.closest(
          '[role="menu"], [role="dialog"], .proto-menu__popover, .proto-popover-shell',
        )
      ) {
        return;
      }
      onClose();
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [onClose]);

  /*
   * Null at a bare tab. The surface has no title of its own — the search field is its
   * identity — so the header only speaks once you have drilled into something specific
   * enough to need naming.
   */
  const title = libraryDrillTitle(view, subject);
  const showsBack = libraryPanelShowsBack(view);
  const drillKind = libraryDrillKind(view);
  /* The tab is where you came from, so it is what "back" is named after. */
  const backLabel = LIBRARY_TAB_LABELS[view.tab] ?? 'search';
  const base = isMobile ? 'proto-library-sheet' : 'proto-library-panel';

  return (
    <div
      ref={panelRef}
      id={LIBRARY_PANEL_DOM_ID}
      className={[
        base,
        exiting ? `${base}--exiting` : '',
        /* Gates the content's delayed fade and the row stagger — both wait for the
           opening frame to be released, so they play over the move rather than under it. */
        !isMobile && morph.settled ? 'proto-library-panel--settled' : '',
        isMobile ? 'proto-library-panel--settled' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      role="region"
      aria-label="Library"
      tabIndex={-1}
    >
      <div className="proto-library-panel__header">
        <div className="proto-library-panel__header-lead">
          <button
            type="button"
            className="proto-side-panel__action-btn"
            title="Close"
            aria-label="Close search"
            onClick={onClose}
          >
            <Icon name="down-left-and-up-right-to-center" size={14} />
          </button>
        </div>
        {/* Always rendered, even when empty — the header is a three-column grid, and
            dropping an empty cell would collapse the track and slide search off centre. */}
        <div className="proto-library-panel__search">{search}</div>
        {/* The kind picker sits in the row with the field: what you are looking through,
            beside what you are looking for. */}
        <div className="proto-library-panel__actions">
          {tabs}
          {spaceSwitcher}
        </div>
      </div>
      {/*
        * Where you are, and the way back out of it — the sidebar's own back row, borrowed
        * whole rather than restyled to look like it. A tile you press to leave, then the
        * name with its kind beneath: the tile is the target, the name is a heading and not
        * a second control wearing the same job.
        *
        * Its own row rather than the header's lead, because the header's lead now holds
        * only the collapse control and the row has to be able to say two lines.
        */}
      {showsBack ? (
        <div className="proto-sidebar-back-row proto-library-panel__back">
          <button
            type="button"
            className="proto-sidebar-back-tile"
            onClick={onBackToRoot}
            aria-label={`Back to ${backLabel}`}
          >
            <Icon name="caret-left" size={16} aria-hidden />
          </button>
          <div className="proto-sidebar-back-row__meta">
            <span className="pds-list-title proto-sidebar-back-row__label">{title}</span>
            {drillKind ? (
              <p className="proto-caption proto-sidebar-back-row__kind">{drillKind}</p>
            ) : null}
          </div>
        </div>
      ) : null}
      {selectBar}
      <div ref={bodyRef} className="proto-library-panel__body">
        {children}
      </div>
      {bulkBar}
    </div>
  );
}

/**
 * Mounts the panel from the shell, so callers only have to open it.
 *
 * Kept separate from the panel itself because the mount condition (open *or* exiting) is
 * shell state, and the panel should not have to know it is being kept alive for an
 * animation it is not running.
 */
export function usePrototypeLibraryPanelMount(): {
  mounted: boolean;
  view: LibraryPanelView;
  exiting: boolean;
} {
  const { libraryPanelView, libraryPanelExiting } = useProtoShell();
  return {
    mounted: Boolean(libraryPanelView) || libraryPanelExiting,
    /* During the exit morph the view is still set; the fallback only covers the frame
       after the timer clears it, where `mounted` is already false. */
    view: libraryPanelView ?? { tab: 'all', drill: null },
    exiting: libraryPanelExiting,
  };
}
