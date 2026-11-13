/**
 * `/family/notebook/:token` — a parent's link to move a child notebook into the teen's own account.
 *
 * Built on the shared pages (PublicSharedThreadPage): a sky band, then the object itself, then
 * one letter that says who sent it, as a sentence with their name marked. A shared Thread is a manila folder; this is
 * the notebook they kept as a kid, drawn with the cover they chose, standing on a cream letter
 * that names it, counts it and says what moving it does. Nothing from inside a note is on the
 * page. The button floats and comes to rest on the letter's edge.
 *
 * The sky is a gradient, not the sign-in photo: the "desk" behind the notebook on harvous.com's
 * child notebooks page (green behind the book, pink and yellow at the corners, pale blue under).
 *
 * Signed out, the page shows a plain notebook and no name, then asks them to sign in or create
 * their account. The move is server/family/notebook-move.ts: one transaction, all or nothing.
 */
import { useState, type ReactNode } from 'react';
import { useNavigate, useParams } from '@tanstack/react-router';
import { useAuth } from '@clerk/clerk-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import Icon, { type IconName } from '@/components/react/Icon';
import SubtleContentMount from '@/components/react/SubtleContentMount';
import { enterSpaceUrl } from '@/utils/enter-space-link';
import { api } from '../../lib/api';
import { useAuthReady } from '../../hooks/useAuthReady';
import { clearPendingAuthRedirect, writePendingAuthRedirect } from '../../lib/pending-auth-redirect';
import { defaultChildPreferences, type ChildNotebookPreferences } from '../../../../shared/child-notebook';
import { ChildNotebookCover } from '../prototype/ChildNotebookAppearance';
import ChildCoverSymbol from '../prototype/ChildCoverSymbol';
import { PublicErrorState, PublicSharedFooter, PublicTopBar } from './public-shared';
import '../../styles/public-shared-paper.css';
import '../../styles/child-notebook-preview.css';
import '../../styles/public-notebook-move.css';

type Preview = {
  displayName: string;
  preferences: ChildNotebookPreferences | null;
  parentFirstName: string | null;
  notes: number;
  highlights: number;
  keptFrom: string | null;
  keptTo: string | null;
  expiresAt: string;
};
type Claimed = {
  summary: { notes: number; tags: number; threads: number; highlights: number; familyBibleNotes: number; reviewItems: number };
  homeSpaceId: string;
  familyJoinPath: string | null;
};

/** Before sign-in there's no notebook to show yet: a plain one with a seedling, for growing up. */
const WAITING_COVER: ChildNotebookPreferences = { ...defaultChildPreferences, coverColor: 'green', coverSymbol: 'seedling' };

/**
 * Dev only: `?fixture=preview` or `?fixture=done` draws the signed-in states with made-up data,
 * since those need a real account and a real link. Compiled out of production builds.
 */
const FIXTURE = import.meta.env.DEV ? new URLSearchParams(window.location.search).get('fixture') : null;
const FIXTURE_PREVIEW: Preview = {
  displayName: 'Abby', parentFirstName: 'Derek', notes: 23, highlights: 8, keptFrom: '2025-09-14T00:00:00Z',
  keptTo: '2026-11-02T00:00:00Z', expiresAt: '2026-11-20T00:00:00Z',
  preferences: { ...defaultChildPreferences, coverColor: 'purple', coverSymbol: 'dove', coverPattern: 'dots' },
};
const FIXTURE_DONE: Claimed = {
  summary: { notes: 23, tags: 4, threads: 2, highlights: 8, familyBibleNotes: 3, reviewItems: 12 },
  homeSpaceId: 'space_fixture', familyJoinPath: '/family/join/fixture',
};

const monthYear = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { month: 'short', year: 'numeric' }) : null;

function kept(from: string | null, to: string | null) {
  const a = monthYear(from);
  const b = monthYear(to);
  if (!a || !b) return null;
  return a === b ? a : `${a} – ${b}`;
}

