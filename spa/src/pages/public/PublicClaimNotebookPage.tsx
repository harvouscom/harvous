/**
 * `/family/notebook/:token` — a parent's link to move a child notebook into the teen's own account.
 *
 * Built on the shared pages (PublicSharedThreadPage): the sign-in sky, who sent it as a sentence
 * with their name marked, then the object itself. A shared Thread is a manila folder; this is
 * the notebook they kept as a kid, drawn with the cover they chose, its name and fields printed
 * under it like the folder's. Nothing from inside a note is on the page. Below it, a cream
 * letter says what moving it does, and the button floats and comes to rest on the letter's edge.
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
import { PublicErrorState, PublicSharedFooter, PublicTopBar } from './public-shared';
import { SharedSky } from './shared-opening';
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

/** The notebook and its label: the cover they chose, the name, and fields printed like the folder's. */
function Notebook({ name, preferences, fields, moved = false }: {
  name: string;
  preferences: ChildNotebookPreferences | null;
  fields: { label: string; value: string }[];
  moved?: boolean;
}) {
  return (
    <figure className={`public-move__object${moved ? ' public-move__object--moved' : ''}`}>
      <div className="public-move__book">
        <ChildNotebookCover name={name || 'H'} preferences={preferences} large />
        {moved ? (
          <span className="public-move__stamp" aria-hidden>
            <Icon name="check" size={14} />
          </span>
        ) : null}
      </div>
      <figcaption className="public-move__label">
        <span className="public-move__tab">Notebook</span>
        <b className="public-move__name">{name ? `${name}’s notebook` : 'Your notebook'}</b>
        {fields.length ? (
          <span className="public-move__fields">
            {fields.map((field) => (
              <span key={field.label} className="public-move__field">
                <span>{field.label}</span>
                <b>{field.value}</b>
              </span>
            ))}
          </span>
        ) : null}
      </figcaption>
    </figure>
  );
}

/** One button floats, as on the shared pages; anything else is a quiet link at the letter's foot. */
function Letter({ title, lines, note, aside }: { title: string; lines: { icon: IconName; text: string }[]; note?: string; aside?: ReactNode }) {
  return (
    <div className="public-paper-stack public-shared__stack public-move__letter">
      <div className="public-paper-stack__leaf public-paper-stack__leaf--back" aria-hidden />
      <div className="public-paper-stack__leaf public-paper-stack__leaf--mid" aria-hidden />
      <section className="public-shared__sheet public-move__sheet" aria-label={title}>
        <h2 className="public-move__heading">{title}</h2>
        <ul className="public-move__lines" role="list">
          {lines.map((line) => (
            <li key={line.text}>
              <Icon name={line.icon} size={14} aria-hidden />
              <span>{line.text}</span>
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
  const opening = (eyebrow: string, line: ReactNode) => (
    <div className="public-shared__opening">
      <p className="public-shared__eyebrow">{eyebrow}</p>
      <h2 className="public-shared__opening-line">{line}</h2>
    </div>
  );
  const cta = (primary: ReactNode) => (
    <div className="public-shared__cta-bar">
      <div className="public-shared__cta-inner public-move__cta">{primary}</div>
    </div>
  );

  let content: ReactNode;
  if (done) {
    const s = done.summary;
    const notes = s.notes + s.familyBibleNotes;
    content = <>
      {opening('It’s yours now', <>Welcome to <span className="public-shared__mark">your own Harvous</span>.</>)}
      <Notebook name={data?.displayName ?? ''} preferences={data?.preferences ?? null} moved
        fields={[{ label: 'Notes', value: String(notes) }, ...(s.highlights ? [{ label: 'Highlights', value: String(s.highlights) }] : [])]} />
      <Letter title="Where everything went" lines={[
        { icon: 'note-sticky', text: `${notes === 1 ? 'Your note is' : `Your ${notes} notes are`} in My Home, with their folders, tags and Threads.` },
        ...(s.highlights ? [{ icon: 'highlighter' as const, text: 'Your highlights are in your Bible.' }] : []),
        ...(s.reviewItems ? [{ icon: 'arrows-rotate' as const, text: 'What you were looking back on is in Review now.' }] : []),
        ...(s.familyBibleNotes ? [{ icon: 'book-open' as const, text: 'Your Family Bible thoughts are notes in a Family Bible folder.' }] : []),
      ]} aside={done.familyJoinPath ? <>Or <button type="button" className="public-move__link" onClick={() => openHome(done.homeSpaceId)}>open My Home</button> first, and come back to the invite.</> : undefined} />
      {done.familyJoinPath
        ? cta(<button type="button" className="public-cta-btn" onClick={() => void navigate({ to: done.familyJoinPath as never })}>See your family invite</button>)
        : cta(<button type="button" className="public-cta-btn" onClick={() => openHome(done.homeSpaceId)}>Open My Home</button>)}
    </>;
  } else if (!isLoaded) {
    content = <div className="page-loading" />;
  } else if (!isSignedIn && !FIXTURE) {
    // Nothing about the notebook until they're signed in: no name, no cover, no counts.
    content = <>
      {opening('From your family', 'A notebook is waiting for you.')}
      <Notebook name="" preferences={WAITING_COVER} fields={[]} />
      <Letter title="Keep what you wrote" lines={[
        { icon: 'note-sticky', text: 'Your parent sent this so the notebook you kept as a kid can move into your own Harvous account.' },
        { icon: 'circle-user', text: 'Create your account, or sign in, to see it.' },
      ]} aside={<>Already have an account? <button type="button" className="public-move__link" onClick={() => goToAuth(true)}>Sign in</button></>} />
      {cta(<button type="button" className="public-cta-btn" onClick={() => goToAuth(false)}>Create your free account</button>)}
    </>;
  } else if (!FIXTURE && (!ready || preview.isLoading)) {
    // `useAuthReady` is false while signed out, so it only gates the signed-in states.
    content = <div className="page-loading" />;
  } else if (!data) {
    content = <PublicErrorState icon={<Icon name="link" size={24} />} title="This link isn’t working"
      message={preview.error instanceof Error ? preview.error.message : 'Ask your parent for a new one.'} />;
  } else {
    const keptSpan = kept(data.keptFrom, data.keptTo);
    content = <>
      {opening('Turning 13', data.parentFirstName
        ? <><span className="public-shared__mark">{data.parentFirstName}</span> sent you your notebook.</>
        : 'Your notebook is ready to move.')}
      <Notebook name={data.displayName} preferences={data.preferences} fields={[
        { label: 'Notes', value: data.notes ? String(data.notes) : 'None yet' },
        ...(data.highlights ? [{ label: 'Highlights', value: String(data.highlights) }] : []),
        ...(keptSpan ? [{ label: 'Kept', value: keptSpan }] : []),
      ]} />
      <Letter title="Moving it into your account" lines={[
        { icon: 'note-sticky', text: 'Your notes go into My Home, with their folders, tags and Threads.' },
        { icon: 'highlighter', text: 'Your highlights go into your Bible, and Look back becomes Review.' },
        { icon: 'book-open', text: 'Your Family Bible thoughts become notes.' },
        { icon: 'download', text: 'The cover and stickers stay behind. They’re only in child notebooks.' },
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
          <SharedSky />
          <div className="public-shared-host">
            <SubtleContentMount variant="fade">
              <div className="public-shared public-move">
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
