import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from '@tanstack/react-router';
import { useAuth } from '@clerk/clerk-react';
import CardNote from '../../../src/components/react/CardNote';
import CondensedNoteItem from '../../../src/components/react/CondensedNoteItem';
import CardStack from '../components/CardStack';
import { api, APIError } from '../lib/api';
import { useAddSharedThread } from '../hooks/mutations/useAddSharedThread';

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
          doAdd();
        } else {
          sessionStorage.removeItem('pendingSharedThreadAdd');
        }
      }
    } catch { /* ignore */ }
  }, [isSignedIn, data]);

  function showToast(message: string, type: 'success' | 'error' | 'info', duration = 3000) {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToastMessage(message);
    setToastType(type);
    setToastVisible(true);
    if (duration > 0) {
      toastTimerRef.current = setTimeout(() => setToastVisible(false), duration);
    }
  }

  async function doAdd() {
    try {
      const result = await addSharedThreadMutation.mutateAsync(shareToken);
      if (result.success && result.createdIds?.threadId) {
        showToast('Added to your Harvous!', 'success', 0);
        const id = result.createdIds.threadId;
        const path = id.startsWith('thread_') ? `/thread/${id.slice(7)}` : `/${id}`;
        setTimeout(() => {
          navigate({ to: path as any });
        }, 800);
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
  }

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

  const HarvousLogo = () => (
    <svg width="28" height="40" viewBox="0 0 45 64" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="Harvous">
      <path d="M44.8037 63.9941H0.0078125V0H44.8037V63.9941ZM34.5645 31.168C25.6988 34.2637 18.5024 41.2949 15.3711 50.543L14.2842 53.752H34.5645V31.168ZM10.2471 37.8643C15.8921 29.2487 24.5827 23.0353 34.5645 20.4824V10.2393H10.2471V37.8643Z" fill="#fff"/>
    </svg>
  );

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
        {/* Left Column: Animated Mesh Gradient Background */}
        <div className="auth-page__video-section thread-colors-mesh-gradient">
          <div className="auth-page__video-overlay" style={{ padding: '24px' }}>
            <a href="https://harvous.com" className="auth-page__logo-container">
              <HarvousLogo />
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
                <a href="https://harvous.com" className="shared-page__error-link">
                  Learn more about Harvous
                </a>
              </div>
            ) : (
              <>
                {/* Creator info (above CardStack) */}
                <div className="shared-page__creator">
                  <p>
                    {creator?.isHarvousOwned
                      ? 'A Harvous thread'
                      : `Created by ${creator?.displayName || 'A Harvous User'} on Harvous`}
                  </p>
                </div>

                {/* CardStack with notes and CTA */}
                <div className="shared-page__card-container shared-page__slide-up" style={{ animationDelay: '50ms' }}>
                  <CardStack
                    title={thread.title}
                    headerBgColor={`var(--color-${threadColor})`}
                    centerTitle={true}
                  >
                    {/* Notes list (scrollable) */}
                    <div className="shared-page__notes-scroll">
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
                    </div>

                    {/* CTA wrapper with toast */}
                    <div className="shared-page__cta-wrapper">
                      <div className={`shared-page__toast shared-page__toast--${toastType}${toastVisible ? ' shared-page__toast--visible' : ''}`}>
                        <span>{toastMessage}</span>
                      </div>
                      {alreadyOwned ? (
                        <button
                          className="btn btn--lg btn--primary shared-page__cta-button"
                          onClick={() => navigate({ to: '/' as any })}
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
                  <a href="https://harvous.com" target="_blank" rel="noopener noreferrer">Learn more on harvous.com</a>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
    </>
  );
}
