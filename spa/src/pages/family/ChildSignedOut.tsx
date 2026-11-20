/**
 * What a child sees when their notebook isn't open: they closed it, the link was already used, a
 * grown-up needs to look at something, notebooks are resting, or the device couldn't reach Harvous.
 *
 * It's drawn in the notebook's own language, the way the move page is: the desk gradient, die-cut
 * stickers, and the notebook itself, the child's own when we know it (after "Close my notebook"),
 * otherwise a plain one with a seedling. The words are a child's. The hand-off to a grown-up is a
 * picture (you, then your parent) and the grown-up gets a real button back to their sign-in.
 *
 * The book stands on a paper letter that carries the words, as on the move page (Derek chose this
 * over a note taped to the cover). In dev, `?preview=1&signedOut=<kind>` shows each case.
 */
import type { CSSProperties } from 'react';
import Icon, { type IconName } from '@/components/react/Icon';
import { defaultChildPreferences, type ChildNotebookPreferences } from '../../../../shared/child-notebook';
import { ChildNotebookAppearanceProvider, ChildNotebookAvatar, ChildNotebookCover, useChildNotebookAppearance } from '../prototype/ChildNotebookAppearance';
import ChildCoverSymbol from '../prototype/ChildCoverSymbol';
import ProtoLoadingDots from '../prototype/ProtoLoadingDots';
import { ChildPrivacyFootnote } from './ChildPrivacyNotice';
import '../../styles/kids-signed-out.css';

export type SignedOutKind = 'closed' | 'link' | 'review' | 'paused' | 'offline';
/** The notebook that was open, when there was one: its name and cover. */
export type SignedOutIdentity = { displayName: string; preferences: ChildNotebookPreferences | null };

type Page = { badge: IconName; title: (name: string) => string; line: string; handoff?: string; retry?: boolean };

const pages: Record<SignedOutKind, Page> = {
  closed: {
    badge: 'check',
    title: name => (name ? `See you next time, ${name}!` : 'See you next time!'),
    line: 'Your notebook is tucked away, safe and sound.',
    handoff: 'Want to keep going? Ask your parent to open it again.',
  },
  link: {
    badge: 'key',
    title: () => 'Let’s open your notebook again',
    line: 'Each link opens your notebook just once.',
    handoff: 'Ask your parent to open it for you, or to send a new link.',
  },
  review: {
    badge: 'user-shield',
    title: () => 'Your parent needs to take a peek',
    line: 'Something needs a grown-up before your notebook opens.',
    handoff: 'Ask your parent to look in My Family, in their Harvous.',
  },
  paused: {
    badge: 'clock',
    title: () => 'Your notebook is taking a little rest',
    line: 'It’ll be ready again soon. Everything you wrote is safe.',
    retry: true,
  },
  offline: {
    badge: 'wifi',
    title: () => 'We can’t reach your notebook',
    line: 'Check that you’re connected to the internet, then try again.',
    retry: true,
  },
};

/** Before sign-in there's no notebook to show: a plain one with a seedling, as on the move page. */
const WAITING_COVER: ChildNotebookPreferences = { ...defaultChildPreferences, coverColor: 'green', coverSymbol: 'seedling' };

type Tone = 'blue' | 'green' | 'purple' | 'pink' | 'orange' | 'yellow';
const STICKERS: { symbol: 'rainbow' | 'fish' | 'sun' | 'heart' | 'star' | 'dove'; tone: Tone; top: string; left: string; tilt: number }[] = [
  { symbol: 'rainbow', tone: 'pink', top: '9%', left: '9%', tilt: -10 },
  { symbol: 'sun', tone: 'yellow', top: '6%', left: '82%', tilt: 12 },
  { symbol: 'fish', tone: 'blue', top: '34%', left: '4%', tilt: 8 },
  { symbol: 'heart', tone: 'orange', top: '30%', left: '90%', tilt: -7 },
  { symbol: 'star', tone: 'purple', top: '76%', left: '7%', tilt: -12 },
  { symbol: 'dove', tone: 'green', top: '80%', left: '86%', tilt: 6 },
];

type Props = {
  kind: SignedOutKind;
  identity?: SignedOutIdentity | null;
  privacyUrl?: string;
  parentSignInUrl?: string;
  retrying?: boolean;
  onRetry?: () => void;
};

