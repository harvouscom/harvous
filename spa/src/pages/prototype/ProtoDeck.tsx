/**
 * A deck on Home: one card in front, the rest stacked behind it, cycled with ‹ › or a swipe.
 *
 * Home used to be a column of sections — passage, Continue, Review, Following, Suggested — each a
 * heading over a panel of rows, and on a busy account the day's own record started two screens
 * down. A deck holds the same rows in the height of one: the card in front is the live one, and
 * the edges peeking under it say there is more without spelling it out. The shape is the one the
 * marketing site has always drawn Review as (`AppActivity.astro`'s `.aact__deck`).
 *
 * **Every element child is one card, counted from the DOM after it renders.** The sources that
 * fill a deck decide their own visibility — This Sunday from its own query, a recall prompt from
 * a snooze, the reading plan from whether there is one — and some return a fragment of several
 * rows. A deck that counted React children would count cards nobody can see; one that asked each
 * source for a card model would mean rebuilding ten components that own their own state. So it
 * does what `PrototypeHomeSection`'s fold did: render everything, then look. A source returning
 * null adds no card; a portal (a sheet, a menu) lands in `document.body` and adds none either.
 *
 * Inactive cards are hidden by **attribute**, never by class: React rewrites `className` whenever
 * a row re-renders, and would quietly un-hide a card. It leaves attributes it did not set alone.
 * `inert` keeps them out of the tab order and the accessibility tree as well as out of sight.
 *
 * **Expanding instead of paging** (`expand`): the edge under the card is a tab that says how
 * many more there are, and opens the deck into a plain list of every card — the same move as the
 * callout stack in the window's corner. No "‹ 2 of 5 ›": a list you can see all of beats a
 * counter you have to step through, and Home's decks are short.
 *
 * The active card is followed by identity, not position. When the card in front goes — a recall
 * prompt snoozed, a checklist step done — the deck stays where it was rather than jumping back to
 * the first card, and a card that moves within the deck stays in front.
 */
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  type MouseEvent,
} from 'react';
import { createPortal } from 'react-dom';
import Icon from '@/components/react/Icon';

/** How far a finger has to travel sideways before a drag counts as a swipe. */
export const DECK_SWIPE_PX = 40;

/** The event a caller dispatches (bubbling) from inside a card to bring that card to the front. */
export const DECK_SHOW_EVENT = 'proto-deck:show';

/** What a card is called by whoever listens: its own `data-deck-id`, or the first one inside it. */
function deckIdOf(card: Element): string | null {
  return card.getAttribute('data-deck-id') ?? card.querySelector('[data-deck-id]')?.getAttribute('data-deck-id') ?? null;
}

const FOCUSABLE = 'button:not(:disabled), a[href], input, textarea, select, [tabindex]:not([tabindex="-1"])';

function firstFocusable(card: Element): HTMLElement | null {
  if (card.matches(FOCUSABLE)) return card as HTMLElement;
  return card.querySelector<HTMLElement>(FOCUSABLE);
}

/** Keys typed into a field, or moving through an open menu, are not the deck's to take. */
function keyBelongsElsewhere(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  if (target.closest('input, textarea, select, [contenteditable="true"], [role="menu"], [role="listbox"]')) {
    return true;
  }
  return false;
}