/** The notebook they kept, in the cover they chose, standing on the letter below it. */
function Notebook({ name, preferences, moved = false }: {
  name: string;
  preferences: ChildNotebookPreferences | null;
  moved?: boolean;
}) {
  return (
    <div className={`public-move__book${moved ? ' public-move__book--moved' : ''}`}>
      <ChildNotebookCover name={name || 'H'} preferences={preferences} large />
      {moved ? (
        <span className="public-move__stamp" aria-hidden>
          <Icon name="check" size={14} />
        </span>
      ) : null}
    </div>
  );
}

type Tone = 'blue' | 'green' | 'purple' | 'pink' | 'orange' | 'yellow';

/** Die-cut stickers around the notebook, as on harvous.com's child notebooks desk. */
const STICKERS: { symbol: 'rainbow' | 'fish' | 'sun' | 'crown' | 'heart' | 'star'; tone: Tone; top: string; left: string; tilt: number }[] = [
  { symbol: 'rainbow', tone: 'pink', top: '6%', left: '8%', tilt: -10 },
  { symbol: 'fish', tone: 'blue', top: '30%', left: '2%', tilt: 8 },
  { symbol: 'sun', tone: 'yellow', top: '4%', left: '84%', tilt: 12 },
  { symbol: 'heart', tone: 'orange', top: '30%', left: '90%', tilt: -7 },
  { symbol: 'crown', tone: 'green', top: '22%', left: '20%', tilt: 6 },
  { symbol: 'star', tone: 'purple', top: '20%', left: '72%', tilt: -12 },
];

function FloatingStickers() {
  return (
    <div className="public-move__stickers" aria-hidden>
      {STICKERS.map((sticker) => (
        <span key={sticker.symbol} className="public-move__sticker" data-tone={sticker.tone}
          style={{ top: sticker.top, left: sticker.left, ['--tilt' as string]: `${sticker.tilt}deg` }}>
          <ChildCoverSymbol symbol={sticker.symbol} size={22} />
        </span>
      ))}
    </div>
  );
}

/** One line of what goes where: a sticker for the thing, what it is, and where it lands. */
type ManifestRow = { icon: IconName; tone: Tone; what: string; detail?: string; where: string; stays?: boolean };

/**
 * The letter is the notebook's label and its packing list. At the top, printed like the Thread
 * folder's front: the name and fields. Under it, each thing in the notebook and where it
 * goes, so nothing has to be read as a paragraph. One button floats, as on the shared pages;
 * anything else is a quiet link at the letter's foot.
 */
function Letter({ eyebrow, heading, fields, title, rows, note, aside, moved = false }: {
  eyebrow: string;
  heading: ReactNode;
  fields: { label: string; value: string }[];
  title: string;
  rows: ManifestRow[];
  note?: string;
  aside?: ReactNode;
  moved?: boolean;
}) {
  return (
    <div className="public-paper-stack public-shared__stack public-move__letter">
      <div className="public-paper-stack__leaf public-paper-stack__leaf--back" aria-hidden />
      <div className="public-paper-stack__leaf public-paper-stack__leaf--mid" aria-hidden />
      <section className="public-shared__sheet public-move__sheet" aria-label={eyebrow}>
        <header className="public-move__plate">
          <p className="public-move__eyebrow">{eyebrow}</p>
          <h1 className="public-move__name">{heading}</h1>
          {fields.length ? (
            <dl className="public-move__fields">
              {fields.map((field) => (
                <div key={field.label} className="public-move__field">
                  <dt>{field.label}</dt>
                  <dd>{field.value}</dd>
                </div>
              ))}
            </dl>
          ) : null}
        </header>
        <h2 className="public-move__heading">{title}</h2>
        <ul className="public-move__manifest" role="list">
          {rows.map((row) => (
            <li key={row.what} className={row.stays ? 'public-move__row public-move__row--stays' : 'public-move__row'}>
              <span className="public-move__chip" data-tone={row.tone} aria-hidden>
                <Icon name={row.icon} size={14} />
              </span>
              <span className="public-move__what">
                <b>{row.what}</b>
                {row.detail ? <small>{row.detail}</small> : null}
              </span>
              <span className="public-move__where">
                {row.stays ? null : <Icon name={moved ? 'check' : 'arrow-right'} size={10} aria-hidden />}
                {row.where}
              </span>
            </li>
          ))}
        </ul>
        {note ? (
          <p className="public-move__note">
            <Icon name="lock" size={12} aria-hidden />
            <span>{note}</span>
          </p>
        ) : null}
        {aside ? <p className="public-move__aside">{aside}</p> : null}
      </section>
    </div>
  );
}

