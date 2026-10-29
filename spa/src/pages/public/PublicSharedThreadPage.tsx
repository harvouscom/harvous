import { colorTokenVar } from '@/utils/space-cover';
import { haptics } from '@/utils/haptics';
import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate } from '@tanstack/react-router';
import { prototypeHomeRouteTo } from '@/lib/prototype-path';
import { useAuth, useUser } from '@clerk/clerk-react';
import { useQueryClient } from '@tanstack/react-query';
import { stripHtmlForPreview } from '@/utils/html-stripper';
import Icon from '@/components/react/Icon';
import '../../styles/public-shared-thread.css';
import SubtleContentMount from '@/components/react/SubtleContentMount';
import { api } from '../../lib/api';
import { useAddSharedThread } from '../../hooks/mutations/useAddSharedThread';
import { getThreadGradientCSS } from '@/utils/colors';
import type { ThreadDetail, ThreadPrefetchData } from '../../hooks/queries/useThread';
import ProtoReadOnlyNotePaper from '../prototype/ProtoReadOnlyNotePaper';
import { PublicTopBar, PublicErrorState, PublicSharedCtaBar, PublicSharedFooter } from './public-shared';
import '../../styles/prototype-editor.css';
import '../../styles/public-shared-paper.css';
import { clearPendingAuthRedirect, writePendingAuthRedirect } from '../../lib/pending-auth-redirect';

