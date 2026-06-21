import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from '@tanstack/react-router';
import { useAuth, useUser } from '@clerk/clerk-react';
import { useQueryClient } from '@tanstack/react-query';
import CardNote from '../../../src/components/react/CardNote';
import CondensedNoteItem from '../../../src/components/react/CondensedNoteItem';
import CardStack from '../components/CardStack';
import SubtleContentMount from '@/components/react/SubtleContentMount';
import { api, APIError } from '../lib/api';
import { useAddSharedThread } from '../hooks/mutations/useAddSharedThread';
import { getThreadGradientCSS } from '../../../src/utils/colors';
import { getRandomHeroImage } from '../utils/random-hero-image';
import type { ThreadDetail, ThreadPrefetchData } from '../hooks/queries/useThread';

interface SharedThreadNote {
  id: string;
  title: string;
  content: string;
  noteType: 'default' | 'scripture' | 'resource';
  scriptureTranslation?: string;
  version?: string;
}

interface SharedThreadResponse {
  thread: {
    id: string;
    title: string;
    subtitle?: string;
    color?: string;
  };
  notes: SharedThreadNote[];
  creator: {
    displayName: string;
    isHarvousOwned?: boolean;
  };
  meta: {
    noteCount: number;
  };
}

export default function SharedThreadPage() {
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
  const heroImage = useMemo(() => getRandomHeroImage(), []);

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
        const color = (colorRaw || 'paper') as string;
        const title = fromApi?.title ?? preview?.title ?? 'Untitled Thread';
        const noteCount =
          fromApi?.noteCount ?? data?.meta?.noteCount ?? data?.notes?.length ?? 0;
        const backgroundGradient =
          fromApi?.backgroundGradient ?? getThreadGradientCSS(color);

        const threadDetail: ThreadDetail = {
          id,
          title,
          color: colorRaw ?? 'paper',
          backgroundGradient,
          noteCount,
          spaceId: fromApi?.spaceId ?? null,
          isPublic: fromApi?.isPublic ?? false,
          ...(user?.id ? { userId: user.id } : {}),
        };

        const prefetch: ThreadPrefetchData = {
          thread: threadDetail,
          noteTypeCounts: undefined,
        };
        queryClient.setQueryData(['thread', id], prefetch);

        const threadForEvent = {
          id,
          title: threadDetail.title,
          color: threadDetail.color,
          spaceId: threadDetail.spaceId,
          noteCount: threadDetail.noteCount,
          isPublic: threadDetail.isPublic,
          backgroundGradient: threadDetail.backgroundGradient,
        };
        const detail = { thread: threadForEvent, threadId: id, spaceId: null as string | null };
        window.dispatchEvent(new CustomEvent('threadCreated', { detail }));
        document.dispatchEvent(new CustomEvent('threadCreated', { detail }));

        try {
          sessionStorage.removeItem('harvous_pending_redirect');
          sessionStorage.removeItem('pendingSharedThreadAdd');
        } catch {
          /* ignore */
        }

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
  }, [
    addSharedThreadMutation,
    data?.meta?.noteCount,
    data?.notes?.length,
    data?.thread,
    navigate,
    queryClient,
    shareToken,
    showToast,
    user?.id,
  ]);

  useEffect(() => {
    api.get<SharedThreadResponse>(`/api/shared/thread/${shareToken}`)
      .then(setData)
      .catch(() => setError('not_found'))
      .finally(() => setIsLoading(false));
  }, [shareToken]);

  // Check for pending action after sign-in redirect
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
        sessionStorage.setItem('pendingSharedThreadAdd', JSON.stringify({
          shareToken,
          timestamp: Date.now(),
        }));
        sessionStorage.setItem('harvous_pending_redirect', window.location.href);
      } catch { /* ignore */ }
      const redirectUrl = encodeURIComponent(window.location.href);
      navigate({ to: `/sign-in?redirect_url=${redirectUrl}` as any });
      return;
    }
    await doAdd();
  };


  const CircleQuestionIcon = () => (
    <svg width="48" height="48" viewBox="0 0 512 512" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <path d="M256 512A256 256 0 1 0 256 0a256 256 0 1 0 0 512zM169.8 165.3c7.9-22.3 29.1-37.3 52.8-37.3h58.3c34.9 0 63.1 28.3 63.1 63.1c0 22.6-12.1 43.5-31.7 54.8L280 264.4c-.2 13-10.9 23.6-24 23.6c-13.3 0-24-10.7-24-24V250.5c0-8.6 4.6-16.5 12.1-20.8l44.3-25.4c4.7-2.7 7.6-7.7 7.6-13.1c0-8.4-6.8-15.1-15.1-15.1H222.6c-3.4 0-6.4 2.1-7.5 5.3l-.4 1.2c-4.4 12.5-18.2 19-30.6 14.6s-19-18.2-14.6-30.6l.4-1.2zM224 352a32 32 0 1 1 64 0 32 32 0 1 1 -64 0z"/>
    </svg>
  );

  const thread = data?.thread;
  const notes = data?.notes || [];
  const creator = data?.creator;
  const threadColor = thread?.color || 'blue';

  return (
    <>
      {data?.thread && <title>{`${data.thread.title || 'Shared Thread'} | Shared Thread`}</title>}
    <div id="shared-thread-content" className="auth-page">
      <div className="auth-page__container">
        <div
          className="auth-page__video-section"
          style={{ backgroundImage: `url(${heroImage})`, backgroundSize: 'cover', backgroundPosition: 'center' }}
        >
          <div className="auth-page__video-overlay" style={{ padding: '20px' }}>
            <a href="https://app.harvous.com" className="auth-page__logo-container">
              <img
                src="/icons/app-icon.png"
                alt="Harvous"
                className="auth-page__logo"
                width={36}
                height={36}
              />
            </a>
          </div>
        </div>

        {/* Right Column: Thread Content */}
        <div className="auth-page__form-section shared-page__content-section">
          <div className="shared-page__content">
            {isLoading ? (
              <div className="page-loading" />
            ) : (error || !thread) ? (
              <div className="shared-page__error">
                <div className="shared-page__error-icon">
                  <CircleQuestionIcon />
                </div>
                <h1 className="shared-page__error-title">This thread isn't available</h1>
                <p className="shared-page__error-message">
                  Hmm, we can't find this thread. The link might have expired or the owner made it private.
                </p>
                <a href="https://app.harvous.com" className="shared-page__error-link">
                  Learn more about Harvous
                </a>
              </div>
            ) : (
              <SubtleContentMount variant="fade">
                <>
                {/* Creator info (above CardStack) */}
                <div className="shared-page__creator">
                  <p>
                    {creator?.isHarvousOwned
                      ? "You're invited to add this thread on Harvous"
                      : `Created by ${creator?.displayName || 'A Harvous User'} on Harvous`}
                  </p>
                </div>

                {/* CardStack with notes and CTA */}
                <div className="shared-page__card-container">
                  <CardStack
                    title={thread.title}
                    headerBgColor={`var(--color-${threadColor})`}
                    centerTitle={true}
                  >
                    {/* Notes list — card-stack__inner-content is the scroll container */}
                    {notes.length === 0 ? (
                      <div className="shared-page__notes-empty">
                        <p>No notes yet. Start adding thoughts as you read.</p>
                      </div>
                    ) : (
                      <div className="shared-page__notes">
                        {notes.map((note, index) => (
                          <div
                            key={note.id}
                            className="shared-page__note-item card-enter"
                            style={{ animationDelay: `${150 + index * 50}ms` }}
                          >
                            {note.noteType === 'scripture' ? (
                              <CondensedNoteItem
                                title={note.title || 'Untitled Note'}
                                noteType="scripture"
                                href="#"
                                noteId={note.id}
                                scriptureTranslation={note.scriptureTranslation ?? note.version ?? undefined}
                              />
                            ) : (
                              <CardNote
                                title={note.title || 'Untitled Note'}
                                content={note.content || ''}
                                noteType={note.noteType}
                                noteId={note.id}
                              />
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* CTA — sticky at bottom of scroll area, margin-top: auto for short lists */}
                    <div className="shared-page__cta-wrapper">
                      <div className={`shared-page__toast shared-page__toast--${toastType}${toastVisible ? ' shared-page__toast--visible' : ''}`}>
                        <span>{toastMessage}</span>
                      </div>
                      {alreadyOwned ? (
                        <button
                          className="btn btn--lg btn--primary shared-page__cta-button"
                          onClick={() => {
                            void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
                            navigate({ to: '/' as any });
                          }}
                        >
                          <div className="btn__content">
                            <span className="shared-page__cta-text">View in my Harvous</span>
                          </div>
                          <div className="btn__shadow-overlay" />
                        </button>
                      ) : (
                        <button
                          className="btn btn--lg btn--primary shared-page__cta-button"
                          onClick={handleAddToHarvous}
                          disabled={addSharedThreadMutation.isPending}
                        >
                          <div className="btn__content">
                            <span className="shared-page__cta-text">
                              {addSharedThreadMutation.isPending ? 'Adding…' : 'Add to my Harvous'}
                            </span>
                          </div>
                          <div className="btn__shadow-overlay" />
                        </button>
                      )}
                    </div>
                  </CardStack>
                </div>

                {/* Footer text (below CardStack) */}
                <div className="shared-page__footer">
                  <p>Harvous is a notes app designed for Bible study.</p>
                  <a href="https://app.harvous.com" target="_blank" rel="noopener noreferrer">Learn more at app.harvous.com</a>
                </div>
              </>
              </SubtleContentMount>
            )}
          </div>
        </div>
      </div>
    </div>
    </>
  );
}
