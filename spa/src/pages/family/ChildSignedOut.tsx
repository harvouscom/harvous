/**
 * What a child sees when their notebook isn't open: they closed it, the link wore out, a grown-up
 * needs to look at something, notebooks are paused, or the device couldn't reach Harvous.
 *
 * Built from the notebook circle's pieces (the soft card, the cover-coloured art tile, the tip rows)
 * so it reads as part of the same notebook, not a bare error. Every case says what happened and what
 * to do next in a child's words; the grown-up gets a quiet way back to their own sign-in.
 */
import Icon, { type IconName } from '@/components/react/Icon';
import { ChildNotebookAppearanceProvider, useChildNotebookAppearance } from '../prototype/ChildNotebookAppearance';
import ProtoLoadingDots from '../prototype/ProtoLoadingDots';
import { ChildPrivacyFootnote } from './ChildPrivacyNotice';

export type SignedOutKind = 'closed' | 'link' | 'review' | 'paused' | 'offline';

type Tip = { icon: IconName; title: string; text: string };
const safe: Tip = { icon: 'lock', title: 'Your notes are safe', text: 'Only you and your parent can read them.' };

const copy: Record<SignedOutKind, { icon: IconName; title: string; caption: string; tips: Tip[]; retry?: boolean; parent?: boolean }> = {
  closed: {
    icon: 'book-open', title: 'See you next time', caption: 'Your notebook is closed, and everything you wrote is saved.',
    tips: [{ icon: 'user-shield', title: 'Want to keep going?', text: 'Ask your parent to open your notebook again.' }, safe],
    parent: true,
  },
  link: {
    icon: 'key', title: 'This link has worn out', caption: 'Each link opens your notebook once, for a little while.',
    tips: [{ icon: 'user-shield', title: 'Ask your parent', text: 'They can open your notebook on this device, or send you a new link.' }, safe],
    parent: true,
  },
  review: {
    icon: 'user-shield', title: 'Your parent needs to look first', caption: 'Something in your notebook needs a grown-up before it opens.',
    tips: [{ icon: 'house', title: 'Let your parent know', text: 'They’ll find it in My Family, in their own Harvous.' }, safe],
    parent: true,
  },
  paused: {
    icon: 'clock', title: 'Taking a short break', caption: 'Notebooks are resting for a little while.',
    tips: [{ icon: 'arrows-rotate', title: 'Try again soon', text: 'Your notebook will be right where you left it.' }, safe],
    retry: true,
  },
  offline: {
    icon: 'wifi', title: 'Your notebook can’t open right now', caption: 'This device couldn’t reach Harvous.',
    tips: [{ icon: 'wifi', title: 'Check the internet', text: 'Make sure this device is online, then try again.' }, safe],
    retry: true,
  },
};

function SignedOutCard({ kind, privacyUrl, parentSignInUrl, retrying, onRetry }: Props) {
  const { themeStyle } = useChildNotebookAppearance();
  const page = copy[kind];
  return (
    <section className="pds-kids-privacy-modal pds-kids-signed-out__card proto-theme" style={themeStyle} aria-labelledby="kids-signed-out-title" aria-describedby="kids-signed-out-caption">
      <span className="pds-kids-review__art" aria-hidden="true"><Icon name={page.icon} size={25} /></span>
      <h1 id="kids-signed-out-title" className="pds-title-xl">{page.title}</h1>
      <p id="kids-signed-out-caption" className="pds-caption">{page.caption}</p>
      <div className="pds-kids-circle">
        {page.tips.map(tip => (
          <div key={tip.title} className="pds-kids-circle__tip">
            <span aria-hidden="true"><Icon name={tip.icon} size={17} /></span>
            <div><strong>{tip.title}</strong><span>{tip.text}</span></div>
          </div>
        ))}
      </div>
      {page.retry && onRetry ? (
        <button type="button" className="proto-settings-btn" disabled={retrying} onClick={onRetry}>
          {retrying ? <ProtoLoadingDots /> : <Icon name="arrows-rotate" size={13} aria-hidden />} Try again
        </button>
      ) : null}
      {page.parent && parentSignInUrl ? (
        <a className="pds-kids-signed-out__parent" href={parentSignInUrl}>
          <Icon name="user-shield" size={13} aria-hidden /> I’m the parent
        </a>
      ) : null}
      <ChildPrivacyFootnote url={privacyUrl}>A notebook is just for a child and their parent.</ChildPrivacyFootnote>
    </section>
  );
}

type Props = { kind: SignedOutKind; privacyUrl?: string; parentSignInUrl?: string; retrying?: boolean; onRetry?: () => void };

export default function ChildSignedOut(props: Props) {
  // No notebook, so no preferences: the default cover colour and the device's light or dark.
  return (
    // Polite: it's the whole screen, and it can replace an open notebook when a session ends.
    <main className="pds-kids-signed-out" aria-live="polite">
      <ChildNotebookAppearanceProvider name="">
        <SignedOutCard {...props} />
      </ChildNotebookAppearanceProvider>
    </main>
  );
}
