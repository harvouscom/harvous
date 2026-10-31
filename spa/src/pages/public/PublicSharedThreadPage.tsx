import { haptics } from '@/utils/haptics';
import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate } from '@tanstack/react-router';
import { prototypeHomeRouteTo } from '@/lib/prototype-path';
import { useAuth, useUser } from '@clerk/clerk-react';
import { useQueryClient } from '@tanstack/react-query';
import Icon from '@/components/react/Icon';
import '../../styles/public-shared-thread.css';
import SubtleContentMount from '@/components/react/SubtleContentMount';
import { api } from '../../lib/api';
import { useAddSharedThread } from '../../hooks/mutations/useAddSharedThread';
import { getThreadGradientCSS } from '@/utils/colors';
import type { ThreadDetail, ThreadPrefetchData } from '../../hooks/queries/useThread';
import ProtoReadOnlyNotePaper from '../prototype/ProtoReadOnlyNotePaper';
import { PublicTopBar, PublicSharedCtaBar, PublicSharedFooter } from './public-shared';
import '../../styles/prototype-editor.css';
import '../../styles/public-shared-paper.css';
import { clearPendingAuthRedirect, writePendingAuthRedirect } from '../../lib/pending-auth-redirect';
import { SharedOpening, SharedSky } from './shared-opening';

interface SharedThreadNote {
  id: string;
  title: string;
  content: string;
  noteType: 'default' | 'scripture' | 'resource';
  scriptureTranslation?: string;
  version?: string;
  createdAt?: string;
}

interface SharedThreadResponse {
  thread: { id: string; title: string; subtitle?: string; color?: string };
  notes: SharedThreadNote[];
  creator: { displayName: string; isHarvousOwned?: boolean };
  meta: { noteCount: number };
}

/**
 * The published study plan a share link can also point at.
 *
 * `/api/shared/thread/:token` deliberately refuses any thread in a non-personal
 * space, because a shared room's Thread holds members' own notes and a public
 * page must not list their titles. A *published* plan is the opposite — every
 * step is church-authored material written to be handed out — and it has its own
 * endpoint with its own gate ("did a series publish it"). One link, two shapes,
 * so the page asks for the second when the first says no.
 */
interface SharedThreadPlanResponse {
  plan: { title: string; subtitle: string | null; color: string | null; seriesTitle: string };
  space: { title: string };
  steps: { step: number; title: string; reference: string | null; serviceDate: string | null }[];
  /** Only when the room already has a live invite — this page never mints one. */
  joinToken: string | null;
}

/**
 * The Thread as a manila folder, after the topic folders on heyderekj.com (Derek, Oct 30 2026).
 * The folder carries only the Thread: its name, what it covers, how many notes and when. Up to
 * three notes stand staggered out of the top — the latest in front, the one before it, and the
 * one it started with at the back. Ordered by when each was written, since the server's order
 * differs by Thread kind. Tapping a note opens it under the folder; the count opens them all.
 */