function Stickers() {
  return (
    <div className="kso__stickers" aria-hidden="true">
      {STICKERS.map(sticker => (
        <span key={sticker.symbol} className="kso__sticker" data-tone={sticker.tone}
          style={{ top: sticker.top, left: sticker.left, '--tilt': `${sticker.tilt}deg` } as CSSProperties}>
          <ChildCoverSymbol symbol={sticker.symbol} size={20} />
        </span>
      ))}
    </div>
  );
}

/** The notebook, with a round sticker on its corner that says what happened (a key, a check…). */
function Book({ badge }: { badge: IconName }) {
  const { name, preferences } = useChildNotebookAppearance();
  return (
    <div className="kso__book" aria-hidden="true">
      <ChildNotebookCover name={name || 'H'} preferences={preferences} large />
      <span className="kso__badge"><Icon name={badge} size={16} /></span>
    </div>
  );
}

/**
 * You, then your parent: the hand-off as a picture, with one line under it. The grown-up's way in is
 * the card's own last row, the end of the same hand-off, not a separate button underneath.
 */
function Handoff({ text, parentSignInUrl }: { text: string; parentSignInUrl?: string }) {
  const { name } = useChildNotebookAppearance();
  return (
    <div className="kso__handoff">
      <div className="kso__people" aria-hidden="true">
        <span className="kso__person"><ChildNotebookAvatar /><small>You</small></span>
        <span className="kso__arrow"><Icon name="arrow-right" size={14} /></span>
        <span className="kso__person"><span className="kso__parent"><Icon name="user-shield" size={18} /></span><small>Your parent</small></span>
      </div>
      <p>{text}</p>
      {parentSignInUrl ? (
        <a className="kso__parent-row" href={parentSignInUrl}>
          <span className="kso__parent-row-icon" aria-hidden="true"><Icon name="user-shield" size={14} /></span>
          <span className="kso__parent-row-text">
            <b>{name ? `Are you ${name}’s parent?` : 'Are you the parent?'}</b>
            <small>Sign in to open it again</small>
          </span>
          <Icon name="caret-right" size={12} aria-hidden />
        </a>
      ) : null}
    </div>
  );
}

function Retry({ retrying, onRetry }: Pick<Props, 'retrying' | 'onRetry'>) {
  return (
    <div className="kso__actions">
      <button type="button" className="proto-settings-btn proto-ink-on-accent" disabled={retrying} onClick={onRetry}>
        {retrying ? <ProtoLoadingDots /> : <Icon name="arrows-rotate" size={13} aria-hidden />} Try again
      </button>
    </div>
  );
}

function SignedOutPage({ kind, privacyUrl, parentSignInUrl, retrying, onRetry }: Props) {
  const { name, themeStyle, appearance } = useChildNotebookAppearance();
  const page = pages[kind];
  const title = page.title(name);
  const eyebrow = name ? `${name}’s notebook` : 'Your notebook';
  const words = <>
    <p className="kso__eyebrow">{eyebrow}</p>
    <h1 id="kids-signed-out-title" className="kso__title">{title}</h1>
    <p className="kso__line">{page.line}</p>
  </>;
  const after = <>
    {page.handoff ? <Handoff text={page.handoff} parentSignInUrl={parentSignInUrl} /> : null}
    {page.retry && onRetry ? <Retry retrying={retrying} onRetry={onRetry} /> : null}
    <ChildPrivacyFootnote url={privacyUrl}>A notebook is just for a child and their parent.</ChildPrivacyFootnote>
  </>;
  return (
    <section className="kso proto-theme" data-kind={kind} data-reduce-motion={appearance.reduceMotion || undefined}
      style={themeStyle} aria-labelledby="kids-signed-out-title">
      <div className="kso__desk" aria-hidden="true" />
      <Stickers />
      <div className="kso__stage">
        <Book badge={page.badge} />
        <div className="kso__letter">{words}{after}</div>
      </div>
    </section>
  );
}

export default function ChildSignedOut(props: Props) {
  const identity = props.kind === 'closed' ? props.identity : null;
  return (
    // Polite: it's the whole screen, and it can replace an open notebook when a session ends.
    <main className="pds-kids-signed-out" aria-live="polite">
      <ChildNotebookAppearanceProvider name={identity?.displayName ?? ''} initial={identity?.preferences ?? WAITING_COVER}>
        <SignedOutPage {...props} />
      </ChildNotebookAppearanceProvider>
    </main>
  );
}
