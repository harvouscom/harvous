import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate } from '@tanstack/react-router';
import { prototypeHomeRouteTo } from '@/lib/prototype-path';
import { useAuth, useUser } from '@clerk/clerk-react';
import { useQueryClient } from '@tanstack/react-query';
import CondensedNoteItem from '@/components/react/CondensedNoteItem';
import CardNote from '@/components/react/CardNote';
import SubtleContentMount from '@/components/react/SubtleContentMount';
import { api } from '../../lib/api';
import { useAddSharedThread } from '../../hooks/mutations/useAddSharedThread';
import { getThreadGradientCSS } from '@/utils/colors';
import type { ThreadDetail, ThreadPrefetchData } from '../../hooks/queries/useThread';
import { PublicTopBar, PublicErrorState } from './public-shared';
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

export default function PublicSharedThreadPage() {
  const { shareToken } = useParams({ from: '/shared/thread/$shareToken' });
  const { isSignedIn } = useAuth();
  const { user } = useUser();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [data, setData] = useState<SharedThreadResponse | null>(null);
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
    api.get<SharedThreadResponse>(`/api/shared/thread/${shareToken}`)
      .then(setData)
      .catch(() => setError('not_found'))
      .finally(() => setIsLoading(false));
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
  const threadColor = thread?.color || 'blue';

  const colorVar = `var(--color-${threadColor})`;

  return (
    <>
      {thread && <title>{`${thread.title || 'Shared Thread'} | Harvous`}</title>}
      <div className={`public-page${ogCapture ? ' public-page--og-capture' : ''}`}>
        <PublicTopBar isSignedIn={!!isSignedIn} />

        <div className="public-body">
          <div className="public-content">
            {isLoading ? (
              <div className="page-loading" />
            ) : (error || !thread) ? (
              <PublicErrorState
                title="This thread isn't available"
                message="Hmm, we can't find this thread. The link might have expired or the owner made it private."
              />
            ) : (
              <SubtleContentMount variant="fade">
                <>
                  <p className="public-creator">
                    {creator?.isHarvousOwned
                      ? "You're invited to add this thread on Harvous"
                      : `Created by ${creator?.displayName || 'A Harvous User'} on Harvous`}
                  </p>

                  <div className="public-card">
                    <div className="public-card__color-stripe" style={{ background: colorVar }} />
                    <div className="public-card__header">
                      <h1 className="public-card__title">{thread.title}</h1>
                      {thread.subtitle && <p className="public-card__meta">{thread.subtitle}</p>}
                    </div>

                    <div className="public-card__scroll">
                      {notes.length === 0 ? (
                        <div className="public-card__empty">No notes yet. Add this thread to start studying.</div>
                      ) : (
                        <ul className="public-card__list">
                          {notes.map((note, index) => (
                            <li
                              key={note.id}
                              className="public-card__list-item card-enter"
                              style={{ animationDelay: `${100 + index * 40}ms` }}
                            >
                              {note.noteType === 'scripture' ? (
                                <CondensedNoteItem
                                  title={note.title || 'Untitled'}
                                  noteType="scripture"
                                  href="#"
                                  noteId={note.id}
                                  scriptureTranslation={note.scriptureTranslation ?? note.version ?? undefined}
                                />
                              ) : (
                                <CardNote
                                  title={note.title || 'Untitled'}
                                  content={note.content || ''}
                                  noteType={note.noteType}
                                  noteId={note.id}
                                />
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                    <div className="public-card__cta">
                      <div
                        className={`public-toast public-toast--${toastType}${toastVisible ? ' public-toast--visible' : ''}`}
                        style={{ textAlign: 'center', justifyContent: 'center' }}
                      >
                        {toastMessage}
                      </div>
                      {alreadyOwned ? (
                        <button
                          className="public-cta-btn"
                          onClick={() => {
                            void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
                            navigate({ to: prototypeHomeRouteTo() });
                          }}
                        >
                          View in my Harvous
                        </button>
                      ) : (
                        <button
                          className="public-cta-btn"
                          onClick={handleAddToHarvous}
                          disabled={addSharedThreadMutation.isPending}
                        >
                          {addSharedThreadMutation.isPending ? 'Adding…' : 'Add to my Harvous'}
                        </button>
                      )}
                    </div>
                  </div>

                  <p className="public-footer">
                    Harvous is a notes app for Bible study.{' '}
                    <a href="https://harvous.com" target="_blank" rel="noopener noreferrer">harvous.com</a>
                  </p>
                </>
              </SubtleContentMount>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