function SharedThreadFolder({
  title,
  subtitle,
  notes,
}: {
  title: string;
  subtitle?: string;
  notes: SharedThreadNote[];
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const byNewest = [...notes].sort(
    (a, b) => (Date.parse(b.createdAt ?? '') || 0) - (Date.parse(a.createdAt ?? '') || 0),
  );
  const count = byNewest.length;
  const oldest = count > 1 ? byNewest[count - 1] : null;
  // Back to front: where it started, the one before the latest, the latest.
  const papers = [oldest, count > 2 ? byNewest[1] : null, byNewest[0]].filter(
    (n): n is SharedThreadNote => Boolean(n),
  );
  const open = openId ? byNewest.find((n) => n.id === openId) ?? null : null;
  const span = [formatFolderDate(oldest?.createdAt), formatFolderDate(byNewest[0]?.createdAt)].filter(Boolean);

  return (
    <>
      <div className="public-paper-stack public-thread-folder" data-papers={papers.length}>
        {papers.map((note) => (
          <button
            key={note.id}
            type="button"
            className="public-thread-folder__paper"
            aria-pressed={openId === note.id}
            onClick={() => setOpenId((cur) => (cur === note.id ? null : note.id))}
          >
            <b>{note.title?.trim() || 'Untitled'}</b>
            <small>
              {note.id === byNewest[0]?.id && count > 1
                ? 'Latest'
                : note.id === oldest?.id
                  ? 'Where it started'
                  : formatFolderDate(note.createdAt)}
            </small>
          </button>
        ))}
        <div className="public-thread-folder__front">
          <span className="public-thread-folder__tab">
            <Icon name="arrow-right-arrow-left" size={12} />
            Thread
          </span>
          <h1 className="public-thread-folder__title">{title}</h1>
          {subtitle ? <p className="public-thread-folder__subtitle">{subtitle}</p> : null}
          {/* Printed on the folder like a file's fields, with the way into all of them beside. */}
          <div className="public-thread-folder__fields">
            <p className="public-thread-folder__field">
              <span>Notes</span>
              <b>{count > 0 ? count : 'None yet'}</b>
            </p>
            {span.length === 2 && span[0] !== span[1] ? (
              <p className="public-thread-folder__field">
                <span>Kept</span>
                <b>{span[0]} – {span[1]}</b>
              </p>
            ) : null}
            {count > 0 ? (
              <button type="button" className="public-thread-folder__all" onClick={() => { setShowAll((v) => !v); setOpenId(null); }}>
                {showAll ? 'Hide the list' : 'See all notes'}
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {open ? (
        <article className="public-thread-reader">
          {/* Back to the list when it was opened from there; otherwise the note just closes. */}
          <button
            type="button"
            className="public-thread-reader__close"
            aria-label={showAll ? 'Back to all notes' : 'Close note'}
            onClick={() => setOpenId(null)}
          >
            <Icon name="xmark" size={14} />
          </button>
          <p className="public-thread-reader__eyebrow">{formatFolderDate(open.createdAt)}</p>
          <h2 className="public-thread-reader__title">{open.title?.trim() || 'Untitled'}</h2>
          <ProtoReadOnlyNotePaper variant="inset" html={open.content || ''} />
        </article>
      ) : showAll ? (
        <ol className="public-thread-reader public-thread-reader--list">
          {byNewest.map((note) => (
            <li key={note.id}>
              <button type="button" onClick={() => setOpenId(note.id)}>
                <b>{note.title?.trim() || 'Untitled'}</b>
                <small>{formatFolderDate(note.createdAt)}</small>
              </button>
            </li>
          ))}
        </ol>
      ) : null}
    </>
  );
}

/** A link that leads nowhere: the same folder, with nothing standing in it. */
function EmptyThreadFolder() {
  return (
    <div className="public-paper-stack public-thread-folder public-thread-folder--empty" data-papers={0}>
      <div className="public-thread-folder__front">
        <span className="public-thread-folder__tab">
          <Icon name="arrow-right-arrow-left" size={12} />
          Thread
        </span>
        <h1 className="public-thread-folder__title">This thread isn&apos;t available</h1>
        <p className="public-thread-folder__subtitle">
          The folder is empty. The link might have expired, or the owner made it private.
        </p>
      </div>
    </div>
  );
}

/**
 * A published study plan as the same folder: the plan on the front, its next three weeks
 * standing out of the top with the coming one in front, every week a tap away. Only the plan's
 * own rows — titles, passages, dates — never what members wrote in their step notes.
 */
function PlanFolder({ plan }: { plan: SharedThreadPlanResponse }) {
  const [showAll, setShowAll] = useState(false);
  const steps = plan.steps;
  const today = localIsoDate(new Date());
  const firstUpcoming = steps.findIndex((s) => s.serviceDate && s.serviceDate >= today);
  // The coming weeks; once a plan is over, its last three.
  const start = firstUpcoming >= 0 ? firstUpcoming : steps.some((s) => s.serviceDate) ? Math.max(0, steps.length - 3) : 0;
  const shown = steps.slice(start, start + 3);
  const papers = [...shown].reverse(); // back to front: furthest first, the coming week last
  const upNextStep = firstUpcoming >= 0 ? steps[firstUpcoming].step : null;
  const dated = steps.filter((s) => s.serviceDate);
  const runs = dated.length > 1 ? `${formatServiceDate(dated[0].serviceDate)} – ${formatServiceDate(dated[dated.length - 1].serviceDate)}` : null;
  const series = plan.plan.subtitle || (plan.plan.seriesTitle !== plan.plan.title ? plan.plan.seriesTitle : null);

  return (
    <>
      <div
        className={`public-paper-stack public-thread-folder public-thread-folder--plan${steps.length === 0 ? ' public-thread-folder--empty' : ''}`}
        data-papers={papers.length}
      >
        {papers.map((step) => (
          <div key={step.step} className="public-thread-folder__paper">
            <b>{step.title}</b>
            <small>{step.step === upNextStep ? 'Up next' : `Week ${step.step}`}</small>
          </div>
        ))}
        <div className="public-thread-folder__front">
          <span className="public-thread-folder__tab">
            <Icon name="calendar" size={12} />
            Study plan
          </span>
          <h1 className="public-thread-folder__title">{plan.plan.title}</h1>
          {series ? <p className="public-thread-folder__subtitle">{series}</p> : null}
          {steps.length === 0 ? (
            <p className="public-thread-folder__subtitle">This plan has no weeks yet.</p>
          ) : (
            <div className="public-thread-folder__fields">
              <p className="public-thread-folder__field">
                <span>Weeks</span>
                <b>{steps.length}</b>
              </p>
              {runs ? (
                <p className="public-thread-folder__field">
                  <span>Runs</span>
                  <b>{runs}</b>
                </p>
              ) : null}
              <button type="button" className="public-thread-folder__all" onClick={() => setShowAll((v) => !v)}>
                {showAll ? 'Hide the weeks' : 'See all weeks'}
              </button>
            </div>
          )}
        </div>
      </div>

      {showAll ? (
        <ol className="public-thread-reader public-thread-reader--weeks">
          {steps.map((step) => (
            <li key={step.step} data-next={step.step === upNextStep ? 'true' : undefined}>
              <span className="public-thread-reader__week">Week {step.step}</span>
              <b>{step.title}</b>
              {step.reference || step.serviceDate ? (
                <small>
                  {[step.reference, step.serviceDate ? formatServiceDate(step.serviceDate) : null].filter(Boolean).join(' · ')}
                </small>
              ) : null}
            </li>
          ))}
        </ol>
      ) : null}

      {/*
        Offered only when the room already has a live invite. This page never mints one —
        who may join is the room's decision, not a consequence of a stranger loading a URL.
      */}
      {plan.joinToken ? (
        <div className="public-shared__cta-bar">
          <div className="public-shared__cta-inner">
            <a className="public-cta-btn proto-ink-on-accent" href={`/spaces/join/${encodeURIComponent(plan.joinToken)}`}>
              Join {plan.space.title}
            </a>
          </div>
        </div>
      ) : null}
    </>
  );
}

/** Today as YYYY-MM-DD in the reader's own day, to compare with a plan's service dates. */
function localIsoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** A service date (YYYY-MM-DD, a calendar day, not an instant) as "Nov 2". */
function formatServiceDate(iso: string | null): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  const sameYear = y === new Date().getFullYear();
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
}

function formatFolderDate(iso?: string): string {
  const t = Date.parse(iso ?? '');
  if (!t) return '';
  const d = new Date(t);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) });
}