interface SharedThreadNote {
  id: string;
  title: string;
  content: string;
  noteType: 'default' | 'scripture' | 'resource';
  scriptureTranslation?: string;
  version?: string;
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
 * One note on the Thread's trail, the way the app reads a Thread: a dot on a spine, the title,
 * and the opening lines — not a card per note. A passage leads with its reference and
 * translation; a link says it is one. Tapping a row opens the whole note in place, on the
 * same paper the app reads it on: the share already carries every note's body, and a list of
 * first lines with nothing behind them was a table of contents for a book you couldn't open.
 */
function SharedThreadTrailRow({
  note,
  index,
  open,
  onToggle,
}: {
  note: SharedThreadNote;
  index: number;
  open: boolean;
  onToggle: () => void;
}) {
  const preview = stripHtmlForPreview(note.content || '', 180).trim();
  const translation = note.scriptureTranslation ?? note.version ?? null;
  const kind =
    note.noteType === 'scripture' ? 'scripture' : note.noteType === 'resource' ? 'resource' : 'note';
  return (
    <li
      className={`public-thread-trail__item public-thread-trail__item--${kind} card-enter`}
      data-open={open ? 'true' : undefined}
      style={{ animationDelay: `${100 + index * 40}ms` }}
    >
      <span className="public-thread-trail__orb" aria-hidden />
      <div className="public-thread-trail__text">
        <button type="button" className="public-thread-trail__toggle" aria-expanded={open} onClick={onToggle}>
          <span className="public-thread-trail__title">
            {note.title?.trim() || 'Untitled'}
            {kind === 'scripture' && translation ? (
              <span className="public-thread-trail__badge">{translation}</span>
            ) : null}
            {kind === 'resource' ? <span className="public-thread-trail__badge">Link</span> : null}
          </span>
          {preview && !open ? <span className="public-thread-trail__preview">{preview}</span> : null}
          <span className="public-thread-trail__more">{open ? 'Show less' : 'Read note'}</span>
        </button>
        {open ? (
          <div className="public-thread-trail__note">
            <ProtoReadOnlyNotePaper variant="inset" html={note.content || ''} />
          </div>
        ) : null}
      </div>
    </li>
  );
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
  const [openNoteId, setOpenNoteId] = useState<string | null>(null);
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

  /* A personal Thread has no colour of its own ('paper'), and a beige rule over a white card
     read as a smudge rather than an accent — so the stripe is for Threads that chose one. */
  const hasThreadColor = Boolean(thread?.color && thread.color !== 'paper');
  const colorVar = colorTokenVar(thread?.color, 'blue');
  const noteCount = data?.meta?.noteCount ?? notes.length;

  return (
    <>
      {thread && <title>{`${thread.title || 'Shared Thread'} | Harvous`}</title>}
      <div
        className={`public-page${plan ? '' : ' public-page--shared'}${ogCapture ? ' public-page--og-capture' : ''}`}
      >
        <PublicTopBar isSignedIn={!!isSignedIn} />

        <div className="public-body">
          <div className={plan || !thread || error ? 'public-content' : 'public-shared-host'}>
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
                <>
                  <p className="public-creator">
                    A study plan from {plan.space.title}
                  </p>

                  <div className="public-card">
                    <div
                      className="public-card__color-stripe"
                      style={{ background: colorTokenVar(plan.plan.color, 'blue') }}
                    />
                    <div className="public-card__header">
                      <h1 className="public-card__title">{plan.plan.title}</h1>
                      <p className="public-card__meta">
                        {plan.plan.subtitle || plan.plan.seriesTitle}
                      </p>
                    </div>

                    <div className="public-card__scroll">
                      {plan.steps.length === 0 ? (
                        <div className="public-card__empty">
                          This plan has no weeks yet.
                        </div>
                      ) : (
                        <ul className="public-card__list">
                          {plan.steps.map((step, index) => (
                            <li
                              key={step.step}
                              className="public-card__list-item card-enter"
                              style={{ animationDelay: `${100 + index * 40}ms` }}
                            >
                              <div className="public-plan-step">
                                <span className="public-plan-step__number">{step.step}</span>
                                <span className="public-plan-step__title">{step.title}</span>
                                {step.reference ? (
                                  <span className="public-plan-step__reference">{step.reference}</span>
                                ) : null}
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                    {/*
                      Offered only when the room already has a live invite. This
                      page never mints one — who may join is the room's decision,
                      not a consequence of a stranger loading a URL.
                    */}
                    {plan.joinToken ? (
                      <a
                        className="public-card__cta"
                        href={`/spaces/join/${encodeURIComponent(plan.joinToken)}`}
                      >
                        Join {plan.space.title}
                      </a>
                    ) : null}
                  </div>
                </>
              </SubtleContentMount>
            ) : (error || !thread) ? (
              <PublicErrorState
                title="This thread isn't available"
                message="Hmm, we can't find this thread. The link might have expired or the owner made it private."
              />
            ) : (
              <SubtleContentMount variant="fade">
                <div className="public-shared">
                  <p className="public-creator public-shared__byline">
                    {creator?.isHarvousOwned
                      ? 'A thread from Harvous'
                      : `A thread from ${creator?.displayName || 'a Harvous reader'}`}
                  </p>

                  <div className="public-paper-stack public-shared__stack">
                    <div className="public-paper-stack__leaf public-paper-stack__leaf--back" aria-hidden />
                    <div className="public-paper-stack__leaf public-paper-stack__leaf--mid" aria-hidden />
                    <div className="public-shared__sheet public-shared__sheet--thread">
                      {hasThreadColor ? (
                        <div className="public-card__color-stripe" style={{ background: colorVar }} />
                      ) : null}
                      {/* The Thread's own tile — the glyph the app draws on every Thread card —
                          beside its name, so the page says what it is before a word is read. */}
                      <div className="public-thread-head">
                        <span className="public-thread-head__icon" aria-hidden>
                          <Icon name="arrow-right-arrow-left" size={18} />
                        </span>
                        <div className="public-thread-head__text">
                          <h1 className="public-card__title">{thread.title}</h1>
                          <p className="public-card__meta">
                            Thread · {noteCount} {noteCount === 1 ? 'note' : 'notes'}
                            {thread.subtitle ? ` · ${thread.subtitle}` : ''}
                          </p>
                        </div>
                      </div>

                      {notes.length === 0 ? (
                        <div className="public-card__empty">No notes yet. Add this thread to start studying.</div>
                      ) : (
                        <ol className="public-thread-trail">
                          {notes.map((note, index) => (
                            <SharedThreadTrailRow
                              key={note.id}
                              note={note}
                              index={index}
                              open={openNoteId === note.id}
                              onToggle={() => setOpenNoteId((id) => (id === note.id ? null : note.id))}
                            />
                          ))}
                        </ol>
                      )}
                    </div>
                  </div>

                  <PublicSharedFooter />
                </div>
              </SubtleContentMount>
            )}
          </div>
        </div>

        {thread && !plan && !error ? (
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
        ) : null}
      </div>
    </>
  );
}