export default function ProtoDeck({
  label,
  children,
  footer,
  counter = true,
  peek,
  spotlight,
  className,
  onActiveChange,
  pager = 'inline',
  pagerSlot,
  expand = false,
}: {
  /** The eyebrow over the deck, and its accessible name. */
  label: string;
  children: ReactNode;
  /** Inside the card, under the pager, never counted as a card: a fold, a quiet offer. */
  footer?: ReactNode;
  /** The "2 of 5" pager. Off for a deck whose one card already says how far along you are. */
  counter?: boolean;
  /**
   * How many edges peek under the card. Defaults to what is actually behind it (at most two);
   * a caller whose stack is deeper than its cards — Review's one card over a sitting of eight —
   * passes its own.
   */
  peek?: 0 | 1 | 2;
  /** Name the deck as a spotlight target, so a checklist row can point at it. */
  spotlight?: string;
  /**
   * Where "‹ 2 of 5 ›" sits. `inline` (the default) puts it at the right of a one-row card, in
   * the row chevron's place, so a deck of rows is one row tall rather than a row and a pager
   * line. `foot` keeps it under the card, for a deck whose cards are tall (the Review sample).
   */
  pager?: 'inline' | 'foot';
  /**
   * Somewhere else to put the pager — Home's tab row, beside the tabs — portaled there. Null
   * shows no pager at all (a deck behind a tab that is not showing). Left undefined, the pager
   * sits in the card as `pager` says.
   */
  pagerSlot?: HTMLElement | null;
  className?: string;
  /**
   * Open into a list of every card from a "N more" tab under the card, instead of paging with
   * ‹ ›. Takes the place of the pager and the peeking edges.
   */
  expand?: boolean;
  /** Which card is in front, by `data-deck-id`, each time that changes. */
  onActiveChange?: (deckId: string | null) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<Element | null>(null);
  const activeIdRef = useRef<string | null>(null);
  const indexRef = useRef(0);
  const swallowClickRef = useRef(false);
  const swipeRef = useRef<{ x: number; y: number; id: number } | null>(null);
  const reportedRef = useRef<string | null | undefined>(undefined);
  const onActiveChangeRef = useRef(onActiveChange);
  onActiveChangeRef.current = onActiveChange;

  const [count, setCount] = useState(0);
  const [index, setIndex] = useState(0);
  const [open, setOpen] = useState(false);
  const openRef = useRef(false);
  openRef.current = expand && open;

  /*
   * Re-read the cards and put the attributes where they belong.
   *
   * Called after every render and whenever the track's children change underneath us. It only
   * writes attributes on the children and never touches the child list, so the observer that
   * calls it is not woken by it.
   */
  const apply = useCallback(() => {
    const track = trackRef.current;
    if (!track) return;
    const cards = [...track.children];

    let next = activeRef.current ? cards.indexOf(activeRef.current) : -1;
    if (next < 0 && activeIdRef.current) {
      next = cards.findIndex((card) => deckIdOf(card) === activeIdRef.current);
    }
    if (next < 0) next = Math.min(indexRef.current, Math.max(0, cards.length - 1));

    indexRef.current = next;
    activeRef.current = cards[next] ?? null;
    activeIdRef.current = activeRef.current ? deckIdOf(activeRef.current) : null;

    cards.forEach((card, n) => {
      const el = card as HTMLElement;
      /* Opened, every card is in the list. */
      if (n === next || openRef.current) {
        el.removeAttribute('data-deck-off');
        el.inert = false;
      } else {
        if (!el.hasAttribute('data-deck-off')) el.setAttribute('data-deck-off', '');
        el.inert = true;
      }
    });
    track.setAttribute('data-ready', '');
    if (openRef.current) track.setAttribute('data-open', '');
    else track.removeAttribute('data-open');

    setCount((previous) => (previous === cards.length ? previous : cards.length));
    setIndex((previous) => (previous === next ? previous : next));

    const id = activeIdRef.current;
    if (id !== reportedRef.current) {
      reportedRef.current = id;
      onActiveChangeRef.current?.(id);
    }
  }, []);

  /* Every render: a card that re-rendered may have been replaced by React with a new element. */
  useLayoutEffect(() => {
    apply();
  });

  /* Cards arrive late and on their own schedule — Review's queries, the church feed's. */
  useLayoutEffect(() => {
    const track = trackRef.current;
    if (!track || typeof MutationObserver === 'undefined') return undefined;
    const observer = new MutationObserver(apply);
    observer.observe(track, { childList: true });
    return () => observer.disconnect();
  }, [apply]);

  const show = useCallback(
    (card: Element | null, { moveFocus }: { moveFocus: boolean }) => {
      const track = trackRef.current;
      if (!track || !card) return;
      const hadFocus = track.contains(document.activeElement);
      /* The card-in motion is for a card the reader brought forward, not for the first one the
         page arrived with — that one already comes in with the sheet's own stagger. */
      track.setAttribute('data-moved', '');
      activeRef.current = card;
      activeIdRef.current = deckIdOf(card);
      apply();
      if (moveFocus && hadFocus) firstFocusable(card)?.focus();
    },
    [apply],
  );

  const go = useCallback(
    (delta: number) => {
      const track = trackRef.current;
      if (!track) return;
      const cards = [...track.children];
      if (cards.length < 2) return;
      const next = (indexRef.current + delta + cards.length) % cards.length;
      show(cards[next], { moveFocus: true });
    },
    [show],
  );

  /* A card can ask to be brought forward — today's passage does, when a reminder link lands. */
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return undefined;
    const onShow = (event: Event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const card = [...track.children].find((candidate) => candidate.contains(target));
      if (card) show(card, { moveFocus: false });
    };
    track.addEventListener(DECK_SHOW_EVENT, onShow);
    return () => track.removeEventListener(DECK_SHOW_EVENT, onShow);
  }, [show]);

  /* Nothing left to open once there is one card. */
  useEffect(() => {
    if (count < 2) setOpen(false);
  }, [count]);

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (count < 2 || openRef.current || keyBelongsElsewhere(event.target)) return;
    const track = trackRef.current;
    if (!track) return;
    if (event.key === 'ArrowRight') go(1);
    else if (event.key === 'ArrowLeft') go(-1);
    else if (event.key === 'Home') show(track.children[0] ?? null, { moveFocus: true });
    else if (event.key === 'End') show(track.children[track.children.length - 1] ?? null, { moveFocus: true });
    else return;
    event.preventDefault();
  };

  /* Touch and pen only: a mouse drag across a row is a text selection, not a swipe. */
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'mouse' || count < 2 || openRef.current) return;
    swipeRef.current = { x: event.clientX, y: event.clientY, id: event.pointerId };
  };

  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const start = swipeRef.current;
    swipeRef.current = null;
    if (!start || start.id !== event.pointerId) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    /* Written to fail closed: a missing coordinate is NaN, and every comparison with NaN is
       false — so "not far enough" has to be the thing that must be proven, not assumed. */
    if (!(Math.abs(dx) >= DECK_SWIPE_PX && Math.abs(dx) > Math.abs(dy))) return;
    /*
     * The cards are rows, and rows are buttons — so the click that ends a swipe would also open
     * whatever the finger lifted on. Swallowed once, here, rather than every row learning to
     * tell a tap from the end of a drag.
     */
    swallowClickRef.current = true;
    window.setTimeout(() => {
      swallowClickRef.current = false;
    }, 400);
    go(dx < 0 ? 1 : -1);
  };

  const onClickCapture = (event: MouseEvent<HTMLDivElement>) => {
    if (!swallowClickRef.current) return;
    swallowClickRef.current = false;
    event.preventDefault();
    event.stopPropagation();
  };

  /* A one-row deck shows one edge at most: two thin edges under a short card read as a smudge
     rather than a stack. Tall cards (the foot pager) have the height to carry two. */
  const peekLevel = expand
    ? 0
    : (peek ?? (Math.min(pager === 'inline' ? 1 : 2, Math.max(0, count - 1)) as 0 | 1 | 2));
  const pagerElsewhere = pagerSlot !== undefined;
  const classes = [
    'proto-deck',
    expand ? 'proto-deck--expand' : pagerElsewhere ? 'proto-deck--pager-external' : `proto-deck--pager-${pager}`,
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const pagerNode =
    counter && !expand && count > 1 ? (
      <div className="proto-deck__foot">
        <button
          type="button"
          className="proto-deck__nav"
          aria-label={`Previous in ${label}`}
          onClick={() => go(-1)}
        >
          <Icon name="caret-left" size={12} />
        </button>
        <span className="proto-caption proto-deck__count" aria-live="polite">
          {index + 1} of {count}
        </span>
        <button
          type="button"
          className="proto-deck__nav"
          aria-label={`Next in ${label}`}
          onClick={() => go(1)}
        >
          <Icon name="caret-right" size={12} />
        </button>
      </div>
    ) : null;

  return (
    <>
      {pagerElsewhere && pagerSlot && pagerNode ? createPortal(pagerNode, pagerSlot) : null}
      <section
      className={classes}
      aria-roledescription="carousel"
      aria-label={label}
      data-count={count}
      data-peek={peekLevel}
      data-proto-spotlight={spotlight}
      onKeyDown={onKeyDown}
    >
      <p className="proto-caption proto-deck__eyebrow">{label}</p>
      <div className="proto-deck__stack">
        <div className="proto-deck__card proto-glass-surface proto-glass-surface--panel proto-list-panel">
          <div
            ref={trackRef}
            className="proto-deck__track"
            onPointerDown={onPointerDown}
            onPointerUp={onPointerUp}
            onPointerCancel={() => {
              swipeRef.current = null;
            }}
            onClickCapture={onClickCapture}
          >
            {children}
          </div>
          {!pagerElsewhere && pagerNode}
          {footer}
        </div>
        {expand && count > 1 ? (
          open ? (
            <button
              type="button"
              className="proto-deck__less"
              aria-expanded="true"
              onClick={() => {
                trackRef.current?.removeAttribute('data-moved');
                setOpen(false);
              }}
            >
              Show less
            </button>
          ) : (
            /* The edge under the card is the way in: it says how many, and opens the list. */
            <button
              type="button"
              className="proto-deck__more"
              aria-expanded="false"
              aria-label={`Show all ${count} in ${label}`}
              onClick={() => {
                trackRef.current?.removeAttribute('data-moved');
                setOpen(true);
              }}
            >
              {count - 1} more
            </button>
          )
        ) : null}
      </div>
    </section>
    </>
  );
}
