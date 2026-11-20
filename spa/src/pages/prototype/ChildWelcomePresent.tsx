/**
 * The first moment of a child's first open, full screen: their notebook presented on the kids'
 * desk (the same desk and stickers as the signed-out page), with what comes with it popping out of
 * it, and one button, "Make it mine".
 *
 * It's a fixed layer inside the welcome dialog, over the whole viewport (the dialog has no transform
 * then, so the viewport is its containing block). Tapping the button measures the dialog's card, the
 * studio's desk and the studio's book, and hands those to the dialog as CSS variables: the desk
 * contracts into the card's header art, the book lands exactly on the studio's book, and the
 * "Make it yours" sheet slides up into the card (the morph in child-notebook-preview.css). When it
 * ends, ChildNotebookView removes this layer, and the card underneath is pixel for pixel its last
 * frame. ChildNotebookView owns the phases.
 */
import { useLayoutEffect, useRef, type CSSProperties, type RefObject } from 'react';
import Icon, { type IconName } from '@/components/react/Icon';
import ChildDesk from '../family/ChildDesk';
import { ChildNotebookCover, useChildNotebookAppearance } from './ChildNotebookAppearance';

/** What a child notebook comes with, in a child's words. */
const GIFTS: { icon: IconName; label: string }[] = [
  { icon: 'book-open', label: 'A Bible to read' },
  { icon: 'pen-to-square', label: 'Pages to write on' },
  { icon: 'star', label: 'Stickers for verses' },
  { icon: 'rotate-left', label: 'Look back questions' },
  { icon: 'people-roof', label: 'Reading with your parent' },
];

type Props = {
  dialogRef: RefObject<HTMLDialogElement | null>;
  /** Called after the morph's measurements are on the dialog. */
  onBegin: () => void;
  /** While the morph runs, nothing here can be focused or tapped. */
  inert?: boolean;
};

export default function ChildWelcomePresent({ dialogRef, onBegin, inert }: Props) {
  const { name, preferences, coverColor } = useChildNotebookAppearance();
  const bookRef = useRef<HTMLDivElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);

  /* The book arrives alone, centred on the screen, before the words: `--solo-offset` is how far it
     sits from its place in the stack, so it can start there and glide up as the rest comes in. */
  useLayoutEffect(() => {
    const layer = layerRef.current;
    const book = bookRef.current;
    if (!layer || !book) return;
    // Measured once the dialog shows (it mounts closed, with no size), before that frame paints.
    // offsetTop is the book's place in the stack, whatever its arrival animation is doing.
    const place = () => {
      if (!layer.clientHeight) return;
      layer.style.setProperty('--solo-offset', `${Math.round(layer.clientHeight / 2 - (book.offsetTop + book.offsetHeight / 2))}px`);
    };
    const observer = new ResizeObserver(place);
    observer.observe(layer);
    return () => observer.disconnect();
  }, []);

  function begin() {
    const dialog = dialogRef.current;
    const book = bookRef.current;
    // A tap (or Enter) before the arrival has played out: finish it, so the book is measured at rest.
    layerRef.current?.getAnimations({ subtree: true }).forEach(animation => {
      if (animation.effect?.getTiming().iterations !== Infinity) animation.finish();
    });
    const stage = dialog?.querySelector<HTMLElement>('.pds-kids-studio__stage');
    const from = book?.querySelector<HTMLElement>('.pds-kids-book__volume');
    const to = stage?.querySelector<HTMLElement>('.pds-kids-book__volume');
    if (dialog && book && stage && from && to) {
      const box = dialog.getBoundingClientRect();
      const card = getComputedStyle(dialog);
      const desk = stage.getBoundingClientRect();
      const here = from.getBoundingClientRect();
      const there = to.getBoundingClientRect();
      const wrapper = book.getBoundingClientRect();
      const studio = getComputedStyle(stage.parentElement ?? stage);
      // The sheet's top edge: the stage's bottom less the desk tucked under the sheet.
      const tucked = (parseFloat(studio.getPropertyValue('--welcome-overlap')) || 0) + (parseFloat(studio.getPropertyValue('--welcome-tuck')) || 0);
      const set = (name: string, value: string) => dialog.style.setProperty(name, value);
      // The book scales about its own centre, so its centre lands on the studio book's centre.
      set('--flip-ox', `${here.left + here.width / 2 - wrapper.left}px`);
      set('--flip-oy', `${here.top + here.height / 2 - wrapper.top}px`);
      set('--flip-x', `${there.left + there.width / 2 - (here.left + here.width / 2)}px`);
      set('--flip-y', `${there.top + there.height / 2 - (here.top + here.height / 2)}px`);
      set('--flip-s', String(there.width / here.width));
      // The desk contracts from the viewport to the studio's desk: the card's top, edge to edge.
      set('--desk-to-top', `${desk.top}px`);
      set('--desk-to-left', `${desk.left}px`);
      set('--desk-to-width', `${desk.width}px`);
      set('--desk-to', `${desk.height}px`);
      set('--card-radius', card.borderTopLeftRadius);
      // Far enough that the sheet, shadow and all, starts just below the dialog's bottom edge.
      set('--sheet-drop', `${Math.ceil(box.bottom - (desk.bottom - tucked)) + 24}px`);
    }
    onBegin();
  }

  return (
    <div ref={layerRef} className="kids-present" inert={inert}>
      <div className="kids-present__desk"><ChildDesk /></div>
      {/* The same book the studio draws (same classes, so the same size and scale), shown bigger. */}
      <div ref={bookRef} className="kids-present__book" aria-hidden="true">
        <div className="pds-kids-studio pds-kids-studio--welcome kids-present__scope" style={{ '--kids-cover-color': coverColor.color } as CSSProperties}>
          <span className="pds-kids-studio__book"><ChildNotebookCover name={name} preferences={preferences} large /></span>
        </div>
      </div>
      <h2 id="kids-present-title" className="pds-kids-welcome__title kids-present__title">{name ? `Here’s your notebook, ${name}!` : 'Here’s your notebook!'}</h2>
      <section className="kids-present__gifts" aria-labelledby="kids-present-gifts-label">
        <p id="kids-present-gifts-label" className="kids-present__gifts-label">It comes with</p>
        <ul>
          {GIFTS.map((gift, index) => (
            <li key={gift.label} style={{ '--i': index } as CSSProperties}>
              <span className="kids-present__gift-icon" aria-hidden="true"><Icon name={gift.icon} size={12} /></span>
              {gift.label}
            </li>
          ))}
        </ul>
      </section>
      <button type="button" className="proto-settings-btn proto-ink-on-accent kids-present__start" onClick={begin}>
        <Icon name="wand-magic-sparkles" size={13} aria-hidden /> Make it mine
      </button>
    </div>
  );
}