export default function PublicSharedThreadPage() {
  const { shareToken } = useParams({ from: '/shared/thread/$shareToken' });
  const { isSignedIn } = useAuth();
  const { user } = useUser();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [data, setData] = useState<SharedThreadResponse | null>(null);
  const [plan, setPlan] = useState<SharedThreadPlanResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const addSharedThreadMutation = useAddSharedThread();
  const [toastMessage, setToastMessage] = useState('');
  const [toastType, setToastType] = useState<'success' | 'error' | 'info'>('success');
  const [toastVisible, setToastVisible] = useState(false);
  const [alreadyOwned, setAlreadyOwned] = useState(false);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ogCapture =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('ogCapture') === '1';

  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info', duration = 3000) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToastMessage(message);
    setToastType(type);
    setToastVisible(true);
    if (duration > 0) {
      toastTimerRef.current = setTimeout(() => setToastVisible(false), duration);
    }
  }, []);

  const doAdd = useCallback(async () => {
    try {
      const result = await addSharedThreadMutation.mutateAsync(shareToken);
      if (result.success && result.createdIds?.threadId) {
        haptics.success();
        showToast('Added to your Harvous!', 'success', 0);
        const id = result.createdIds.threadId;
        const path = id.startsWith('thread_') ? `/thread/${id.slice(7)}` : `/${id}`;
        const preview = data?.thread;
        const fromApi = result.thread;
        const colorRaw = fromApi?.color ?? preview?.color ?? 'paper';
        const threadDetail: ThreadDetail = {
          id,
          title: fromApi?.title ?? preview?.title ?? 'Untitled Thread',
          color: colorRaw ?? 'paper',
          backgroundGradient: fromApi?.backgroundGradient ?? getThreadGradientCSS(colorRaw),
          noteCount: fromApi?.noteCount ?? data?.meta?.noteCount ?? data?.notes?.length ?? 0,
          spaceId: fromApi?.spaceId ?? null,
          isPublic: fromApi?.isPublic ?? false,
          ...(user?.id ? { userId: user.id } : {}),
        };
        const prefetch: ThreadPrefetchData = { thread: threadDetail, noteTypeCounts: undefined };
        queryClient.setQueryData(['thread', id], prefetch);
        window.dispatchEvent(new CustomEvent('threadCreated', { detail: { thread: threadDetail, threadId: id, spaceId: null } }));
        document.dispatchEvent(new CustomEvent('threadCreated', { detail: { thread: threadDetail, threadId: id, spaceId: null } }));
        clearPendingAuthRedirect();
        try {
          sessionStorage.removeItem('pendingSharedThreadAdd');
        } catch { /* ignore */ }
        navigate({ to: path as any });
      }
    } catch (err: any) {
      const msg = err?.message || '';
      if (msg.includes('Already in your Harvous') || msg.includes('already')) {
        setAlreadyOwned(true);
        showToast('This thread is already in your Harvous', 'info', 0);
      } else {
        showToast('Failed to add thread. Please try again.', 'error');
      }
    }
  }, [addSharedThreadMutation, data, navigate, queryClient, shareToken, showToast, user?.id]);

  useEffect(() => {
    let cancelled = false;
    api.get<SharedThreadResponse>(`/api/shared/thread/${shareToken}`)
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch(() =>
        /* Not an error yet: the same token may be a published study plan, which
           the ordinary endpoint refuses by design. Ask the plan endpoint before
           telling anyone the link is dead. */
        api
          .get<SharedThreadPlanResponse>(`/api/shared/thread-plan/${shareToken}`)
          .then((res) => {
            if (!cancelled) setPlan(res);
          })
          .catch(() => {
            if (!cancelled) setError('not_found');
          }),
      )
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [shareToken]);

  useEffect(() => {
    if (!isSignedIn || !data) return;
    try {
      const pendingStr = sessionStorage.getItem('pendingSharedThreadAdd');
      if (pendingStr) {
        const pending = JSON.parse(pendingStr);
        if (pending.shareToken === shareToken && (Date.now() - pending.timestamp) < 600000) {
          sessionStorage.removeItem('pendingSharedThreadAdd');
          void doAdd();
        } else {
          sessionStorage.removeItem('pendingSharedThreadAdd');
        }
      }
    } catch { /* ignore */ }
  }, [isSignedIn, data, shareToken, doAdd]);

  const handleAddToHarvous = async () => {
    if (!isSignedIn) {
      try {
        sessionStorage.setItem('pendingSharedThreadAdd', JSON.stringify({ shareToken, timestamp: Date.now() }));
      } catch { /* ignore */ }
      writePendingAuthRedirect(window.location.href);
      navigate({ to: `/sign-in?redirect_url=${encodeURIComponent(window.location.href)}` as any });
      return;
    }
    await doAdd();
  };

  const thread = data?.thread;
  const notes = data?.notes || [];
  const creator = data?.creator;

  const ctaBar = thread && !plan && !error ? (
    <PublicSharedCtaBar
      toast={{ message: toastMessage, type: toastType, visible: toastVisible }}
      alreadyOwned={alreadyOwned}
      pending={addSharedThreadMutation.isPending}
      onAdd={handleAddToHarvous}
      onView={() => {
        void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
        navigate({ to: prototypeHomeRouteTo() });
      }}
    />
  ) : null;

  return (
    <>
      {thread && <title>{`${thread.title || 'Shared Thread'} | Harvous`}</title>}
      <div
        className={`public-page public-page--shared${ogCapture ? ' public-page--og-capture' : ''}`}
      >
        <PublicTopBar isSignedIn={!!isSignedIn} />

        <div className="public-body">
          <SharedSky />
          <div className={isLoading ? 'public-content' : 'public-shared-host'}>
            {isLoading ? (
              <div className="page-loading" />
            ) : plan ? (
              /*
                A published study plan. Deliberately the plan and nothing else:
                each week's title and passage, which came from the church's own
                plan rows rather than from anyone's step notes. Nothing a member
                wrote is on this page, which is what lets it be public at all.
              */
              <SubtleContentMount variant="fade">
                <div className="public-shared">
                  {/* The series is the plan's own detail, so it is printed on the folder. */}
                  <SharedOpening name={plan.space.title} kind="plan" eyebrow="Studying together" />
                  <PlanFolder plan={plan} />
                  <PublicSharedFooter />
                </div>
              </SubtleContentMount>
            ) : (error || !thread) ? (
              <SubtleContentMount variant="fade">
                <div className="public-shared">
                  <EmptyThreadFolder />
                  <PublicSharedFooter />
                </div>
              </SubtleContentMount>
            ) : (
              <SubtleContentMount variant="fade">
                <div className="public-shared">
                  <SharedOpening
                    name={creator?.isHarvousOwned ? 'Harvous' : creator?.displayName || 'A Harvous reader'}
                    kind="thread"
                  />

                  <SharedThreadFolder title={thread.title} subtitle={thread.subtitle} notes={notes} />

                  {/* The add floats over the folder and comes to rest on its bottom edge. */}
                  {ctaBar}

                  <PublicSharedFooter />
                </div>
              </SubtleContentMount>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
