import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from '@tanstack/react-router';
import { useAuth } from '@clerk/clerk-react';
import CardStack from '../components/CardStack';
import CondensedNoteItem from '../../../src/components/react/CondensedNoteItem';
import { api } from '../lib/api';
import { idToUrl } from '../../../src/utils/url-helpers';

interface SpacePreview {
  id: string;
  title: string;
  color?: string;
  backgroundGradient?: string;
  ownerDisplayName: string;
  ownerColor?: string;
  memberCount: number;
  noteCount: number;
  isAlreadyMember: boolean;
  notes?: Array<{ id: string; title: string; noteType: string }>;
  threads?: Array<{ id: string; title: string; color: string; noteCount: number }>;
}

/** Matches GET /api/spaces/join-preview/:token response. */
interface JoinPreviewResponse {
  space: {
    id: string;
    title: string;
    color?: string;
    backgroundGradient?: string;
    description?: string;
  };
  owner: { displayName: string; profileImageUrl?: string | null } | null;
  memberCount: number;
  threadPreviews: Array<{ id: string; title: string; color: string; noteCount: number }>;
  notePreviews: Array<{ id: string; title: string; noteType: string; createdAt?: string }>;
  isAlreadyMember: boolean;
}

export default function JoinSpacePage() {
  const { token } = useParams({ from: '/spaces/join/$token' });
  const { isSignedIn } = useAuth();
  const navigate = useNavigate();
  const [space, setSpace] = useState<SpacePreview | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isJoining, setIsJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState('');
  const [toastType, setToastType] = useState<'success' | 'error'>('error');
  const [toastVisible, setToastVisible] = useState(false);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    api
      .get<JoinPreviewResponse>(`/api/spaces/join-preview/${token}`)
      .then((res) => {
        const normalized: SpacePreview = {
          ...res.space,
          ownerDisplayName: res.owner?.displayName ?? 'Anonymous',
          memberCount: res.memberCount,
          noteCount: res.notePreviews?.length ?? 0,
          isAlreadyMember: res.isAlreadyMember,
          notes: res.notePreviews,
          threads: res.threadPreviews,
        };
        setSpace(normalized);
      })
      .catch(() => setError('invalid'))
      .finally(() => setIsLoading(false));
  }, [token]);

  useEffect(() => {
    if (space) {
      document.title = `${space.title || 'Join Space'} | Join Space`;
    }
  }, [space]);

  function showToast(message: string, type: 'success' | 'error', duration = 5000) {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToastMessage(message);
    setToastType(type);
    setToastVisible(true);
    if (duration > 0) {
      toastTimerRef.current = setTimeout(() => setToastVisible(false), duration);
    }
  }

  const handleJoin = async () => {
    if (!isSignedIn) {
      try {
        sessionStorage.setItem('harvous_pending_redirect', window.location.href);
      } catch { /* ignore */ }
      navigate({ to: `/sign-in?redirect_url=${encodeURIComponent(window.location.href)}` as any });
      return;
    }
    setIsJoining(true);
    try {
      const result = await api.post<{ success: boolean; spaceId: string; redirectUrl: string }>(
        `/api/spaces/join/${token}`,
        {}
      );
      if (result.success) {
        try {
          sessionStorage.setItem('harvous_show_pwa_prompt_from_join', '1');
        } catch (_) {}
        const path = result.redirectUrl || idToUrl(result.spaceId);
        navigate({ to: path as any });
      }
    } catch (err: any) {
      showToast(err?.message || 'Failed to join space. Please try again.', 'error');
    } finally {
      setIsJoining(false);
    }
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

  const spaceColor = space?.color || 'paper';
  const spaceUrl = space ? idToUrl(space.id) : '';

  return (
    <div id="shared-space-content" className="auth-page" style={{ padding: '12px', minHeight: '100vh' }}>
      <div className="auth-page__container">
        {/* Left Column: Animated Mesh Gradient Background */}
        <div className="auth-page__video-section thread-colors-mesh-gradient">
          <div className="auth-page__video-overlay" style={{ padding: '24px' }}>
            <a href="https://harvous.com" className="auth-page__logo-container">
              <HarvousLogo />
            </a>
          </div>
        </div>

        {/* Right Column: Space Content */}
        <div className="auth-page__form-section shared-page__content-section">
          <div className="shared-page__content">
            {isLoading ? (
              <div className="page-loading" />
            ) : (error || !space) ? (
              <div className="shared-page__error">
                <div className="shared-page__error-icon">
                  <CircleQuestionIcon />
                </div>
                <h1 className="shared-page__error-title">This space isn't available</h1>
                <p className="shared-page__error-message">
                  Hmm, we can't find this space. The link might have expired or the owner made it private.
                </p>
                <a href="https://harvous.com" className="shared-page__error-link">
                  Learn more about Harvous
                </a>
              </div>
            ) : (
              <>
                {/* Owner info (above CardStack) */}
                <div className="shared-page__creator shared-page__fade-in" style={{ animationDelay: '0ms' }}>
                  <p>{space.ownerDisplayName || 'A Harvous User'} invited you to join this space on Harvous</p>
                </div>

                {/* CardStack with space content */}
                <div className="shared-page__card-container shared-page__slide-up" style={{ animationDelay: '50ms' }}>
                  <CardStack
                    title={space.title}
                    headerBgColor={`var(--color-${spaceColor})`}
                    centerTitle={true}
                  >
                    {/* Notes and Threads list (scrollable) */}
                    <div className="shared-page__notes-scroll">
                      {/* People count */}
                      <div className="shared-page__people-count">
                        <span>{space.memberCount} {space.memberCount === 1 ? 'person' : 'people'} in this space</span>
                      </div>

                      {(!space.notes?.length && !space.threads?.length) ? (
                        <div className="shared-page__notes-empty">
                          <p>No notes yet. Join to get started.</p>
                        </div>
                      ) : (
                        <div className="shared-page__notes">
                          {/* Threads */}
                          {space.threads?.map((thread, index) => (
                            <div
                              key={thread.id}
                              className="shared-page__thread-item card-enter"
                              style={{ animationDelay: `${150 + index * 50}ms` }}
                            >
                              <div className="condensed-thread-item">
                                <div
                                  className="condensed-thread-item__accent"
                                  style={{ backgroundColor: `var(--color-${thread.color || 'blue'})` }}
                                />
                                <div className="condensed-thread-item__content">
                                  <div className="condensed-thread-item__icon">
                                    <svg fill="currentColor" viewBox="0 0 576 512">
                                      <path d="M264.5 5.2c14.9-6.9 32.1-6.9 47 0l218.6 101c8.5 3.9 13.9 12.4 13.9 21.8s-5.4 17.9-13.9 21.8l-218.6 101c-14.9 6.9-32.1 6.9-47 0L45.9 149.8C37.4 145.8 32 137.3 32 128s5.4-17.9 13.9-21.8L264.5 5.2zM476.9 209.6l53.2 24.6c8.5 3.9 13.9 12.4 13.9 21.8s-5.4 17.9-13.9 21.8l-218.6 101c-14.9 6.9-32.1 6.9-47 0L45.9 277.8C37.4 273.8 32 265.3 32 256s5.4-17.9 13.9-21.8l53.2-24.6 152 70.2c23.4 10.8 50.4 10.8 73.8 0l152-70.2zm-152 198.2l152-70.2 53.2 24.6c8.5 3.9 13.9 12.4 13.9 21.8s-5.4 17.9-13.9 21.8l-218.6 101c-14.9 6.9-32.1 6.9-47 0L45.9 405.8C37.4 401.8 32 393.3 32 384s5.4-17.9 13.9-21.8l53.2-24.6 152 70.2c23.4 10.8 50.4 10.8 73.8 0z"/>
                                    </svg>
                                  </div>
                                  <span className="condensed-thread-item__title">{thread.title}</span>
                                  {thread.noteCount > 0 && (
                                    <div className="badge-count" style={{ flexShrink: 0 }}>
                                      <span className="badge-number">{thread.noteCount > 99 ? '99+' : thread.noteCount}</span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}

                          {/* Notes */}
                          {space.notes?.map((note, index) => (
                            <div
                              key={note.id}
                              className="shared-page__note-item card-enter"
                              style={{ animationDelay: `${150 + ((space.threads?.length || 0) + index) * 50}ms` }}
                            >
                              <CondensedNoteItem
                                title={note.title || 'Untitled Note'}
                                noteType={note.noteType as any || 'default'}
                                href="#"
                                noteId={note.id}
                              />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* CTA Button wrapper with toast */}
                    <div className="shared-page__cta-wrapper">
                      <div className={`shared-page__toast shared-page__toast--${toastType}${toastVisible ? ' shared-page__toast--visible' : ''}`}>
                        <span>{toastMessage}</span>
                      </div>

                      {!isSignedIn ? (
                        <a
                          href={`/sign-in?redirect_url=${encodeURIComponent(window.location.href)}`}
                          className="btn btn--lg btn--primary shared-page__cta-button"
                          onClick={() => {
                            try { sessionStorage.setItem('harvous_pending_redirect', window.location.href); } catch { /* ignore */ }
                          }}
                        >
                          <div className="btn__content">
                            <span className="shared-page__cta-text">Join this space on Harvous</span>
                          </div>
                          <div className="btn__shadow-overlay" />
                        </a>
                      ) : space.isAlreadyMember ? (
                        <button
                          className="btn btn--lg btn--primary shared-page__cta-button"
                          onClick={() => navigate({ to: spaceUrl as any })}
                        >
                          <div className="btn__content">
                            <span className="shared-page__cta-text">Go to Space</span>
                          </div>
                          <div className="btn__shadow-overlay" />
                        </button>
                      ) : (
                        <button
                          id="join-space-btn"
                          className="btn btn--lg btn--primary shared-page__cta-button"
                          onClick={handleJoin}
                          disabled={isJoining}
                        >
                          <div className="btn__content">
                            <span className="shared-page__cta-text">
                              {isJoining ? 'Joining…' : 'Join this space on Harvous'}
                            </span>
                          </div>
                          <div className="btn__shadow-overlay" />
                        </button>
                      )}
                    </div>
                  </CardStack>
                </div>

                {/* Footer text (below CardStack) */}
                <div className="shared-page__footer shared-page__fade-in" style={{ animationDelay: '200ms' }}>
                  <p>Harvous is a notes app designed for Bible study.</p>
                  <a href="https://harvous.com" target="_blank" rel="noopener noreferrer">Learn more on harvous.com</a>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
