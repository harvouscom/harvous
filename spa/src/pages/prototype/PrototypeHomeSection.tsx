/**
 * A group on Home: a quiet heading over one glass panel of hairline-separated rows.
 *
 * The church hub's Tools shape, shared. It used to live inside `PrototypeSidebarHomeView`
 * while the shared-space view hand-rolled the same three lines beside it — which is how the
 * two drifted apart in the first place, one on rows and one still on cards.
 *
 * The `proto-home-section__list` class stays on the panel because the empty-group rule keys
 * off it: a section whose children all render null should collapse rather than leave a
 * heading over an empty box. `proto-home-cascade` is the separate opt-in that makes the rows
 * arrive in sequence — separate because the shared space and church hub build their panels
 * their own way and need the cascade without inheriting the empty-group behaviour.
 */
import { useCallback, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import Icon from '@/components/react/Icon';
import { scrollCollapsedSectionIntoView } from '../../lib/proto-collapse-scroll';

/** Marks the toggle so the row count never includes the control that reports it. */
const TOGGLE_ATTR = 'data-fold-toggle';

/** Applied by the effect below to each row past the fold. */
const FOLDED_ROW_CLASS = 'proto-home-section__row--folded';

export default function PrototypeHomeSection({
  title,
  children,
  spotlight,
  foldAfter,
}: {
  title: string;
  children: ReactNode;
  /** Name this section as a spotlight target, so a checklist row can point at it. */
  spotlight?: string;
  /**
   * Show this many rows, then a "N more" bar that expands and collapses.
   *
   * Counted from the **rendered DOM**, not from `children`, and that is the whole
   * reason this is not a `.slice()`. A section's children are heterogeneous JSX
   * that each decide their own visibility — the strengthen-a-Thread row from its
   * own queries, the import row from a dismissal, the daily passage from whether
   * there is one — so React child position says nothing about how many rows a
   * reader actually sees. Slicing children would fold away a row that was never
   * there and leave "3 more" over a list with nothing hidden under it.
   *
   * It is the same reasoning the section's own empty-group rule already follows:
   * ask the DOM afterwards rather than keep a list of every child's condition in
   * sync with the children.
   */
  foldAfter?: number;
}) {
  const sectionRef = useRef<HTMLElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [rowCount, setRowCount] = useState(0);

  /*
   * Re-measure, and put the fold class where it belongs.
   *
   * A layout effect rather than `useEffect` so the rows are hidden in the same
   * frame they mount — an effect would paint all nine and then blink six away.
   * The MutationObserver is not belt-and-braces: rows on this surface arrive late
   * and on their own schedule (Review's queries, the Thread suggestion's), so a
   * measurement taken only when *this* component re-renders would miss them.
   */
  const applyFold = useCallback(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const rows = [...panel.children].filter((el) => !el.hasAttribute(TOGGLE_ATTR));
    /* Only when it moved. The observer fires for every childList change on this
       panel, and setting the same count would re-run the effect that created the
       observer — a loop React happens to damp rather than one worth relying on. */
    setRowCount((previous) => (previous === rows.length ? previous : rows.length));
    rows.forEach((el, index) => {
      const hide = foldAfter !== undefined && !expanded && index >= foldAfter;
      el.classList.toggle(FOLDED_ROW_CLASS, hide);
    });
  }, [foldAfter, expanded]);

  useLayoutEffect(() => {
    if (foldAfter === undefined) return;
    applyFold();
    const panel = panelRef.current;
    if (!panel) return;
    const observer = new MutationObserver(applyFold);
    observer.observe(panel, { childList: true });
    return () => observer.disconnect();
  }, [applyFold, foldAfter, children]);

  const folded = foldAfter === undefined ? 0 : Math.max(0, rowCount - foldAfter);
  /* Once open, the bar has to stay to close it again — `folded` is 0 while expanded. */
  const showToggle = foldAfter !== undefined && (folded > 0 || expanded);

  return (
    <section
      ref={sectionRef}
      className="proto-home-section proto-home-section--group"
      data-proto-spotlight={spotlight}
    >
      <p className="proto-caption proto-home-section__eyebrow">{title}</p>
      <div
        ref={panelRef}
        className="proto-glass-surface proto-glass-surface--panel proto-list-panel proto-home-section__list proto-home-cascade"
      >
        {children}
        {showToggle ? (
          /* `proto-feed-part__more` on purpose: `PrototypeReviewSection` already
             draws its own fold with this class inside a `proto-home-section__list`
             two sections up the same page, so borrowing it is what makes the two
             bars identical rather than merely similar. */
          <button
            type="button"
            className="proto-feed-part__more"
            {...{ [TOGGLE_ATTR]: '' }}
            aria-expanded={expanded}
            /* The scroll sits outside the updater on purpose: an updater must be
               pure, and StrictMode calls it twice — which would queue the scroll
               twice too. `expanded` is already the right answer at click time. */
            onClick={() => {
              if (expanded) scrollCollapsedSectionIntoView(sectionRef.current);
              setExpanded((open) => !open);
            }}
          >
            <span>{expanded ? 'See less' : `${folded} more`}</span>
            <Icon name={expanded ? 'caret-up' : 'caret-down'} size={10} />
          </button>
        ) : null}
      </div>
    </section>
  );
}