export default function PublicClaimNotebookPage() {
  const { token } = useParams({ from: '/family/notebook/$token' });
  const { isLoaded, isSignedIn, userId } = useAuth();
  const ready = useAuthReady();
  const navigate = useNavigate();
  const [done, setDone] = useState<Claimed | null>(FIXTURE === 'done' ? FIXTURE_DONE : null);
  const endpoint = `/api/child-accounts/move/${encodeURIComponent(token)}`;
  const preview = useQuery({
    queryKey: ['notebook-move', userId, token],
    enabled: ready && !!isSignedIn && !done,
    retry: false,
    meta: { persist: false },
    queryFn: () => api.get<Preview>(endpoint),
  });
  const claim = useMutation({
    mutationFn: () => api.post<Claimed>(`${endpoint}/claim`),
    onSuccess: (result) => { clearPendingAuthRedirect(); setDone(result); },
  });

  function goToAuth(toSignIn: boolean) {
    writePendingAuthRedirect(window.location.href);
    const back = encodeURIComponent(window.location.href);
    void navigate({ to: `/${toSignIn ? 'sign-in' : 'sign-up'}?redirect_url=${back}` as never });
  }
  const openHome = (spaceId: string) => void navigate({ to: enterSpaceUrl(spaceId) as never });

  const data = FIXTURE ? FIXTURE_PREVIEW : preview.data;
  const cta = (primary: ReactNode) => (
    <div className="public-shared__cta-bar">
      <div className="public-shared__cta-inner public-move__cta">{primary}</div>
    </div>
  );

  let content: ReactNode;
  // The stickers come with the notebook: not over a spinner or a dead link.
  let staged = true;
  if (done) {
    const s = done.summary;
    const notes = s.notes + s.familyBibleNotes;
    content = <>
      <Notebook name={data?.displayName ?? ''} preferences={data?.preferences ?? null} moved />
      <Letter moved eyebrow={data?.displayName ? `${data.displayName}’s notebook` : 'Your notebook'}
        heading={<>Welcome to <span className="public-shared__mark">your own Harvous</span>.</>}
        fields={[{ label: 'Notes', value: String(notes) }, ...(s.highlights ? [{ label: 'Highlights', value: String(s.highlights) }] : [])]}
        title="Where everything went" rows={[
          { icon: 'note-sticky', tone: 'blue', what: notes === 1 ? '1 note' : `${notes} notes`, detail: 'With their folders, tags and Threads', where: 'My Home' },
          ...(s.highlights ? [{ icon: 'highlighter' as const, tone: 'yellow' as const, what: s.highlights === 1 ? '1 highlight' : `${s.highlights} highlights`, where: 'Your Bible' }] : []),
          ...(s.reviewItems ? [{ icon: 'arrows-rotate' as const, tone: 'green' as const, what: 'Look back', detail: 'What you were remembering', where: 'Review' }] : []),
          ...(s.familyBibleNotes ? [{ icon: 'book-open' as const, tone: 'orange' as const, what: 'Family Bible thoughts', detail: 'A note for each chapter', where: 'Family Bible folder' }] : []),
        ]}
        aside={done.familyJoinPath ? <>Or <button type="button" className="public-move__link" onClick={() => openHome(done.homeSpaceId)}>open My Home</button> first, and come back to the invite.</> : undefined} />
      {done.familyJoinPath
        ? cta(<button type="button" className="public-cta-btn" onClick={() => void navigate({ to: done.familyJoinPath as never })}>See your family invite</button>)
        : cta(<button type="button" className="public-cta-btn" onClick={() => openHome(done.homeSpaceId)}>Open My Home</button>)}
    </>;
  } else if (!isLoaded) {
    staged = false;
    content = <div className="page-loading" />;
  } else if (!isSignedIn && !FIXTURE) {
    // Nothing about the notebook until they're signed in: no name, no cover, no counts.
    content = <>
      <Notebook name="" preferences={WAITING_COVER} />
      <Letter eyebrow="From your family" heading="A notebook is waiting for you." fields={[]} title="Keep what you wrote" rows={[
        { icon: 'note-sticky', tone: 'blue', what: 'Your notes', detail: 'With their folders, tags and Threads', where: 'Your account' },
        { icon: 'highlighter', tone: 'yellow', what: 'Your highlights', where: 'Your Bible' },
      ]} note="Your parent sent this link. Create your account, or sign in, to see your notebook."
        aside={<>Already have an account? <button type="button" className="public-move__link" onClick={() => goToAuth(true)}>Sign in</button></>} />
      {cta(<button type="button" className="public-cta-btn" onClick={() => goToAuth(false)}>Create your free account</button>)}
    </>;
  } else if (!FIXTURE && (!ready || preview.isLoading)) {
    // `useAuthReady` is false while signed out, so it only gates the signed-in states.
    staged = false;
    content = <div className="page-loading" />;
  } else if (!data) {
    staged = false;
    content = <PublicErrorState icon={<Icon name="link" size={24} />} title="This link isn’t working"
      message={preview.error instanceof Error ? preview.error.message : 'Ask your parent for a new one.'} />;
  } else {
    const keptSpan = kept(data.keptFrom, data.keptTo);
    content = <>
      <Notebook name={data.displayName} preferences={data.preferences} />
      <Letter eyebrow={`${data.displayName}’s notebook`}
        heading={data.parentFirstName
          ? <><span className="public-shared__mark">{data.parentFirstName}</span> sent you your notebook.</>
          : 'Your notebook is ready to move.'}
        fields={[
        { label: 'Notes', value: data.notes ? String(data.notes) : 'None yet' },
        ...(data.highlights ? [{ label: 'Highlights', value: String(data.highlights) }] : []),
        ...(keptSpan ? [{ label: 'Kept', value: keptSpan }] : []),
      ]} title="What moves where" rows={[
        { icon: 'note-sticky', tone: 'blue', what: 'Notes', detail: 'With their folders, tags and Threads', where: 'My Home' },
        { icon: 'highlighter', tone: 'yellow', what: 'Highlights', where: 'Your Bible' },
        { icon: 'arrows-rotate', tone: 'green', what: 'Look back', where: 'Review' },
        { icon: 'book-open', tone: 'orange', what: 'Family Bible thoughts', detail: 'A note for each chapter', where: 'Family Bible folder' },
        { icon: 'download', tone: (data.preferences?.coverColor ?? defaultChildPreferences.coverColor) as Tone, what: 'Cover and stickers', detail: 'They’re only in child notebooks', where: 'Stay behind', stays: true },
      ]} note="Afterwards it’s yours alone. Your parent can’t open it, and the child notebook closes." />
      {claim.error ? <p className="public-move__error" role="alert">{claim.error instanceof Error ? claim.error.message : 'Try again in a moment.'}</p> : null}
      {cta(<button type="button" className="public-cta-btn" disabled={claim.isPending} onClick={() => claim.mutate()}>
        {claim.isPending ? 'Moving…' : 'Move it into my account'}
      </button>)}
    </>;
  }

  return (
    <>
      <title>Your notebook | Harvous</title>
      <div className="public-page public-page--shared">
        <PublicTopBar isSignedIn={Boolean(isSignedIn)} />
        <div className="public-body">
          {/* Not the photo sky: the child notebooks page's desk, as a soft band behind the notebook. */}
          <div className="public-move__sky" aria-hidden />
          <div className="public-shared-host">
            <SubtleContentMount variant="fade">
              <div className="public-shared public-move">
                {staged ? <FloatingStickers /> : null}
                {content}
                <PublicSharedFooter />
              </div>
            </SubtleContentMount>
          </div>
        </div>
      </div>
    </>
  );
}
